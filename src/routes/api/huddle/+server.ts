import type { RequestHandler } from "./$types";
import {
	saveRoom,
	saveMessage,
	getHuddleMembers,
	getRoom,
	formatTimestamp,
	requestToken,
	initHuddleToken,
	resolveActiveRoom,
} from "$lib/server/aether-db";
import { emitEvent } from "$lib/server/events";
import { sendToKitty, isTabAlive } from "$lib/server/kitten";
import { endHuddle, removeFromHuddle } from "$lib/server/huddle-helpers";
import { startTokenTimer } from "$lib/server/token-helpers";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { v4 } from "uuid";

const execAsync = promisify(exec);

async function autoWake(name: string): Promise<string> {
	try {
		await execAsync(
			`/Users/deepak-macmini/honeybloom/library/scripts/kitty-open-teammate.sh --solo ${name}`,
			{ timeout: 15000 }
		);
		for (let i = 0; i < 60; i++) {
			if (await isTabAlive(name)) return "ready";
			await new Promise((r) => setTimeout(r, 500));
		}
		await new Promise((r) => setTimeout(r, 30000));
		if (await isTabAlive(name)) return "ready";
		return "wake_failed";
	} catch {
		return "wake_failed";
	}
}

async function ensureTabOpen(name: string): Promise<string> {
	const exists = await isTabAlive(name);
	if (!exists) return await autoWake(name);
	return "already_open";
}

export const POST: RequestHandler = async ({ request }) => {
	const { action, host, participants, sender, roomId } = await request.json();

	if (action === "start") {
		if (!host || !participants || !Array.isArray(participants)) {
			return new Response(JSON.stringify({ error: "Missing host or participants" }), {
				status: 400,
			});
		}

		const ts = formatTimestamp(new Date());
		const rid = `huddle-${host}-${ts}`;
		const allMembers = [host, ...participants.filter((p: string) => p !== host)].filter(
			(m: string) => m !== "boss"
		);

		const existingRoomId = resolveActiveRoom(`huddle-${host}`);
		if (existingRoomId) {
			return new Response(JSON.stringify({ roomId: existingRoomId, existing: true }), {
				headers: { "Content-Type": "application/json" },
			});
		}

		saveRoom({
			id: rid,
			type: "huddle",
			name: host,
			participants: allMembers,
			originalRoomId: `huddle-${host}`,
			lastActivity: new Date().toISOString(),
			startedAt: new Date().toISOString(),
		});
		initHuddleToken(rid);

		const results: string[] = [];
		try {
			emitEvent({ type: "huddle_update" });

			const wakePromises = allMembers.map(async (name) => {
				const wakeResult = await ensureTabOpen(name);
				return `${name}: ${wakeResult}`;
			});
			results.push(...(await Promise.all(wakePromises)));

			const invitation = `Huddle started by ${host}. Participants: ${allMembers.join(", ")}. Room: ${rid}`;
			const msg = {
				id: v4(),
				conversationId: rid,
				sender: "system",
				content: invitation,
				createdAt: new Date().toISOString(),
				type: "message",
			};
			saveMessage(msg);
			emitEvent({
				type: "message",
				conversationId: rid,
				sender: "system",
				content: invitation,
				timestamp: msg.createdAt,
			});

			for (const name of allMembers) {
				if (name === host) continue;
				sendToKitty(name, {
					sender: "system",
					room: rid,
					body: invitation,
					timestamp: msg.createdAt,
				}).catch(() => {});
			}
		} catch (e) {
			results.push(`post-commit error: ${e}`);
		}

		return new Response(JSON.stringify({ roomId: rid, results }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "end") {
		if (!roomId) return new Response(JSON.stringify({ error: "Missing roomId" }), { status: 400 });

		let room = getRoom(roomId);
		if (!room) {
			const resolved = resolveActiveRoom(roomId);
			if (resolved) room = getRoom(resolved);
		}
		if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });

		endHuddle(room.id);

		return new Response(JSON.stringify({ status: "ended", roomId: room.id }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "add") {
		if (!roomId || !participants || !Array.isArray(participants)) {
			return new Response(JSON.stringify({ error: "Missing roomId or participants" }), {
				status: 400,
			});
		}

		const room = getRoom(roomId);
		if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });

		const current = getHuddleMembers(roomId).filter((m: string) => m !== "boss");
		const cleanP = (participants as string[]).filter((p: string) => p !== "boss");
		const newlyAdded = cleanP.filter((p) => !current.includes(p));
		const updated = [...new Set([...current, ...cleanP])];
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

		if (newlyAdded.length > 0) {
			await Promise.all(newlyAdded.map((name) => ensureTabOpen(name)));

			const notification = `${newlyAdded.join(", ")} added to huddle ${roomId}.`;
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
		}

		return new Response(JSON.stringify({ status: "added", roomId, participants: updated }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "remove") {
		if (!roomId || !participants || !Array.isArray(participants)) {
			return new Response(JSON.stringify({ error: "Missing roomId or participants" }), {
				status: 400,
			});
		}

		const room = getRoom(roomId);
		if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404 });

		const updated = removeFromHuddle(roomId, participants);

		if (updated === null) {
			return new Response(
				JSON.stringify({ status: "ended", roomId, reason: "no_participants_left" }),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		return new Response(JSON.stringify({ status: "removed", roomId, participants: updated }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	if (action === "request") {
		if (!sender || !roomId) {
			return new Response(JSON.stringify({ error: "Missing sender or roomId" }), { status: 400 });
		}
		const result = requestToken(sender.toLowerCase(), roomId);
		if (result.startsWith("granted")) {
			startTokenTimer(roomId);
		}
		return new Response(JSON.stringify({ result }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
};
