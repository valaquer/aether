import type { PageServerLoad } from "./$types";
import { getMessages } from "$lib/server/aether-db";

export const load: PageServerLoad = async ({ url }) => {
	const roomId = url.searchParams.get("roomId");
	const startFrom = url.searchParams.get("startFrom");

	if (!roomId) {
		return { messages: [], error: "Missing roomId" };
	}

	const allMessages = getMessages(roomId).filter(
		(m) => m.type !== "tool_call" && m.type !== "response" && m.sender !== "system"
	);

	if (allMessages.length === 0) {
		return { messages: [], error: "No messages found" };
	}

	let startIndex = 0;
	if (startFrom) {
		const found = allMessages.findIndex((m) => m.id === startFrom);
		if (found !== -1) startIndex = found;
	}

	const messages = allMessages.slice(startIndex).map((m) => ({
		sender: m.sender,
		content: m.content,
	}));

	return { messages, error: null };
};
