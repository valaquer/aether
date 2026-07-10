import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { stopSpeedReaderSession } from "$lib/server/aether-db";

export const POST: RequestHandler = async ({ request }) => {
	const { session_id } = await request.json();

	if (!session_id) {
		return json({ error: "Missing session_id" }, { status: 400 });
	}

	stopSpeedReaderSession(session_id);
	return json({ ok: true });
};
