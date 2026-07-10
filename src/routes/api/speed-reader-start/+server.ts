import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { sendToKitty } from "$lib/server/kitten";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204, headers: corsHeaders });
};

export const POST: RequestHandler = async ({ request }) => {
	const { session_id, text } = await request.json();

	if (!session_id || !text) {
		return json({ error: "Missing session_id or text" }, { status: 400, headers: corsHeaders });
	}

	const body = `[speed-reader-session: ${session_id}]\n${text}`;

	try {
		await sendToKitty("jeh", {
			sender: "boss",
			room: "direct-jeh",
			body,
			timestamp: new Date().toISOString(),
		});
		return json({ ok: true, session_id }, { headers: corsHeaders });
	} catch (err) {
		return json({ error: `Failed to send to Jeh: ${err instanceof Error ? err.message : String(err)}` }, { status: 500, headers: corsHeaders });
	}
};
