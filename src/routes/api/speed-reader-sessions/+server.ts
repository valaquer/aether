import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { saveSpeedReaderSession, searchSpeedReaderSessions, listSpeedReaderSessions } from "$lib/server/aether-db";

export const POST: RequestHandler = async ({ request }) => {
	const { session_id, label, source } = await request.json();

	if (!session_id || !label) {
		return json({ error: "Missing session_id or label" }, { status: 400 });
	}

	saveSpeedReaderSession(session_id, label, source);
	return json({ ok: true });
};

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get("q");

	if (query) {
		const sessions = searchSpeedReaderSessions(query);
		return json({ sessions });
	}

	const sessions = listSpeedReaderSessions();
	return json({ sessions });
};
