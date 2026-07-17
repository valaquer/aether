import type { RequestHandler } from "./$types";
import { updateHeartbeat, getHeartbeat } from "$lib/server/houston-state";

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	updateHeartbeat(body.state || {});
	return new Response(JSON.stringify({ ok: true }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const GET: RequestHandler = async () => {
	const hb = getHeartbeat();
	return new Response(JSON.stringify(hb), {
		headers: { "Content-Type": "application/json" },
	});
};
