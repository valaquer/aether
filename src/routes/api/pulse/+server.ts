import type { RequestHandler } from "./$types";
import { emitEvent } from "$lib/server/events";
import { isTabAlive, sendToKitty } from "$lib/server/kitten";
import { execFile } from "child_process";
import { promisify } from "util";
import { readdirSync, readFileSync } from "fs";

const execFileAsync = promisify(execFile);
const LAUNCH_SCRIPT = "/Users/deepak-macmini/honeybloom/library/scripts/kitty-open-teammate.sh";
const STATE_DIR = "/Users/deepak-macmini/honeybloom/library/facade/reminders-state";

export const POST: RequestHandler = async ({ request }) => {
	const { teammate, reason } = await request.json();
	if (!teammate) {
		return new Response(JSON.stringify({ error: "teammate required" }), { status: 400 });
	}

	const wasAlive = await isTabAlive(teammate);

	if (!wasAlive) {
		try {
			await execFileAsync(LAUNCH_SCRIPT, ["--solo", teammate], { timeout: 30000 });
			// Wait for sidebar registration
			await new Promise((resolve) => setTimeout(resolve, 5000));
		} catch (err) {
			console.error(
				`[pulse] Failed to launch ${teammate}:`,
				err instanceof Error ? err.message : String(err)
			);
		}
	}

	// Send reason message via Kitty
	if (reason) {
		const ts = new Date().toISOString();
		const body = wasAlive
			? `Time to remind Boss about ${reason}.`
			: `You woke up because of a reminder: ${reason}. Get up to speed on the context and remind Boss.`;
		await sendToKitty(teammate, {
			sender: "boss",
			room: `direct-${teammate}`,
			body,
			timestamp: ts,
		});
	}

	emitEvent({ type: "pulse_update", teammate });

	return new Response(JSON.stringify({ ok: true, teammate, woken: !wasAlive }), {
		headers: { "Content-Type": "application/json" },
	});
};

// GET — returns list of teammates with pending reminders (for client reconnect/mount)
export const GET: RequestHandler = async () => {
	try {
		const files = readdirSync(STATE_DIR).filter((f) => f.endsWith(".pending"));
		const pending: { teammate: string; reason: string }[] = [];
		const seen = new Set<string>();
		for (const f of files) {
			const teammate = f.replace(/-[^-]+\.pending$/, "");
			if (!seen.has(teammate)) {
				seen.add(teammate);
				try {
					const content = readFileSync(`${STATE_DIR}/${f}`, "utf-8");
					const reasonLine = content.split("\n").find((l) => l.startsWith("reason:"));
					pending.push({ teammate, reason: reasonLine?.replace("reason:", "").trim() ?? "" });
				} catch {
					pending.push({ teammate, reason: "" });
				}
			}
		}
		return new Response(JSON.stringify({ pending }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ pending: [] }), {
			headers: { "Content-Type": "application/json" },
		});
	}
};
