import fs from "fs";
import { getAliveTeammates } from "./kitten";

const ACTIVE_FILE = "/tmp/aether-active-teammates.json";
const MIGRATED_FILE = "/Users/deepak-macmini/honeybloom/library/aether/v2-migrated.json";
const RECONCILE_INTERVAL = 30000;
const CLEANUP_TIMEOUT = 60000;

// Teammates migrated to Aether v2 -- v1 must not show them as alive even
// though their Kitty tabs are visible to this host. Missing/empty file = nobody migrated.
function readMigrated(): Set<string> {
	try {
		const arr = JSON.parse(fs.readFileSync(MIGRATED_FILE, "utf-8"));
		return Array.isArray(arr) ? new Set(arr.map((n: string) => n.toLowerCase())) : new Set();
	} catch {
		return new Set();
	}
}

interface ActiveState {
	[teammate: string]: {
		activatedAt: string;
	};
}

if (!globalThis.__pendingCleanup) globalThis.__pendingCleanup = new Set<string>();

function readActive(): ActiveState {
	try {
		const data = fs.readFileSync(ACTIVE_FILE, "utf-8");
		return JSON.parse(data);
	} catch {
		return {};
	}
}

function writeActive(state: ActiveState): void {
	fs.writeFileSync(ACTIVE_FILE, JSON.stringify(state, null, 2));
}

export function activateTeammate(name: string): void {
	const state = readActive();
	state[name.toLowerCase()] = { activatedAt: new Date().toISOString() };
	writeActive(state);
}

export function deactivateTeammate(name: string): void {
	const key = name.toLowerCase();
	const state = readActive();
	delete state[key];
	writeActive(state);
	globalThis.__pendingCleanup.add(key);
	setTimeout(() => { globalThis.__pendingCleanup.delete(key); }, CLEANUP_TIMEOUT);
}

export function clearPendingCleanup(name: string): void {
	globalThis.__pendingCleanup.delete(name.toLowerCase());
}

export function getActiveTeammates(): string[] {
	return Object.keys(readActive());
}

export function getActiveTeammatesSet(): Set<string> {
	return new Set(Object.keys(readActive()));
}

async function reconcileWithKitty(): Promise<void> {
	try {
		const kittyAlive = await getAliveTeammates();
		if (!kittyAlive) return;
		const migrated = readMigrated();
		const jsonActive = readActive();
		const jsonNames = new Set(Object.keys(jsonActive));
		let changed = false;
		for (const name of kittyAlive) {
			if (migrated.has(name)) continue;
			if (!jsonNames.has(name) && !globalThis.__pendingCleanup.has(name)) {
				jsonActive[name] = { activatedAt: new Date().toISOString() };
				changed = true;
			}
		}
		for (const name of jsonNames) {
			if (!kittyAlive.has(name) || migrated.has(name)) {
				delete jsonActive[name];
				changed = true;
			}
		}
		if (changed) writeActive(jsonActive);
	} catch {}
}

if (globalThis.__reconcileTimer) clearInterval(globalThis.__reconcileTimer);
globalThis.__reconcileTimer = setInterval(reconcileWithKitty, RECONCILE_INTERVAL);
