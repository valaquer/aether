import type { RequestHandler } from "./$types";
import { getHuddleMembers, saveMessage } from "$lib/server/facade-db";
import { sendToKitty } from "$lib/server/kitten";
import { emitEvent } from "$lib/server/events";
import { v4 } from "uuid";

export const POST: RequestHandler = async ({ request }) => {
	const { sender, room, content } = await request.json();

	if (!sender || !room || !content) {
		return new Response(JSON.stringify({ error: "Missing sender, room, or content" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Direct rooms: no-op
	if (!room.startsWith("huddle-")) {
		return new Response(JSON.stringify({ delivered: 0 }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	const now = new Date().toISOString();
	const id = v4();

	// Save as a regular message from the teammate in the current room
	saveMessage({
		id,
		conversationId: room,
		sender,
		content,
		createdAt: now,
		type: "message",
	});

	// Emit SSE so the message appears in the chat panel
	emitEvent({
		type: "message",
		conversationId: room,
		sender,
		content,
		timestamp: now,
	});

	// Fan out to huddle members' Kitty tabs (excluding the teammate)
	const members = getHuddleMembers(room);
	let delivered = 0;

	for (const m of members) {
		if (m === sender) continue;
		try {
			await sendToKitty(m, {
				sender,
				room,
				body: content,
				timestamp: now,
			});
			delivered++;
		} catch {}
	}

	return new Response(JSON.stringify({ delivered }), {
		headers: { "Content-Type": "application/json" },
	});
};
