const KEY = "__houstonHeartbeat";
const DEADMAN_KEY = "__houstonDeadman";
const STALE_MS = 5 * 60 * 1000;

interface HoustonHeartbeat {
	lastMs: number;
	state: Record<string, string>;
	pollerAlertFired: boolean;
}

if (!(globalThis as any)[KEY]) {
	(globalThis as any)[KEY] = { lastMs: Date.now(), state: {}, pollerAlertFired: false } as HoustonHeartbeat;
}

const heartbeat = (globalThis as any)[KEY] as HoustonHeartbeat;

export function updateHeartbeat(state: Record<string, string>): void {
	const wasStale = heartbeat.pollerAlertFired;
	heartbeat.lastMs = Date.now();
	heartbeat.state = state;
	heartbeat.pollerAlertFired = false;
	if (wasStale) {
		firePollerAlert("recovery");
	}
}

export function getHeartbeat(): { lastMs: number; state: Record<string, string>; stale: boolean } {
	const stale = Date.now() - heartbeat.lastMs > STALE_MS;
	return { lastMs: heartbeat.lastMs, state: heartbeat.state, stale };
}

function firePollerAlert(type: "incident" | "recovery") {
	const msg = type === "incident" ? "Houston poller down — no heartbeat for 5+ minutes" : "Houston poller recovered";
	if (type === "incident") {
		fetch("http://localhost:51730/api/houston-escalate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ reason: "poller_dead", message: msg }),
		}).catch(() => {});
	}
	fetch("http://localhost:51730/api/houston-alert", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ vendor: "houston-poller", message: msg, type }),
	}).catch(() => {});
}

if (!(globalThis as any)[DEADMAN_KEY]) {
	(globalThis as any)[DEADMAN_KEY] = setInterval(() => {
		const stale = Date.now() - heartbeat.lastMs > STALE_MS;
		if (stale && !heartbeat.pollerAlertFired) {
			heartbeat.pollerAlertFired = true;
			firePollerAlert("incident");
		}
	}, 60_000);
}
