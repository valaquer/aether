import type { RequestHandler } from "./$types";
import { getPinnedRooms, pinRoom, unpinRoom } from "$lib/server/aether-db";

export const GET: RequestHandler = async () => {
	const rooms = getPinnedRooms();
	return new Response(JSON.stringify({ rooms }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const { action, roomId } = await request.json();

	if (action === "pin" && roomId) {
		pinRoom(roomId);
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "unpin" && roomId) {
		unpinRoom(roomId);
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify({ error: "Invalid action" }), {
		status: 400,
		headers: { "Content-Type": "application/json" },
	});
};
