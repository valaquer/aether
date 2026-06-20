import type { RequestHandler } from "./$types";
import { getMessages } from "$lib/server/aether-db";
import { writeFileSync } from "fs";

export const POST: RequestHandler = async ({ request }) => {
	const { roomId } = await request.json();
	if (!roomId) {
		return new Response(JSON.stringify({ error: "Missing roomId" }), { status: 400 });
	}

	const messages = getMessages(roomId).filter(
		(m) => m.type !== "tool_call" && m.type !== "response"
	);

	const header = `--- ${roomId} ---`;
	const msgs = messages.map((m) => `[${m.createdAt}] ${m.sender}: ${m.content}`).join("\n");
	const formatted = `${header}\n${msgs}`;

	const filePath = `/tmp/room-${roomId}.md`;
	writeFileSync(filePath, formatted || "No messages found for this room.");

	return new Response(JSON.stringify({ filePath }), {
		headers: { "Content-Type": "application/json" },
	});
};
