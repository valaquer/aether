import type { RequestHandler } from "./$types";
import { endHuddle } from "$lib/server/huddle-helpers";
import { HOUSTON_ROOM_ID } from "$lib/server/aether-db";

export const POST: RequestHandler = async ({ request }) => {
	const { roomId } = await request.json();
	if (!roomId) {
		return new Response(JSON.stringify({ error: "Missing roomId" }), { status: 400 });
	}

	if (roomId === HOUSTON_ROOM_ID) {
		return new Response(JSON.stringify({ error: "Cannot archive the HOUSTON watchtower" }), { status: 403 });
	}

	endHuddle(roomId);

	return new Response(JSON.stringify({ status: "archived", roomId }), {
		headers: { "Content-Type": "application/json" },
	});
};
