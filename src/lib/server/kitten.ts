import { exec, execFile } from "child_process";
import { promisify } from "util";
import { readdirSync, existsSync, appendFileSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

const KITTEN = "/opt/homebrew/bin/kitten";
const JANUS_CSV =
	"/Users/deepak-macmini/honeybloom/library/scripts/janus-config.csv";

// Kitty runs locally on the Mini -- all kitten commands are direct

let localSocketCache: { uri: string; ts: number } | null = null;
async function discoverLocalSocket(): Promise<string | null> {
	if (localSocketCache && Date.now() - localSocketCache.ts < 30000) return localSocketCache.uri;
	const tmpFiles = readdirSync("/tmp");
	const socketFiles = tmpFiles.filter(f => f.startsWith("honeybloom-kitty-") && f.endsWith(".sock"));
	for (const f of socketFiles) {
		const socketUri = `unix:/tmp/${f}`;
		try {
			await execFileAsync(KITTEN, ["@", "--to", socketUri, "ls"], { timeout: 3000 });
			localSocketCache = { uri: socketUri, ts: Date.now() };
			return socketUri;
		} catch { continue; }
	}
	return null;
}

// Per-teammate send queue: serializes sendToKitty calls so two payloads
// never interleave in the same PTY input buffer (REQ-98)
const sendQueues = new Map<string, Promise<void>>();

function enqueue(teammate: string, fn: () => Promise<void>): Promise<void> {
	const prev = sendQueues.get(teammate) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	sendQueues.set(teammate, next);
	return next;
}

export function getTeammateHarness(teammate: string, csvPath = JANUS_CSV): string | null {
	try {
		const lines = readFileSync(csvPath, "utf-8").trim().split("\n");
		const header = lines[0]?.split(",").map((column) => column.trim().toLowerCase()) ?? [];
		const harnessIndex = header.indexOf("harness");
		if (harnessIndex < 0) {
			console.error(`[sendToKitty] Janus harness header missing for ${teammate}`);
			return null;
		}
		const matches: string[] = [];
		for (const line of lines.slice(1)) {
			const columns = line.split(",");
			if (columns[0]?.trim().toLowerCase() === teammate.trim().toLowerCase()) {
				matches.push(columns[harnessIndex]?.trim() ?? "");
			}
		}
		if (matches.length !== 1 || !matches[0]) {
			console.error(
				`[sendToKitty] malformed Janus teammate row for ${teammate}: expected one non-empty harness, found ${matches.length}`
			);
			return null;
		}
		return matches[0];
	} catch (err) {
		console.error(`[sendToKitty] Janus lookup failed for ${teammate}: ${err instanceof Error ? err.message : String(err)}`);
	}
	return null;
}

export function shouldPersistOpenCodeInbox(teammate: string, csvPath = JANUS_CSV): boolean {
	return getTeammateHarness(teammate, csvPath)?.toLowerCase() === "opencode";
}

export function persistOpenCodeInbox(
	teammate: string,
	payload: { sender: string; room: string; body: string; timestamp: string },
	csvPath = JANUS_CSV,
	inboxDir = "/tmp"
): boolean {
	if (!shouldPersistOpenCodeInbox(teammate, csvPath)) return false;
	try {
		appendFileSync(
			`${inboxDir}/opencode-inbox-${teammate}.jsonl`,
			JSON.stringify(payload) + "\n"
		);
		return true;
	} catch (err) {
		console.error(
			`[sendToKitty] OpenCode inbox append failed for ${teammate}: ${err instanceof Error ? err.message : String(err)}`
		);
		return false;
	}
}

export function buildMiniProcessCleanupCommand(name: string): string {
	if (!/^[a-z0-9-]+$/i.test(name)) throw new Error(`Invalid teammate name: ${name}`);
	const expectedCwd = `/Users/deepak-macmini/honeybloom/${name}`;
	return `expected_cwd='${expectedCwd}'
cwd_of() { lsof -p "$1" -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'; }
is_live() { kill -0 "$1" 2>/dev/null || return 1; state=$(ps -o stat= -p "$1" 2>/dev/null | tr -d ' '); case "$state" in Z*) return 1 ;; esac; return 0; }
command_of() { ps -o command= -p "$1" 2>/dev/null || true; }
birth_of() { ps -o lstart= -p "$1" 2>/dev/null | awk '{$1=$1; print}'; }
fingerprint_of() { command=$(command_of "$1"); birth=$(birth_of "$1"); [ -n "$command" ] && [ -n "$birth" ] || return 1; printf '%s\n%s' "$command" "$birth" | cksum | awk '{print $1 ":" $2}'; }
add_target() { pid="$1"; role="$2"; [ "$(cwd_of "$pid")" = "$expected_cwd" ] || return; fingerprint=$(fingerprint_of "$pid") || return; case " $targets " in *" $pid "*) return ;; esac; targets="$targets $pid"; eval fp_$pid=$fingerprint; eval role_$pid=$role; }
still_target() { pid="$1"; is_live "$pid" || return 1; [ "$(cwd_of "$pid")" = "$expected_cwd" ] || return 1; eval expected_fp=\\$fp_$pid; eval role=\\$role_$pid; [ -n "$expected_fp" ] && [ "$(fingerprint_of "$pid")" = "$expected_fp" ] || return 1; command=$(command_of "$pid"); case "$role" in descendant) case "$command" in *"/codex-code-mode-host"|*"/bin/codex "*) ;; *) return 1 ;; esac ;; native) [ "$(ps -o comm= -p "$pid" 2>/dev/null | sed 's#.*/##' | tr -d ' ')" = codex ] || return 1 ;; launcher) case "$command" in node" /opt/homebrew/bin/codex "*) ;; *) return 1 ;; esac ;; claude) [ "$(ps -o comm= -p "$pid" 2>/dev/null | sed 's#.*/##' | tr -d ' ')" = claude ] || return 1 ;; *) return 1 ;; esac; }
record_descendants() { for child in $(pgrep -P "$1" 2>/dev/null || true); do child_cmd=$(command_of "$child"); case "$child_cmd" in *"/codex-code-mode-host"|*"/bin/codex "*) ;; *) continue ;; esac; if [ "$(cwd_of "$child")" = "$expected_cwd" ]; then record_descendants "$child"; add_target "$child" descendant; fi; done; }
targets=""
for native in $(pgrep -x codex 2>/dev/null || true); do
  [ "$(cwd_of "$native")" = "$expected_cwd" ] || continue
  launcher=$(ps -o ppid= -p "$native" 2>/dev/null | tr -d ' ')
  launcher_cmd=$(ps -o command= -p "$launcher" 2>/dev/null || true)
  case "$launcher_cmd" in node" /opt/homebrew/bin/codex "*) ;; *) launcher="" ;; esac
  [ -z "$launcher" ] || [ "$(cwd_of "$launcher")" = "$expected_cwd" ] || launcher=""
  record_descendants "$native"
  add_target "$native" native
  [ -z "$launcher" ] || add_target "$launcher" launcher
done
for claude in $(pgrep -x claude 2>/dev/null || true); do
  [ "$(cwd_of "$claude")" = "$expected_cwd" ] || continue
  add_target "$claude" claude
done
for pid in $targets; do still_target "$pid" && kill -TERM "$pid" 2>/dev/null || true; done
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  survivors=""
  for pid in $targets; do still_target "$pid" && survivors="$survivors $pid"; done
  [ -z "$survivors" ] && { [ -n "$targets" ] && echo killed || echo none; exit 0; }
  sleep 0.2
done
for pid in $survivors; do still_target "$pid" && kill -9 "$pid" 2>/dev/null || true; done
sleep 0.2
remaining=""
for pid in $survivors; do still_target "$pid" && remaining="$remaining $pid"; done
[ -z "$remaining" ] || { echo "surviving teammate processes:$remaining" >&2; exit 1; }
[ -n "$targets" ] && echo killed || echo none`;
}

export function sendToKitty(
	teammate: string,
	payload: { sender: string; room: string; body: string; timestamp: string }
): Promise<string> {
	let result = "queued";
	const work = enqueue(teammate, async () => {
		let replyRoom = payload.room;
		if (payload.room.startsWith("direct-") && payload.sender !== "boss") {
			replyRoom = `direct-${payload.sender.toLowerCase()}`;
		} else if (payload.room.startsWith("direct-")) {
			// Strip session-scoped timestamps from Boss Reply-to (prevents model ID fabrication)
			const bareMatch = payload.room.match(/^(direct-[a-z]+)/);
			replyRoom = bareMatch ? bareMatch[1] : payload.room;
		}
		const text = [
			`sender: ${payload.sender}`,
			`room: ${payload.room}`,
			`timestamp: ${payload.timestamp}`,
			`body: "${payload.body}"`,
			`---\nReply to: ${replyRoom}`,
		].join("\n");

		try {
			const len = text.length;
			const enterDelay = Math.min(Math.max(1000, len * 0.5), 10000);
			const t0 = Date.now();
			const tmpFile = `/tmp/.sendtext-${teammate}-${Date.now()}.tmp`;

			const localSocket = await discoverLocalSocket();
			if (!localSocket) {
				result = "no_local_socket";
				console.error(`[sendToKitty] no_local_socket for to=${teammate}`);
				return;
			}
			writeFileSync(tmpFile, text);
			try {
				await execFileAsync(KITTEN, ["@", "--to", localSocket, "send-text", "--match", `var:teammate=${teammate}`, "--bracketed-paste", "disable", "--from-file", tmpFile], { timeout: 10000 });
				const sendDuration = Date.now() - t0;
				console.log(`[sendToKitty] to=${teammate} len=${len} delay=${enterDelay}ms sendDuration=${sendDuration}ms`);
				await new Promise((resolve) => setTimeout(resolve, enterDelay));
				await execFileAsync(KITTEN, ["@", "--to", localSocket, "send-key", "--match", `var:teammate=${teammate}`, "enter"], { timeout: 3000 });
				result = "delivered";
				persistOpenCodeInbox(teammate, payload);
			} finally {
				try { unlinkSync(tmpFile); } catch {}
			}
		} catch (err) {
			result = `error: ${err instanceof Error ? err.message : String(err)}`;
			console.error(`[sendToKitty] FAILED to=${teammate} error=${result}`);
		}
	});
	return work.then(() => result);
}

function parseAliveFromLs(stdout: string): Set<string> {
	try {
		const data = JSON.parse(stdout);
		const alive = new Set<string>();
		if (Array.isArray(data)) {
			for (const osWindow of data) {
				for (const tab of osWindow.tabs ?? []) {
					const teammateVar = Object.entries(tab.windows?.[0]?.user_vars ?? {}).find(
						([k]) => k === "teammate"
					);
					if (teammateVar) alive.add((teammateVar[1] as string).toLowerCase());
				}
			}
		}
		return alive;
	} catch { return new Set(); }
}

export async function getAliveTeammates(): Promise<Set<string> | null> {
	const localSocket = await discoverLocalSocket();
	if (!localSocket) return null;

	try {
		const { stdout } = await execFileAsync(KITTEN, ["@", "--to", localSocket, "ls"], { timeout: 3000 });
		return parseAliveFromLs(stdout);
	} catch { return null; }
}

export async function isTabAlive(teammate: string): Promise<boolean> {
	const localSocket = await discoverLocalSocket();
	if (!localSocket) return false;
	try {
		const { stdout } = await execFileAsync(KITTEN, ["@", "--to", localSocket, "ls", "--match", `var:teammate=${teammate}`], { timeout: 3000 });
		const data = JSON.parse(stdout);
		return Array.isArray(data) && data.length > 0;
	} catch { return false; }
}

export async function closeKittyTab(teammate: string): Promise<boolean> {
	const localSocket = await discoverLocalSocket();
	if (!localSocket) return false;
	try {
		await execFileAsync(KITTEN, ["@", "--to", localSocket, "close-tab", "--match", `var:teammate=${teammate}`], { timeout: 3000 });
		return true;
	} catch { return false; }
}

const OPEN_TEAM_SCRIPT = "/Users/deepak-macmini/honeybloom/library/scripts/open-team.sh";

export async function launchTeammate(name: string): Promise<boolean> {
	try {
		await execFileAsync(OPEN_TEAM_SCRIPT, ["--solo", name], { timeout: 30000 });
		return true;
	} catch {
		return false;
	}
}

export type MiniCleanupStatus = "killed" | "none";

export async function killMiniProcess(name: string): Promise<MiniCleanupStatus> {
	const output = await new Promise<string>((resolve, reject) => {
		exec(
			buildMiniProcessCleanupCommand(name),
			{ timeout: 10000 },
			(err, stdout, stderr) => {
				if (err) {
					const detail = stderr.trim() || err.message;
					console.error(`[killMiniProcess] ${name}: ${detail}`);
					reject(new Error(detail));
				} else resolve(stdout.trim());
			}
		);
	});
	if (output !== "killed" && output !== "none") {
		throw new Error(`Invalid Mini cleanup status for ${name}: ${output || "<empty>"}`);
	}
	return output;
}

export async function cleanupMiniAndMaybeCloseTab(
	name: string,
	deps = {
		kill: killMiniProcess,
		isAlive: isTabAlive,
		close: closeKittyTab,
	}
): Promise<{ cleanup: MiniCleanupStatus; tabAlive?: boolean; closed?: boolean }> {
	const cleanup = await deps.kill(name);
	const tabAlive = await deps.isAlive(name);
	if (!tabAlive) return { cleanup, tabAlive };
	return { cleanup, tabAlive, closed: await deps.close(name) };
}
