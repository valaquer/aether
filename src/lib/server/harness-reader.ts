import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { emitEvent, type AetherEvent } from "./events";
import {
	getActiveRoomsForTeammate,
	getHarnessState,
	setHarnessState,
	saveMessage,
} from "./aether-db";

const OPENCODE_DB = "/Users/deepak-macmini/.local/share/opencode/opencode.db";
const CLAUDE_PROJECTS_DIR = "/Users/deepak-macmini/.claude/projects";
const CLAUDE_MINI_PROJECTS_DIR = "/Users/deepak-macmini/honeybloom/.claude-mini/projects";
const CLAUDE_PROJECT_PREFIXES = ["-Users-deepak-macmini-honeybloom-", "-Users-d-patnaik-honeybloom-"];

const CREDENTIAL_PATTERNS = [
	/auth\.json/,
	/\.env/,
	/\.pem/,
	/\.p12/,
	/tokens\//,
	/\.keys/,
	/[A-Za-z0-9+/]{40,}(?:={0,2})/,
];

function redactCredentials(text: string): string {
	let result = text;
	for (const pattern of CREDENTIAL_PATTERNS) {
		result = result.replace(pattern, "[credential redacted]");
	}
	return result;
}

function getTeammateName(directory: string): string {
	return directory.split("/").pop() || "";
}

function getActiveSessions(db: Database.Database): Map<string, string> {
	const rows = db
		.prepare(
			"SELECT s.id, s.directory FROM session s WHERE s.directory LIKE '%/honeybloom/%' ORDER BY s.time_created DESC"
		)
		.all() as { id: string; directory: string }[];
	const latest = new Map<string, string>();
	for (const row of rows) {
		if (!latest.has(row.directory)) {
			latest.set(row.directory, row.id);
		}
	}
	return latest;
}

const JUNK_PHRASES_FILE = "/Users/deepak-macmini/honeybloom/library/aether/junk-phrases.md";

function loadJunkPhrases(): { exact: string[]; prefix: string[] } {
	try {
		const lines = fs
			.readFileSync(JUNK_PHRASES_FILE, "utf-8")
			.split("\n")
			.map((l) => l.trim().toLowerCase())
			.filter((l) => l.length > 0);
		const exact: string[] = [];
		const prefix: string[] = [];
		for (const line of lines) {
			if (line.endsWith("...")) {
				prefix.push(line.slice(0, -3).replace(/[.!?…]+$/, ""));
			} else {
				exact.push(line.replace(/[.!?…]+$/, ""));
			}
		}
		return { exact, prefix };
	} catch {
		return { exact: [], prefix: [] };
	}
}

function isJunkSentence(sentence: string, phrases: { exact: string[]; prefix: string[] }): boolean {
	const trimmed = sentence
		.trim()
		.toLowerCase()
		.replace(/[.!?…]+$/, "");
	if (!trimmed) return true;
	if (phrases.exact.includes(trimmed)) return true;
	for (const p of phrases.prefix) {
		if (trimmed.startsWith(p)) return true;
	}
	return false;
}

function applyJunkFilter(text: string): string {
	const phrases = loadJunkPhrases();
	const sentences = text.split(/(?<=\.)\s+|\n+/).filter((s) => s.trim());
	const result = sentences.filter((s) => !isJunkSentence(s, phrases));
	return result.join("\n");
}

function emitTextResponse(
	part: Record<string, unknown>,
	teammate: string,
	createdAt: string
): void {
	const text = String(part.text || "");
	if (!text.trim()) return;
	const id = `harness-text-${teammate}-${createdAt}-${Math.random().toString(36).slice(2)}`;
	const cleaned = redactCredentials(text);
	const filtered = applyJunkFilter(cleaned);
	if (!filtered.trim()) return;
	const activeRooms = getActiveRoomsForTeammate(teammate);
	for (const room of activeRooms) {
		const roomId = `${id}-${room}`;
		saveMessage({
			id: roomId,
			conversationId: room,
			sender: teammate,
			content: filtered,
			createdAt,
			type: "response",
		});
		const event: AetherEvent = {
			type: "message" as const,
			id: roomId,
			conversationId: room,
			sender: teammate,
			content: filtered,
			timestamp: createdAt,
			response: true,
		};
		emitEvent(event);
	}
}

let lastRowId: number = Number(getHarnessState("opencode_last_rowid") || "0");
let watcherCleanup: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Claude Code JSONL reader state — offsets persisted in Aether DB
const jsonlOffsets = new Map<string, number>();
// Context limit alert state — keyed by JSONL file path, auto-resets on new session
const contextAlerted = ((globalThis as Record<string, unknown>).__contextAlerted ??
	new Map<string, boolean>()) as Map<string, boolean>;
(globalThis as Record<string, unknown>).__contextAlerted = contextAlerted;
const CONTEXT_THRESHOLD = 850000;
// Load persisted offsets from DB on module init
try {
	const stored = getHarnessState("jsonl_offsets");
	if (stored) {
		const parsed = JSON.parse(stored) as Record<string, number>;
		for (const [k, v] of Object.entries(parsed)) jsonlOffsets.set(k, v);
	}
} catch {}

function persistJsonlOffsets(): void {
	const obj: Record<string, number> = {};
	for (const [k, v] of jsonlOffsets) obj[k] = v;
	setHarnessState("jsonl_offsets", JSON.stringify(obj));
}
let claudeWatchers: fs.FSWatcher[] = [];
let miniPollInterval: ReturnType<typeof setInterval> | null = null;
const claudeDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getActiveJsonlFile(projectDir: string): string | null {
	try {
		const files = fs
			.readdirSync(projectDir)
			.filter((f) => f.endsWith(".jsonl"))
			.map((f) => ({
				name: f,
				mtime: fs.statSync(path.join(projectDir, f)).mtimeMs,
			}))
			.sort((a, b) => b.mtime - a.mtime);
		return files.length > 0 ? path.join(projectDir, files[0].name) : null;
	} catch {
		return null;
	}
}

function extractTeammateFromProjectDir(dirName: string): string {
	for (const prefix of CLAUDE_PROJECT_PREFIXES) {
		if (dirName.startsWith(prefix)) {
			return dirName.slice(prefix.length);
		}
	}
	return "";
}

function checkClaudeJsonl(filePath: string, teammate: string): void {
	try {
		const stat = fs.statSync(filePath);
		const offset = jsonlOffsets.get(filePath) || 0;
		if (stat.size <= offset) return;

		// Atomically claim the new bytes BEFORE reading — prevents duplicate reads
		// when multiple watchers (or HMR reloads) fire simultaneously
		const claimedSize = stat.size;
		jsonlOffsets.set(filePath, claimedSize);
		persistJsonlOffsets();

		const fd = fs.openSync(filePath, "r");
		const buf = Buffer.alloc(claimedSize - offset);
		fs.readSync(fd, buf, 0, buf.length, offset);
		fs.closeSync(fd);

		const lines = buf
			.toString("utf-8")
			.split("\n")
			.filter((l) => l.trim());
		for (const line of lines) {
			try {
				const entry = JSON.parse(line);
				if (entry.type !== "assistant") continue;
				const message = entry.message;
				if (!message?.content) continue;
				// Context limit check
				const usage = message.usage;
				if (usage && !contextAlerted.get(filePath)) {
					const contextSize =
						(usage.cache_read_input_tokens || 0) +
						(usage.cache_creation_input_tokens || 0) +
						(usage.input_tokens || 0);
					if (contextSize >= CONTEXT_THRESHOLD) {
						contextAlerted.set(filePath, true);
						console.log(
							`[harness-reader] ${teammate} context at ${contextSize} tokens — firing pulse`
						);
						fetch("http://localhost:51730/api/pulse", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ teammate, reason: "context window at 90% already" }),
						}).catch(() => {});
					}
				}
				const createdAt = entry.timestamp || new Date().toISOString();
				for (const part of message.content) {
					if (part.type === "text" && part.text?.trim()) {
						const trimmed = part.text.trimStart();
						if (trimmed.startsWith("Human:") || trimmed.startsWith("<system-reminder>")) continue;
						emitTextResponse({ text: part.text }, teammate, createdAt);
					}
					// Skip tool_use — aether-relay.sh already covers tool activity for Claude Code
				}
			} catch {
				// Skip malformed lines
			}
		}
	} catch (e) {
		console.error(`harness-reader: Claude JSONL read failed for ${teammate}`, e);
	}
}

function onClaudeJsonlChange(projectDir: string, teammate: string): void {
	const key = projectDir;
	const existing = claudeDebounceTimers.get(key);
	if (existing) clearTimeout(existing);
	claudeDebounceTimers.set(
		key,
		setTimeout(() => {
			const jsonlFile = getActiveJsonlFile(projectDir);
			if (jsonlFile) checkClaudeJsonl(jsonlFile, teammate);
			claudeDebounceTimers.delete(key);
		}, 100)
	);
}

function initProjectDir(projectsDir: string, usePolling: boolean): void {
	if (!fs.existsSync(projectsDir)) return;

	const dirs = fs.readdirSync(projectsDir).filter((d) => CLAUDE_PROJECT_PREFIXES.some((p) => d.startsWith(p)));

	for (const dirName of dirs) {
		const teammate = extractTeammateFromProjectDir(dirName);
		if (!teammate) continue;
		const projectDir = path.join(projectsDir, dirName);

		const jsonlFile = getActiveJsonlFile(projectDir);
		if (jsonlFile && !jsonlOffsets.has(jsonlFile)) {
			try {
				const size = fs.statSync(jsonlFile).size;
				jsonlOffsets.set(jsonlFile, size);
				persistJsonlOffsets();
			} catch {}
		}

		if (!usePolling) {
			try {
				const watcher = fs.watch(projectDir, (eventType, filename) => {
					if (filename?.endsWith(".jsonl")) {
						onClaudeJsonlChange(projectDir, teammate);
					}
				});
				claudeWatchers.push(watcher);
			} catch {}
		}
	}

	if (usePolling && dirs.length > 0) {
		console.log(
			`harness-reader: polling ${dirs.length} Mini project dirs (NFS — fs.watch unreliable)`
		);
	} else if (dirs.length > 0) {
		console.log(`harness-reader: watching ${dirs.length} project dirs in ${projectsDir}`);
	}
}

function pollMiniProjects(): void {
	if (!fs.existsSync(CLAUDE_MINI_PROJECTS_DIR)) return;
	try {
		const dirs = fs
			.readdirSync(CLAUDE_MINI_PROJECTS_DIR)
			.filter((d) => CLAUDE_PROJECT_PREFIXES.some((p) => d.startsWith(p)));
		for (const dirName of dirs) {
			const teammate = extractTeammateFromProjectDir(dirName);
			if (!teammate) continue;
			const projectDir = path.join(CLAUDE_MINI_PROJECTS_DIR, dirName);
			const jsonlFile = getActiveJsonlFile(projectDir);
			if (jsonlFile) checkClaudeJsonl(jsonlFile, teammate);
		}
	} catch {}
}

function startClaudeCodeReader(): void {
	const g = globalThis as Record<string, unknown>;
	if (g.__claudeReaderActive) return;
	g.__claudeReaderActive = true;

	// Local projects — fs.watch (FSEvents works for local writes)
	initProjectDir(CLAUDE_PROJECTS_DIR, false);

	// Mini projects on NFS — polling (FSEvents unreliable over NFS)
	initProjectDir(CLAUDE_MINI_PROJECTS_DIR, true);
	miniPollInterval = setInterval(pollMiniProjects, 3000);
}

function stopClaudeCodeReader(): void {
	for (const w of claudeWatchers) {
		try {
			w.close();
		} catch {}
	}
	claudeWatchers = [];
	if (miniPollInterval) {
		clearInterval(miniPollInterval);
		miniPollInterval = null;
	}
	for (const t of claudeDebounceTimers.values()) clearTimeout(t);
	claudeDebounceTimers.clear();
	(globalThis as Record<string, unknown>).__claudeReaderActive = false;
}

function checkOpenCodeDb(): void {
	let db: Database.Database | null = null;
	try {
		db = new Database(OPENCODE_DB, { readonly: true });
		db.pragma("journal_mode = WAL");
		db.pragma("query_only = true");
		const sessions = getActiveSessions(db);
		if (sessions.size === 0) return;
		const sessionIds = Array.from(sessions.values());
		const placeholders = sessionIds.map(() => "?").join(",");
		const parts = db
			.prepare(
				`SELECT p.rowid, p.id, p.session_id, p.time_created, p.data, json_extract(m.data, '$.role') as role
				 FROM part p
				 JOIN message m ON m.id = p.message_id
				 WHERE p.session_id IN (${placeholders})
				 AND p.rowid > ?
				 ORDER BY p.rowid ASC`
			)
			.all(...sessionIds, lastRowId) as {
			rowid: number;
			id: string;
			session_id: string;
			time_created: number;
			data: string;
			role: string;
		}[];
		if (parts.length === 0) return;
		const teammateNames = new Map<string, string>();
		for (const [dir, sid] of sessions) {
			teammateNames.set(sid, getTeammateName(dir));
		}
		let maxRowId = lastRowId;
		for (const part of parts) {
			if (part.rowid > maxRowId) maxRowId = part.rowid;
			const parsed = JSON.parse(part.data);
			const type = parsed.type;
			if (type !== "text") continue;
			if (part.role !== "assistant") continue;
			const teammate = teammateNames.get(part.session_id) || "unknown";
			const createdAt = new Date(part.time_created).toISOString();
			emitTextResponse(parsed, teammate, createdAt);
		}
		if (maxRowId > lastRowId) {
			lastRowId = maxRowId;
			setHarnessState("opencode_last_rowid", String(lastRowId));
		}
	} catch (e) {
		console.error("harness-reader: OpenCode query failed", e);
	} finally {
		if (db) {
			try {
				db.close();
			} catch {}
		}
	}
}

function onDbChange(): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		checkOpenCodeDb();
		debounceTimer = null;
	}, 50);
}

export function startHarnessReader(): void {
	// Process-level guard — prevent duplicate OpenCode readers from HMR re-imports
	// NOTE: HMR replaces module code but does NOT reset globalThis flags. A full
	// server restart (Ctrl+C + npm run dev) is required after changes to this file.
	const g = globalThis as Record<string, unknown>;
	if (g.__opencodeReaderActive) {
		// Still start Claude reader if needed (has its own guard)
		startClaudeCodeReader();
		return;
	}

	if (watcherCleanup) return;

	// OpenCode SQLite reader — event-driven via fs.watch, rowid cursor
	if (fs.existsSync(OPENCODE_DB)) {
		g.__opencodeReaderActive = true;
		// Auto-reset cursor if OpenCode DB was recreated (rowids restarted)
		try {
			const resetDb = new Database(OPENCODE_DB, { readonly: true });
			const maxRow = resetDb.prepare("SELECT MAX(rowid) as maxId FROM part").get() as { maxId: number | null } | undefined;
			resetDb.close();
			if (maxRow?.maxId != null && maxRow.maxId < lastRowId) {
				console.log(`harness-reader: OpenCode DB recreated — cursor ${lastRowId} > MAX(rowid) ${maxRow.maxId}, resetting`);
				lastRowId = maxRow.maxId;
				setHarnessState("opencode_last_rowid", String(lastRowId));
			}
		} catch (e) {
			console.error("harness-reader: OpenCode cursor auto-reset check failed", e);
		}
		// Initialize lastRowId to MAX(rowid) for active sessions on cold start
		if (lastRowId === 0) {
			try {
				const db = new Database(OPENCODE_DB, { readonly: true });
				db.pragma("journal_mode = WAL");
				db.pragma("query_only = true");
				const sessions = getActiveSessions(db);
				if (sessions.size > 0) {
					const sessionIds = Array.from(sessions.values());
					const placeholders = sessionIds.map(() => "?").join(",");
					const row = db
						.prepare(`SELECT MAX(rowid) as maxId FROM part WHERE session_id IN (${placeholders})`)
						.get(...sessionIds) as { maxId: number | null } | undefined;
					if (row?.maxId) {
						lastRowId = row.maxId;
						setHarnessState("opencode_last_rowid", String(lastRowId));
						console.log(`harness-reader: OpenCode cold start — set lastRowId to ${lastRowId}`);
					}
				}
				db.close();
			} catch (e) {
				console.error("harness-reader: OpenCode cold start init failed", e);
			}
		}
		checkOpenCodeDb();
		const dbDir = path.dirname(OPENCODE_DB);
		const watcher = fs.watch(dbDir, (eventType, filename) => {
			if (filename && filename.includes("opencode")) onDbChange();
		});
		watcherCleanup = () => {
			watcher.close();
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	} else {
		watcherCleanup = () => {};
	}

	// Claude Code JSONL reader
	startClaudeCodeReader();
}

export function stopHarnessReader(): void {
	if (watcherCleanup) {
		watcherCleanup();
		watcherCleanup = null;
	}
	const _g = globalThis as Record<string, unknown>;
	_g.__opencodeReaderActive = false;
	stopClaudeCodeReader();
}
