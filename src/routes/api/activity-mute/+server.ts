import type { RequestHandler } from "./$types";
import { readFileSync, watch, existsSync } from "fs";
import { emitEvent } from "$lib/server/events";

const ACTIVITY_MUTE_FILE = "/Users/deepak-macmini/honeybloom/library/facade/activity-mute.md";

if (globalThis.__muteWatcher) globalThis.__muteWatcher.close();
if (existsSync(ACTIVITY_MUTE_FILE)) {
	let debounce: ReturnType<typeof setTimeout> | null = null;
	globalThis.__muteWatcher = watch(ACTIVITY_MUTE_FILE, () => {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			emitEvent({ type: "mute_update" });
		}, 500);
	});
}

export const GET: RequestHandler = async () => {
	try {
		const lines = readFileSync(ACTIVITY_MUTE_FILE, "utf-8")
			.split("\n")
			.map((l) => l.trim().toLowerCase())
			.filter((l) => l.length > 0 && l.includes(":"));
		const entries = lines.map((line) => {
			const [sender, room] = line.split(":", 2);
			return { sender, room };
		});
		return new Response(JSON.stringify(entries), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify([]), {
			headers: { "Content-Type": "application/json" },
		});
	}
};
