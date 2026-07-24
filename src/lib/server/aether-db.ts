import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";

import os from "os";
const DB_DIR = os.hostname().includes("Mini") ? "/Users/deepak-macmini/honeybloom/library/aether" : "/Users/d.patnaik/honeybloom/library/aether";
const DB_PATH = path.join(DB_DIR, "aether.db");

interface StoredMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
	type: string;
}

interface RoomRow {
	id: string;
	type: string;
	name: string;
	participants: string;
	originalRoomId: string | null;
	lastActivity: string;
	startedAt: string;
}


let db: Database.Database;

export function formatTimestamp(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	const s = String(date.getSeconds()).padStart(2, "0");
	return `${y}${m}${d}-${h}${min}${s}`;
}

export function initDb(): void {
	if (db) return;
	if (!fs.existsSync(DB_DIR)) {
		fs.mkdirSync(DB_DIR, { recursive: true });
	}
	db = new Database(DB_PATH);
	db.pragma("journal_mode = WAL");
	db.exec(`
		CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversationId TEXT NOT NULL,
			sender TEXT NOT NULL,
			content TEXT NOT NULL,
			createdAt TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'message'
		)
	`);
	try {
		db.exec(`ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'message'`);
	} catch {
		// column already exists
	}
	db.exec(`
		CREATE TABLE IF NOT EXISTS rooms (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			participants TEXT DEFAULT '[]',
			originalRoomId TEXT,
			lastActivity TEXT NOT NULL,
			startedAt TEXT NOT NULL
		)
	`);
	try {
		db.exec("ALTER TABLE rooms ADD COLUMN originalRoomId TEXT");
	} catch {
		// column already exists
	}
	db.exec(`
		CREATE TABLE IF NOT EXISTS huddle_tokens (
			roomId TEXT PRIMARY KEY REFERENCES rooms(id),
			tokenHolder TEXT,
			tokenQueue TEXT NOT NULL DEFAULT '[]'
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS bookmarks (
			id TEXT PRIMARY KEY,
			messageId TEXT NOT NULL,
			roomId TEXT NOT NULL,
			name TEXT NOT NULL,
			createdAt TEXT NOT NULL
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS harness_state (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS notebook (
			id TEXT PRIMARY KEY,
			content TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS pinned_rooms (
			roomId TEXT PRIMARY KEY,
			pinnedAt TEXT NOT NULL
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS speed_reader_chunks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			chunk_text TEXT NOT NULL,
			chunk_index INTEGER NOT NULL,
			is_last INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS speed_reader_sessions (
			session_id TEXT PRIMARY KEY,
			label TEXT,
			source TEXT,
			stopped INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		)
	`);
	db.exec(`
		CREATE TABLE IF NOT EXISTS houston_alerts (
			id TEXT PRIMARY KEY,
			vendor TEXT NOT NULL,
			message TEXT NOT NULL,
			deep_link TEXT,
			created_at TEXT NOT NULL,
			cleared_at TEXT
		)
	`);
}

export function createHoustonAlert(alert: { id: string; vendor: string; message: string; deep_link?: string }): void {
	initDb();
	db.prepare("INSERT OR REPLACE INTO houston_alerts (id, vendor, message, deep_link, created_at) VALUES (?, ?, ?, ?, ?)")
		.run(alert.id, alert.vendor, alert.message, alert.deep_link ?? null, new Date().toISOString());
}

export function getActiveHoustonAlerts(): { id: string; vendor: string; message: string; deep_link: string | null; created_at: string }[] {
	initDb();
	return db.prepare("SELECT id, vendor, message, deep_link, created_at FROM houston_alerts WHERE cleared_at IS NULL").all() as any[];
}

export function clearAllHoustonAlerts(): void {
	initDb();
	db.prepare("UPDATE houston_alerts SET cleared_at = ? WHERE cleared_at IS NULL").run(new Date().toISOString());
}

const ORG_PATH = "/Users/deepak-macmini/honeybloom/library/ORG.md";

function readEngineeringGroup(): string[] {
	try {
		const raw = fs.readFileSync(ORG_PATH, "utf-8");
		let inSection = false;
		for (const line of raw.split("\n")) {
			if (line.startsWith("## Sidebar Order")) { inSection = true; continue; }
			if (inSection && line.startsWith("## ")) break;
			if (!inSection || !line.includes(":")) continue;
			const colonIdx = line.indexOf(":");
			const label = line.slice(0, colonIdx).trim();
			if (label === "Engineering") {
				return line.slice(colonIdx + 1).split(",").map(m => m.trim().toLowerCase()).filter(Boolean);
			}
		}
	} catch {}
	return ["guru", "daksh", "ines"];
}

export { readEngineeringGroup };

export function getHarnessState(key: string): string | null {
	initDb();
	const row = db.prepare("SELECT value FROM harness_state WHERE key = ?").get(key) as
		| { value: string }
		| undefined;
	return row?.value ?? null;
}

export function setHarnessState(key: string, value: string): void {
	initDb();
	db.prepare("INSERT OR REPLACE INTO harness_state (key, value) VALUES (?, ?)").run(key, value);
}

export function saveMessage(msg: StoredMessage): boolean {
	initDb();
	const stmt = db.prepare(
		"INSERT OR IGNORE INTO messages (id, conversationId, sender, content, createdAt, type) VALUES (?, ?, ?, ?, ?, ?)"
	);
	const result = stmt.run(
		msg.id,
		msg.conversationId,
		msg.sender,
		msg.content,
		msg.createdAt,
		msg.type || "message"
	);
	return result.changes > 0;
}

export function resolveActiveRoom(originalRoomId: string): string | null {
	initDb();
	const stmt = db.prepare(
		"SELECT id FROM rooms WHERE originalRoomId = ? AND type != 'past' ORDER BY startedAt DESC LIMIT 1"
	);
	const row = stmt.get(originalRoomId) as { id: string } | undefined;
	return row?.id ?? null;
}

export function getHuddleMembers(roomId: string): string[] {
	initDb();
	const room = getRoom(roomId);
	if (!room) return [];
	try {
		return JSON.parse(room.participants) as string[];
	} catch {
		return [];
	}
}

export function forceAssignToken(roomId: string, holder: string): void {
	initDb();
	db.prepare("UPDATE huddle_tokens SET tokenHolder = ?, tokenQueue = '[]' WHERE roomId = ?").run(
		holder,
		roomId
	);
}

export function requestToken(sender: string, roomId: string): string {
	initDb();
	const existing = db
		.prepare("SELECT tokenHolder, tokenQueue FROM huddle_tokens WHERE roomId = ?")
		.get(roomId) as { tokenHolder: string | null; tokenQueue: string } | undefined;
	if (!existing) return "no_huddle";

	const holder = existing.tokenHolder;

	if (holder === sender) return "already_holding: you have the token";

	if (holder === null) {
		db.prepare("UPDATE huddle_tokens SET tokenHolder = ? WHERE roomId = ?").run(sender, roomId);
		return "granted: you have the token";
	}

	const cap = holder.charAt(0).toUpperCase() + holder.slice(1);
	return `System: ${cap} is answering. Have a look. Maybe it's what you wanted to say? If you still want to speak up -- to contest it or add something of your own -- the token will be made available shortly.`;
}

export function releaseToken(roomId: string, sender: string): string {
	initDb();
	const existing = db
		.prepare("SELECT tokenHolder, tokenQueue FROM huddle_tokens WHERE roomId = ?")
		.get(roomId) as { tokenHolder: string | null; tokenQueue: string } | undefined;
	if (!existing) return "no_huddle";

	if (existing.tokenHolder !== sender) {
		const queue: [string, string][] = JSON.parse(existing.tokenQueue);
		const idx = queue.findIndex((item) => item[0] === sender);
		if (idx >= 0) {
			queue.splice(idx, 1);
			db.prepare("UPDATE huddle_tokens SET tokenQueue = ? WHERE roomId = ?").run(
				JSON.stringify(queue),
				roomId
			);
			return "removed: you left the queue";
		}
		return "not_in_queue";
	}

	const queue: [string, string][] = JSON.parse(existing.tokenQueue);
	if (queue.length > 0) {
		const next = queue.shift();
		if (next) {
			db.prepare("UPDATE huddle_tokens SET tokenHolder = ?, tokenQueue = ? WHERE roomId = ?").run(
				next[0],
				JSON.stringify(queue),
				roomId
			);
			return `released: token advanced to ${next[0]}`;
		}
	}

	db.prepare("UPDATE huddle_tokens SET tokenHolder = NULL, tokenQueue = '[]' WHERE roomId = ?").run(
		roomId
	);
	return "forfeited: token released (queue empty)";
}

export function initHuddleToken(roomId: string): void {
	initDb();
	db.prepare("INSERT OR IGNORE INTO huddle_tokens (roomId) VALUES (?)").run(roomId);
}

export function getMessages(conversationId: string, limit?: number, offset?: number): StoredMessage[] {
	initDb();
	if (limit) {
		const stmt = db.prepare(
			"SELECT * FROM (SELECT * FROM messages WHERE conversationId = ? AND COALESCE(type, '') NOT IN ('tool_call', 'response') ORDER BY createdAt DESC LIMIT ? OFFSET ?) ORDER BY createdAt ASC"
		);
		return stmt.all(conversationId, limit, offset ?? 0) as StoredMessage[];
	}
	const stmt = db.prepare("SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC");
	return stmt.all(conversationId) as StoredMessage[];
}

export function getActivityCards(conversationId: string, since: string, until?: string): StoredMessage[] {
	initDb();
	if (until) {
		const stmt = db.prepare(
			"SELECT * FROM messages WHERE conversationId = ? AND type IN ('tool_call', 'response') AND createdAt >= ? AND createdAt < ? ORDER BY createdAt ASC"
		);
		return stmt.all(conversationId, since, until) as StoredMessage[];
	}
	const stmt = db.prepare(
		"SELECT * FROM messages WHERE conversationId = ? AND type IN ('tool_call', 'response') AND createdAt >= ? ORDER BY createdAt ASC"
	);
	return stmt.all(conversationId, since) as StoredMessage[];
}

export function saveRoom(room: {
	id: string;
	type: string;
	name: string;
	participants?: string[];
	originalRoomId?: string;
	lastActivity: string;
	startedAt: string;
}): void {
	initDb();
	const stmt = db.prepare(
		"INSERT OR REPLACE INTO rooms (id, type, name, participants, originalRoomId, lastActivity, startedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
	);
	stmt.run(
		room.id,
		room.type,
		room.name,
		JSON.stringify(room.participants ?? []),
		room.originalRoomId ?? null,
		room.lastActivity,
		room.startedAt
	);
}

export function roomExists(id: string): boolean {
	initDb();
	const stmt = db.prepare("SELECT 1 FROM rooms WHERE id = ?");
	return !!stmt.get(id);
}

export function clearAllTokens(roomId: string): void {
	initDb();
	db.prepare("UPDATE huddle_tokens SET tokenHolder = NULL, tokenQueue = '[]' WHERE roomId = ?").run(
		roomId
	);
}

export function getTokenHolder(roomId: string): string | null {
	initDb();
	const row = db.prepare("SELECT tokenHolder FROM huddle_tokens WHERE roomId = ?").get(roomId) as
		| { tokenHolder: string | null }
		| undefined;
	return row?.tokenHolder ?? null;
}

export function getRoom(id: string): RoomRow | undefined {
	initDb();
	const stmt = db.prepare("SELECT * FROM rooms WHERE id = ?");
	return stmt.get(id) as RoomRow | undefined;
}

export function getOriginalRoomId(pastRoomId: string): string | null {
	initDb();
	const stmt = db.prepare("SELECT originalRoomId FROM rooms WHERE id = ?");
	const row = stmt.get(pastRoomId) as { originalRoomId: string | null } | undefined;
	return row?.originalRoomId ?? null;
}

export function getActiveRoomsForTeammate(teammate: string): string[] {
	initDb();
	const rooms: string[] = [];
	// Direct room
	const directRoom = resolveActiveRoom(`direct-${teammate}`);
	if (directRoom) rooms.push(directRoom);
	// Huddle rooms where teammate is a participant
	const huddles = db
		.prepare("SELECT id, participants FROM rooms WHERE type = 'huddle'")
		.all() as RoomRow[];
	for (const h of huddles) {
		try {
			const members = JSON.parse(h.participants) as string[];
			if (members.includes(teammate)) rooms.push(h.id);
		} catch {
			/* skip */
		}
	}
	return rooms;
}

export function getRoomsByType(type: string): RoomRow[] {
	initDb();
	const stmt = db.prepare("SELECT * FROM rooms WHERE type = ? ORDER BY lastActivity DESC");
	return stmt.all(type) as RoomRow[];
}

export function setRoomType(id: string, type: string): void {
	initDb();
	db.prepare("UPDATE rooms SET type = ? WHERE id = ?").run(type, id);
}

export function getAllRooms(): RoomRow[] {
	initDb();
	const stmt = db.prepare("SELECT * FROM rooms ORDER BY lastActivity DESC");
	return stmt.all() as RoomRow[];
}

export function markRoomPast(id: string, pastId: string, startedAt: string): void {
	initDb();
	const now = new Date().toISOString();
	const stmt = db.prepare(
		"UPDATE rooms SET id = ?, type = 'past', lastActivity = ?, startedAt = ? WHERE id = ?"
	);
	stmt.run(pastId, now, startedAt, id);
}

export function deleteRoom(id: string): void {
	initDb();
	db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
}

export function saveBookmark(bm: {
	id: string;
	messageId: string;
	roomId: string;
	name: string;
	createdAt: string;
}): void {
	initDb();
	db.prepare(
		"INSERT OR IGNORE INTO bookmarks (id, messageId, roomId, name, createdAt) VALUES (?, ?, ?, ?, ?)"
	).run(bm.id, bm.messageId, bm.roomId, bm.name, bm.createdAt);
}

export function getBookmarks(): {
	id: string;
	messageId: string;
	roomId: string;
	name: string;
	createdAt: string;
}[] {
	initDb();
	return db.prepare("SELECT * FROM bookmarks ORDER BY createdAt DESC").all() as {
		id: string;
		messageId: string;
		roomId: string;
		name: string;
		createdAt: string;
	}[];
}

export function updateBookmarkName(id: string, name: string): void {
	initDb();
	db.prepare("UPDATE bookmarks SET name = ? WHERE id = ?").run(name, id);
}

export function deleteBookmark(id: string): void {
	initDb();
	db.prepare("DELETE FROM bookmarks WHERE id = ?").run(id);
}

const KEYCHAIN_SERVICE = "aether-notebook-key";
const KEYCHAIN_ACCOUNT = "aether";

function getEncryptionKey(): Buffer | null {
	try {
		const hex = execSync(
			`security find-generic-password -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w`,
			{ timeout: 3000, encoding: "utf-8" }
		).trim();
		return Buffer.from(hex, "hex");
	} catch {
		// Key doesn't exist yet — create one
		try {
			const key = crypto.randomBytes(32);
			const hex = key.toString("hex");
			execSync(
				`security add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${KEYCHAIN_ACCOUNT}" -w "${hex}"`,
				{ timeout: 3000 }
			);
			return key;
		} catch {
			return null;
		}
	}
}

function encrypt(plaintext: string, key: Buffer): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(ciphertext: string, key: Buffer): string {
	const buf = Buffer.from(ciphertext, "base64");
	const iv = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const encrypted = buf.subarray(28);
	const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return decipher.update(encrypted) + decipher.final("utf8");
}

export function saveNotebook(plaintext: string): void {
	initDb();
	const key = getEncryptionKey();
	if (!key) return;
	const ciphertext = encrypt(plaintext, key);
	db.prepare(
		"INSERT OR REPLACE INTO notebook (id, content, updated_at) VALUES ('global', ?, ?)"
	).run(ciphertext, new Date().toISOString());
}

export function getNotebook(): string {
	initDb();
	const row = db.prepare("SELECT content FROM notebook WHERE id = 'global'").get() as
		| { content: string }
		| undefined;
	if (!row) return "";
	const key = getEncryptionKey();
	if (!key) return "";
	try {
		return decrypt(row.content, key);
	} catch {
		return "";
	}
}

// --- Pinned Rooms ---

export function pinRoom(roomId: string): void {
	initDb();
	db.prepare("INSERT OR IGNORE INTO pinned_rooms (roomId, pinnedAt) VALUES (?, ?)").run(
		roomId,
		new Date().toISOString()
	);
}

export function unpinRoom(roomId: string): void {
	initDb();
	db.prepare("DELETE FROM pinned_rooms WHERE roomId = ?").run(roomId);
}

export function getPinnedRooms(): string[] {
	initDb();
	const rows = db.prepare("SELECT roomId FROM pinned_rooms ORDER BY pinnedAt").all() as { roomId: string }[];
	return rows.map((r) => r.roomId);
}

export function saveSpeedReaderChunk(sessionId: string, chunkText: string, chunkIndex: number, isLast: boolean): void {
	initDb();
	db.prepare(
		"INSERT INTO speed_reader_chunks (session_id, chunk_text, chunk_index, is_last, created_at) VALUES (?, ?, ?, ?, ?)"
	).run(sessionId, chunkText, chunkIndex, isLast ? 1 : 0, new Date().toISOString());
}

export function getSpeedReaderChunks(sessionId: string, afterIndex?: number): { chunk_text: string; chunk_index: number; is_last: boolean }[] {
	initDb();
	if (afterIndex !== undefined) {
		return db.prepare(
			"SELECT chunk_text, chunk_index, is_last FROM speed_reader_chunks WHERE session_id = ? AND chunk_index > ? ORDER BY chunk_index"
		).all(sessionId, afterIndex) as { chunk_text: string; chunk_index: number; is_last: boolean }[];
	}
	return db.prepare(
		"SELECT chunk_text, chunk_index, is_last FROM speed_reader_chunks WHERE session_id = ? ORDER BY chunk_index"
	).all(sessionId) as { chunk_text: string; chunk_index: number; is_last: boolean }[];
}

export function saveSpeedReaderSession(sessionId: string, label: string, source?: string): void {
	initDb();
	db.prepare(
		"INSERT OR REPLACE INTO speed_reader_sessions (session_id, label, source, created_at) VALUES (?, ?, ?, ?)"
	).run(sessionId, label, source || null, new Date().toISOString());
}

export function searchSpeedReaderSessions(query: string): { session_id: string; label: string; source: string | null; created_at: string }[] {
	initDb();
	return db.prepare(
		"SELECT session_id, label, source, created_at FROM speed_reader_sessions WHERE label LIKE ? ORDER BY created_at DESC LIMIT 20"
	).all(`%${query}%`) as { session_id: string; label: string; source: string | null; created_at: string }[];
}

export function listSpeedReaderSessions(): { session_id: string; label: string; source: string | null; created_at: string }[] {
	initDb();
	return db.prepare(
		"SELECT session_id, label, source, created_at FROM speed_reader_sessions ORDER BY created_at DESC LIMIT 50"
	).all() as { session_id: string; label: string; source: string | null; created_at: string }[];
}


export function stopSpeedReaderSession(sessionId: string): void {
	initDb();
	db.prepare("UPDATE speed_reader_sessions SET stopped = 1 WHERE session_id = ?").run(sessionId);
}

export function isSpeedReaderSessionStopped(sessionId: string): boolean {
	initDb();
	const row = db.prepare("SELECT stopped FROM speed_reader_sessions WHERE session_id = ?").get(sessionId) as { stopped: number } | undefined;
	return row?.stopped === 1;
}
