import type { RequestHandler } from "./$types";
import { endHuddle } from "$lib/server/huddle-helpers";

export const POST: RequestHandler = async ({ request }) => {
	const { roomId } = await request.json();
	if (!roomId) {
		return new Response(JSON.stringify({ error: "Missing roomId" }), { status: 400 });
	}

	endHuddle(roomId);

	return new Response(JSON.stringify({ status: "archived", roomId }), {
		headers: { "Content-Type": "application/json" },
	});
};
