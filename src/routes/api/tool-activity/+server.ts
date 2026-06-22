import type { RequestHandler } from "./$types";
import { emitEvent } from "$lib/server/events";
import { saveMessage, getActiveRoomsForTeammate } from "$lib/server/aether-db";
import { sendToKitty } from "$lib/server/kitten";
import { getHuddleMembers } from "$lib/server/aether-db";
import { v4 } from "uuid";

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const { sender, room, body } = data;

	const isResponse = !data.toolName && !!body;
	const isToolCall = !!data.toolName;

	if (!sender) {
		return new Response(JSON.stringify({ error: "Missing sender" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (isToolCall && !room) {
		return new Response(JSON.stringify({ error: "Missing room for tool call" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (!isResponse && !isToolCall) {
		return new Response(JSON.stringify({ error: "Provide toolName + tool fields, or body" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const activeRooms = getActiveRoomsForTeammate(sender);
	if (room && activeRooms.length === 0) activeRooms.push(room);

	const createdAt = new Date().toISOString();
	const content = isToolCall
		? JSON.stringify({
				toolName: data.toolName,
				toolInput: data.toolInput,
				toolOutput: data.toolOutput,
				status: data.status,
				summary: data.summary || "",
			})
		: body;
	const msgType = isToolCall ? "tool_call" : "response";
	const toolCallFlag = isToolCall;

	for (const targetRoom of activeRooms) {
		const id = v4();
		saveMessage({
			id,
			conversationId: targetRoom,
			sender,
			content,
			createdAt,
			type: msgType,
		});

		emitEvent({
			type: "message",
			conversationId: targetRoom,
			sender,
			content,
			timestamp: createdAt,
			toolCall: toolCallFlag,
			response: isResponse,
			summary: data.summary,
		});

		// Fan-out tool activity to huddle members' Kitty tabs (live mirror)
		if (targetRoom.startsWith("huddle-") && isToolCall && !isResponse) {
			const members = getHuddleMembers(targetRoom);
			for (const m of members) {
				if (m !== sender) {
					const input = typeof data.toolInput === "string" ? data.toolInput : JSON.stringify(data.toolInput || "");
					const label = data.summary || `[live-mirror] ${data.toolName}: ${input.substring(0, 200)}`;
					sendToKitty(m, { sender, room: targetRoom, body: label, timestamp: createdAt }).catch(() => {});
				}
			}
		}

	}

	const resData = isToolCall
		? { sender, toolName: data.toolName, status: data.status, createdAt, rooms: activeRooms }
		: { sender, createdAt, rooms: activeRooms };
	return new Response(JSON.stringify(resData), {
		headers: { "Content-Type": "application/json" },
	});
};
