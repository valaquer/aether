import { clearTokenTimer, advanceTokenAndNotify, startTokenTimer } from "./token-helpers";
import {
	setRoomType,
	getHuddleMembers,
	getRoom,
	saveRoom,
	saveMessage,
	getRoomsByType,
} from "./aether-db";
import { emitEvent } from "./events";
import { sendToKitty } from "./kitten";
import { v4 } from "uuid";

export function endHuddle(roomId: string): void {
	const room = getRoom(roomId);
	if (!room) return;

	clearTokenTimer(roomId);

	const members = getHuddleMembers(roomId);

	setRoomType(roomId, "past");
	emitEvent({ type: "huddle_update" });

	const notification = `Huddle ${roomId} has ended.`;
	const msg = {
		id: v4(),
		conversationId: roomId,
		sender: "system",
		content: notification,
		createdAt: new Date().toISOString(),
		type: "message",
	};
	saveMessage(msg);
	emitEvent({
		type: "message",
		conversationId: roomId,
		sender: "system",
		content: notification,
		timestamp: msg.createdAt,
	});

	for (const name of members) {
		sendToKitty(name, {
			sender: "system",
			room: roomId,
			body: notification,
			timestamp: msg.createdAt,
		}).catch(() => {});
	}
}

/**
 * Remove participants from a huddle. Handles token cleanup, system notification,
 * SSE emit, and Kitty fan-out. Auto-ends huddle if no participants remain.
 * Returns the updated participant list, or null if the huddle was ended.
 */
export function removeFromHuddle(roomId: string, participants: string[]): string[] | null {
	const room = getRoom(roomId);
	if (!room) return null;

	const current = getHuddleMembers(roomId);
	const updated = current.filter((m: string) => !participants.includes(m));

	if (updated.length === 0) {
		clearTokenTimer(roomId);
		setRoomType(roomId, "past");
		emitEvent({ type: "huddle_update" });
		return null;
	}

	saveRoom({
		id: roomId,
		type: "huddle",
		name: room.name,
		participants: updated,
		originalRoomId: `huddle-${room.name}`,
		lastActivity: new Date().toISOString(),
		startedAt: room.startedAt,
	});

	emitEvent({ type: "huddle_update" });

	for (const p of participants) {
		clearTokenTimer(roomId);
		const next = advanceTokenAndNotify(roomId, p);
		if (next) {
			startTokenTimer(roomId);
		}
	}

	const notification = `${participants.join(", ")} removed from huddle ${roomId}.`;
	const msg = {
		id: v4(),
		conversationId: roomId,
		sender: "system",
		content: notification,
		createdAt: new Date().toISOString(),
		type: "message",
	};
	saveMessage(msg);
	emitEvent({
		type: "message",
		conversationId: roomId,
		sender: "system",
		content: notification,
		timestamp: msg.createdAt,
	});

	for (const name of updated) {
		sendToKitty(name, {
			sender: "system",
			room: roomId,
			body: notification,
			timestamp: msg.createdAt,
		}).catch(() => {});
	}

	return updated;
}

/**
 * Remove a teammate from ALL active huddles they're in.
 * Used by the deactivate endpoint at session end.
 */
export function removeFromAllHuddles(teammate: string): void {
	const huddles = getRoomsByType("huddle");
	for (const huddle of huddles) {
		const members = getHuddleMembers(huddle.id);
		if (members.includes(teammate)) {
			removeFromHuddle(huddle.id, [teammate]);
		}
	}
}
