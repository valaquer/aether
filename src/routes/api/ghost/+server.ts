import type { RequestHandler } from "./$types";
import { getAliveTeammates, closeKittyTab } from "$lib/server/kitten";
import { getRoomsByType } from "$lib/server/aether-db";
import { endHuddle } from "$lib/server/huddle-helpers";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const SSH_KEY = "/Users/deepak-macmini/.ssh/id_hanover";
const MINI_USER = "deepak-macmini";
const MINI_HOST = "192.168.0.186";

// POST — kill all Kitty tabs (iMac + Mini), archive huddles, preserve rooms for Zap
export const POST: RequestHandler = async () => {
	// Step 1: Kill all Kitty tabs on iMac (without deactivating rooms)
	const alive = await getAliveTeammates();
	const killPromises: Promise<boolean>[] = [];
	for (const name of alive) {
		killPromises.push(closeKittyTab(name));
	}
	await Promise.all(killPromises);

	// Step 2: Kill claude processes on Mini via SSH
	try {
		await execFileAsync(
			"ssh",
			[
				"-i",
				SSH_KEY,
				"-o",
				"ConnectTimeout=5",
				"-o",
				"StrictHostKeyChecking=no",
				`${MINI_USER}@${MINI_HOST}`,
				"pkill -f claude; pkill -f opencode; true",
			],
			{ timeout: 10000 }
		);
	} catch {
		// Mini may be off or have no processes — not fatal
	}

	// Step 3: Archive all active huddles
	const huddles = getRoomsByType("huddle");
	for (const huddle of huddles) {
		try {
			endHuddle(huddle.id);
		} catch {
			// Per-huddle try-catch — one failure doesn't block the rest
		}
	}

	return new Response(JSON.stringify({ killed: [...alive] }), {
		headers: { "Content-Type": "application/json" },
	});
};
