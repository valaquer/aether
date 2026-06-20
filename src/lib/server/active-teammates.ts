import fs from "fs";

const ACTIVE_FILE = "/tmp/facade-active-teammates.json";

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
