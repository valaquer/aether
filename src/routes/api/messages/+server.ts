import type { RequestHandler } from "./$types";
import { getMessages, getRoom } from "$lib/server/aether-db";

export const GET: RequestHandler = async ({ url }) => {
	const room = url.searchParams.get("room");
	if (!room) {
		return new Response(JSON.stringify({ error: "Missing room parameter" }), { status: 400 });
	}

	const limitParam = url.searchParams.get("limit");
	const offsetParam = url.searchParams.get("offset");
	const limit = limitParam ? parseInt(limitParam, 10) : undefined;
	const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

	let messages = getMessages(room, limit, offset);

	if (messages.length === 0 && !limit) {
		const pastRoom = getRoom(room);
		if (pastRoom?.type === "past" && pastRoom?.originalRoomId) {
			messages = getMessages(pastRoom.originalRoomId, limit, offset);
		}
	}

	return new Response(JSON.stringify(messages), {
		headers: { "Content-Type": "application/json" },
	});
};
