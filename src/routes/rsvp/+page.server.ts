import type { PageServerLoad } from "./$types";
import { getMessages } from "$lib/server/aether-db";
import { sendToKitty } from "$lib/server/kitten";

export const load: PageServerLoad = async ({ url }) => {
	const roomId = url.searchParams.get("roomId");
	const startFrom = url.searchParams.get("startFrom");
	const sessionId = url.searchParams.get("session");

	const mode = url.searchParams.get("mode");

	if (sessionId) {
		const sectioned = url.searchParams.get("sectioned") === "true";
		return { messages: [], error: null, sessionId, sectioned };
	}

	if (mode === "paste") {
		return { messages: [], error: null, pasteMode: true };
	}

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

	const messages = allMessages.slice(startIndex);

	// Route through Jeh — concatenate messages into text, send via sendToKitty
	const sid = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
	const text = messages.map((m) => `${m.sender.charAt(0).toUpperCase() + m.sender.slice(1)}:\n${m.content}`).join('\n\n---\n\n');

	try {
		await sendToKitty("jeh", {
			sender: "boss",
			room: "direct-jeh",
			body: `[speed-reader-session: ${sid}]\n${text}`,
			timestamp: new Date().toISOString(),
		});
	} catch {}

	return { messages: [], error: null, sessionId: sid, roomId };
};
