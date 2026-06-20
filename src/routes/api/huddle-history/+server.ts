import type { RequestHandler } from "./$types";
import { getRoomsByType, getMessages } from "$lib/server/aether-db";

export const GET: RequestHandler = async ({ url }) => {
	const roomId = url.searchParams.get("roomId");
	const host = url.searchParams.get("host");
	const date = url.searchParams.get("date");

	if (roomId) {
		const messages = getMessages(roomId).filter(
			(m) => m.type !== "tool_call" && m.type !== "response"
		);
		if (messages.length === 0) {
			return new Response(JSON.stringify({ error: "No messages found for this room" }), {
				status: 404,
			});
		}
		const results = [
			{
				roomId,
				host: roomId.split("-")[1] || "unknown",
				startedAt: messages[0]?.createdAt || "",
				messages: messages.map((m) => ({
					sender: m.sender,
					content: m.content,
					createdAt: m.createdAt,
				})),
			},
		];
		return new Response(JSON.stringify(results), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!host) {
		return new Response(JSON.stringify({ error: "Missing host parameter" }), { status: 400 });
	}

	const pastRooms = getRoomsByType("past");
	const matchingRooms = pastRooms.filter((room) => {
		const isHuddle = room.id.startsWith("huddle-");
		const matchesHost = room.name === host;
		const matchesDate = date ? room.id.includes(date) : true;
		return isHuddle && matchesHost && matchesDate;
	});

	if (matchingRooms.length === 0) {
		return new Response(JSON.stringify({ error: "No matching huddle found" }), { status: 404 });
	}

	const results = matchingRooms.map((room) => {
		const messages = getMessages(room.id).filter(
			(m) => m.type !== "tool_call" && m.type !== "response"
		);
		return {
			roomId: room.id,
			host: room.name,
			startedAt: room.startedAt,
			messages: messages.map((m) => ({
				sender: m.sender,
				content: m.content,
				createdAt: m.createdAt,
			})),
		};
	});

	return new Response(JSON.stringify(results), {
		headers: { "Content-Type": "application/json" },
	});
};
