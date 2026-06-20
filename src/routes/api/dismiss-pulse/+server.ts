import type { RequestHandler } from "./$types";
import { emitEvent } from "$lib/server/events";
import { readdirSync, unlinkSync } from "fs";

const STATE_DIR = "/Users/deepak-macmini/honeybloom/library/aether/reminders-state";

export const POST: RequestHandler = async ({ request }) => {
	const { teammate } = await request.json();
	if (!teammate) {
		return new Response(JSON.stringify({ error: "teammate required" }), { status: 400 });
	}

	// Delete ALL pending files for this teammate
	try {
		const files = readdirSync(STATE_DIR).filter(
			(f) => f.startsWith(`${teammate}-`) && f.endsWith(".pending")
		);
		for (const f of files) {
			try {
				unlinkSync(`${STATE_DIR}/${f}`);
			} catch {}
		}
	} catch {}

	emitEvent({ type: "pulse_dismiss", teammate });

	return new Response(JSON.stringify({ ok: true, teammate }), {
		headers: { "Content-Type": "application/json" },
	});
};
