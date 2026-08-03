import fs from "fs";
import { getAliveTeammates } from "./kitten";

const ACTIVE_FILE = "/tmp/aether-active-teammates.json";
const RECONCILE_INTERVAL = 30000;

interface ActiveState {
	[teammate: string]: {
		activatedAt: string;
	};
}

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
	const state = readActive();
	delete state[name.toLowerCase()];
	writeActive(state);
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
		const jsonActive = readActive();
		const jsonNames = new Set(Object.keys(jsonActive));
		let changed = false;
		for (const name of kittyAlive) {
			if (!jsonNames.has(name)) {
				jsonActive[name] = { activatedAt: new Date().toISOString() };
				changed = true;
			}
		}
		for (const name of jsonNames) {
			if (!kittyAlive.has(name)) {
				delete jsonActive[name];
				changed = true;
			}
		}
		if (changed) writeActive(jsonActive);
	} catch {}
}

if (globalThis.__reconcileTimer) clearInterval(globalThis.__reconcileTimer);
globalThis.__reconcileTimer = setInterval(reconcileWithKitty, RECONCILE_INTERVAL);
