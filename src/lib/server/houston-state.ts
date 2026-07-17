const KEY = "__houstonHeartbeat";

interface HoustonHeartbeat {
	lastMs: number;
	state: Record<string, string>;
}

if (!(globalThis as any)[KEY]) {
	(globalThis as any)[KEY] = { lastMs: Date.now(), state: {} } as HoustonHeartbeat;
}

const heartbeat = (globalThis as any)[KEY] as HoustonHeartbeat;

export function updateHeartbeat(state: Record<string, string>): void {
	heartbeat.lastMs = Date.now();
	heartbeat.state = state;
}

export function getHeartbeat(): { lastMs: number; state: Record<string, string>; stale: boolean } {
	const stale = Date.now() - heartbeat.lastMs > 5 * 60 * 1000;
	return { lastMs: heartbeat.lastMs, state: heartbeat.state, stale };
}
