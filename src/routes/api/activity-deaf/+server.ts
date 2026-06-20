import type { RequestHandler } from "./$types";
import { readFileSync, watch, existsSync } from "fs";
import { emitEvent } from "$lib/server/events";

const ACTIVITY_DEAF_FILE = "/Users/deepak-macmini/honeybloom/library/facade/activity-deaf.md";

if (globalThis.__deafWatcher) globalThis.__deafWatcher.close();
if (existsSync(ACTIVITY_DEAF_FILE)) {
	let debounce: ReturnType<typeof setTimeout> | null = null;
	globalThis.__deafWatcher = watch(ACTIVITY_DEAF_FILE, () => {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			emitEvent({ type: "deaf_update" });
		}, 500);
	});
}

export const GET: RequestHandler = async () => {
	try {
		const lines = readFileSync(ACTIVITY_DEAF_FILE, "utf-8")
			.split("\n")
			.map((l) => l.trim().toLowerCase())
			.filter((l) => l.length > 0 && l.includes(":"));
		const entries = lines.map((line) => {
			const [recipient, room] = line.split(":", 2);
			return { recipient, room };
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
