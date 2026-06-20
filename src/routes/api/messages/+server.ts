import type { RequestHandler } from "./$types";
import { getMessages, getRoom } from "$lib/server/facade-db";

export const GET: RequestHandler = async ({ url }) => {
	const room = url.searchParams.get("room");
	if (!room) {
		return new Response(JSON.stringify({ error: "Missing room parameter" }), { status: 400 });
	}

	let messages = getMessages(room);

	// Past direct rooms have orphaned messages under originalRoomId
	if (messages.length === 0) {
		const pastRoom = getRoom(room);
		if (pastRoom?.type === "past" && pastRoom?.originalRoomId) {
			messages = getMessages(pastRoom.originalRoomId);
		}
	}

	return new Response(JSON.stringify(messages), {
		headers: { "Content-Type": "application/json" },
	});
};
