import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { saveSpeedReaderChunk, getSpeedReaderChunks } from "$lib/server/aether-db";
import { emitEvent } from "$lib/server/events";

export const POST: RequestHandler = async ({ request }) => {
	const { session_id, chunk_text, chunk_index, is_last } = await request.json();

	if (!session_id || chunk_text === undefined || chunk_index === undefined) {
		return json({ error: "Missing required fields" }, { status: 400 });
	}

	saveSpeedReaderChunk(session_id, chunk_text, chunk_index, !!is_last);

	emitEvent({
		type: "speed_reader_chunk",
		id: session_id,
		content: chunk_text,
		sender: String(chunk_index),
		toolCall: !!is_last,
	});

	return json({ ok: true });
};

export const GET: RequestHandler = async ({ url }) => {
	const sessionId = url.searchParams.get("session");
	const afterStr = url.searchParams.get("after");

	if (!sessionId) {
		return json({ error: "Missing session parameter" }, { status: 400 });
	}

	const afterIndex = afterStr !== null ? parseInt(afterStr, 10) : undefined;
	const chunks = getSpeedReaderChunks(sessionId, afterIndex);

	return json({ chunks });
};
