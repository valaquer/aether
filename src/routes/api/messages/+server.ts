import type { RequestHandler } from "./$types";
import { getMessages, getRoom, getActivityCards } from "$lib/server/aether-db";

export const GET: RequestHandler = async ({ url }) => {
	const room = url.searchParams.get("room");
	if (!room) {
		return new Response(JSON.stringify({ error: "Missing room parameter" }), { status: 400 });
	}

	const limitParam = url.searchParams.get("limit");
	const offsetParam = url.searchParams.get("offset");
	const sinceParam = url.searchParams.get("since");
	const typeParam = url.searchParams.get("type");
	const limit = limitParam ? parseInt(limitParam, 10) : undefined;
	const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

	let messages: ReturnType<typeof getMessages>;

	if (typeParam === "activity" && sinceParam) {
		messages = getActivityCards(room, sinceParam);
	} else {
		messages = getMessages(room, limit, offset);
	}

	if (messages.length === 0 && !limit && !typeParam) {
		const pastRoom = getRoom(room);
		if (pastRoom?.type === "past" && pastRoom?.originalRoomId) {
			messages = getMessages(pastRoom.originalRoomId, limit, offset);
		}
	}

	return new Response(JSON.stringify(messages), {
		headers: { "Content-Type": "application/json" },
	});
};
