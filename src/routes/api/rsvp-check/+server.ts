import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMessages } from "$lib/server/aether-db";

export const GET: RequestHandler = async ({ url }) => {
	const roomId = url.searchParams.get("roomId");
	const after = url.searchParams.get("after");

	if (!roomId || !after) {
		return json({ messages: [] });
	}

	const allMessages = getMessages(roomId).filter(
		(m) => m.type !== "tool_call" && m.type !== "response" && m.sender !== "system"
	);

	const afterIndex = allMessages.findIndex((m) => m.id === after);
	if (afterIndex === -1 || afterIndex >= allMessages.length - 1) {
		return json({ messages: [] });
	}

	const messages = allMessages.slice(afterIndex + 1).map((m) => ({
		id: m.id,
		sender: m.sender,
		content: m.content,
	}));

	return json({ messages });
};
