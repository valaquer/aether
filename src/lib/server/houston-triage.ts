const TRIAGE_KEY = "__houstonTriageState";
const TIMEOUT_MS = 10 * 60 * 1000;

interface TriageState {
	watchtowerRoomId: string | null;
	timeout: ReturnType<typeof setTimeout> | null;
	vendor: string;
	message: string;
}

function getState(): TriageState {
	if (!(globalThis as any)[TRIAGE_KEY]) {
		(globalThis as any)[TRIAGE_KEY] = { watchtowerRoomId: null, timeout: null, vendor: "", message: "" };
	}
	return (globalThis as any)[TRIAGE_KEY];
}

export function startTriageTimer(watchtowerRoomId: string, vendor: string, message: string): void {
	const state = getState();
	if (state.timeout) clearTimeout(state.timeout);
	state.watchtowerRoomId = watchtowerRoomId;
	state.vendor = vendor;
	state.message = message;
	state.timeout = setTimeout(() => {
		fetch("http://localhost:51730/api/houston-escalate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reason: "triage_timeout", message: `10-min triage timeout — no acknowledgment for: ${vendor}: ${message}` }),
		}).catch(() => {});
		state.timeout = null;
	}, TIMEOUT_MS);
}

export function clearTriageTimer(): void {
	const state = getState();
	if (state.timeout) {
		clearTimeout(state.timeout);
		state.timeout = null;
	}
	state.watchtowerRoomId = null;
}

export function getTriageWatchtowerRoomId(): string | null {
	return getState().watchtowerRoomId;
}
