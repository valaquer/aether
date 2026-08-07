import type { RequestHandler } from "./$types";
import { resolveActiveRoom, saveRoom, formatTimestamp, getAllRooms, getHuddleMembers, saveMessage } from "$lib/server/aether-db";
import { activateTeammate, getActiveTeammates } from "$lib/server/active-teammates";
import { emitEvent } from "$lib/server/events";
import { sendToKitty } from "$lib/server/kitten";
import { v4 } from "uuid";

export const POST: RequestHandler = async ({ request }) => {
	const { name } = await request.json();
	if (!name) {
		return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 });
	}

	const teammate = name.toLowerCase();
	const baseRoomId = `direct-${teammate}`;

	if (!resolveActiveRoom(baseRoomId)) {
		const ts = formatTimestamp(new Date());
		saveRoom({
			id: `direct-${teammate}-${ts}`,
			type: "teammate",
			name: teammate,
			originalRoomId: baseRoomId,
			lastActivity: new Date().toISOString(),
			startedAt: new Date().toISOString(),
		});
	}

	const prevActive = getActiveTeammates();
	if (!prevActive.includes(teammate)) {
		activateTeammate(teammate);

		const activeHuddles = getAllRooms().filter(r => r.type === "huddle");
		for (const huddle of activeHuddles) {
			const members = getHuddleMembers(huddle.id);
			if (members.some((m: string) => m.toLowerCase() === teammate)) {
				const notification = `${teammate} is back.`;
				const createdAt = new Date().toISOString();
				const msg = { id: v4(), conversationId: huddle.id, sender: "system", content: notification, createdAt, type: "message" };
				saveMessage(msg);
				emitEvent({ type: "message", id: msg.id, conversationId: huddle.id, sender: "system", content: notification, timestamp: createdAt });
				for (const m of members) {
					if (m.toLowerCase() !== teammate) {
						sendToKitty(m, { sender: "system", room: huddle.id, body: notification, timestamp: createdAt }).catch(() => {});
					}
				}
			}
		}
	}

	emitEvent({ type: "huddle_update" });

	return new Response(JSON.stringify({ status: "activated", name: teammate }), {
		headers: { "Content-Type": "application/json" },
	});
};
