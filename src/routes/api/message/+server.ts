import type { RequestHandler } from "./$types";
import { sendToKitty, isTabAlive, launchTeammate } from "$lib/server/kitten";
import { emitEvent } from "$lib/server/events";
import {
	saveMessage,
	resolveActiveRoom,
	saveRoom,
	formatTimestamp,
	roomExists,
	getHuddleMembers,
	getTokenHolder,
} from "$lib/server/aether-db";
import {
	advanceTokenAndNotify,
	clearTokensAndNotify,
	startTokenTimer,
	clearTokenTimer,
	forceAssignTokenAndNotify,
} from "$lib/server/token-helpers";

import { v4 } from "uuid";
import fs from "fs";

interface StoredMessage {
	id: string;
	conversationId: string;
	sender: string;
	content: string;
	createdAt: string;
	type: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const { sender, body, room } = await request.json();

	if (!sender || !body || !room) {
		return new Response(JSON.stringify({ error: "Missing sender, body, or room" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}

	const id = v4();
	const createdAt = new Date().toISOString();

	let resolvedRoom = room === "direct-boss" ? `direct-${sender}` : room;
	// REQ-78: resolve active room FIRST — prevents past/ghost rooms from intercepting short-form IDs
	const activeRoom = resolveActiveRoom(resolvedRoom);
	if (activeRoom) {
		resolvedRoom = activeRoom;
	} else if (!roomExists(resolvedRoom)) {
		if (resolvedRoom.startsWith("huddle-")) {
			return new Response(
				JSON.stringify({
					error: `Huddle room not found: ${resolvedRoom}. Use the full room ID from the system notification.`,
				}),
				{ status: 404, headers: { "Content-Type": "application/json" } }
			);
		} else {
			// Strip session-scoped timestamps to prevent double-timestamp malformation
			// Models may fabricate IDs like direct-katja-20260610-062025 from UTC timestamps
			const scopedMatch = resolvedRoom.match(/^(direct-[a-z]+)-\d{8}-\d{6}/);
			if (scopedMatch) {
				resolvedRoom = scopedMatch[1];
				const retryRoom = resolveActiveRoom(resolvedRoom);
				if (retryRoom) resolvedRoom = retryRoom;
			}
			if (!roomExists(resolvedRoom)) {
				const ts = formatTimestamp(new Date());
				const name = resolvedRoom.replace("direct-", "");
				resolvedRoom = `direct-${name}-${ts}`;
				saveRoom({
					id: resolvedRoom,
					type: "teammate",
					name,
					originalRoomId: `direct-${name}`,
					lastActivity: createdAt,
					startedAt: createdAt,
				});
			}
		}
	}

	// Huddle token: must hold token to post
	if (resolvedRoom.startsWith("huddle-") && sender !== "boss" && sender !== "system") {
		const holder = getTokenHolder(resolvedRoom);
		if (holder !== sender) {
			return new Response(
				JSON.stringify({
					rejected: true,
					message:
						"Your message was not delivered. You need to request the token before posting in a huddle.",
				}),
				{ status: 403, headers: { "Content-Type": "application/json" } }
			);
		}
	}

	// --- Command handling ---
	if (body.startsWith("/")) {
		const parts = body.trim().split(/[\s,]+/);
		const command = parts[0].toLowerCase();
		let systemContent = "";

		if (command === "/start-livemirror") {
			const globalFlag = "/Users/deepak-macmini/honeybloom/library/aether/livemirror-global";
			fs.writeFileSync(globalFlag, new Date().toISOString());
			emitEvent({ type: "livemirror_status", active: true });
			systemContent = "Live mirror started for all teammates";
		} else if (command === "/end-livemirror") {
			const globalFlag = "/Users/deepak-macmini/honeybloom/library/aether/livemirror-global";
			try {
				fs.unlinkSync(globalFlag);
			} catch {
				/* already off */
			}
			// Clean up any leftover per-teammate flags
			try {
				const dir = fs.readdirSync("/tmp");
				for (const f of dir) {
					if (f.startsWith("aether-relay-active-")) {
						fs.unlinkSync(`/tmp/${f}`);
					}
				}
			} catch {
				// ignore
			}
			emitEvent({ type: "livemirror_status", active: false });
			systemContent = "Live mirror stopped";
		}

		if (systemContent) {
			const sysMsg: StoredMessage = {
				id,
				conversationId: resolvedRoom,
				sender: "system",
				content: systemContent,
				createdAt,
				type: "message",
			};
			saveMessage(sysMsg);
			emitEvent({
				type: "message",
				id,
				conversationId: resolvedRoom,
				sender: "system",
				content: systemContent,
				timestamp: createdAt,
			});
			return new Response(
				JSON.stringify({
					id,
					conversationId: resolvedRoom,
					sender: "system",
					content: systemContent,
					createdAt,
				}),
				{
					headers: { "Content-Type": "application/json" },
				}
			);
		}
		// Unknown command — fall through to regular message handling
	}

	const msg: StoredMessage = {
		id,
		conversationId: resolvedRoom,
		sender,
		content: body,
		createdAt,
		type: "message",
	};

	saveMessage(msg);

	emitEvent({
		type: "message",
		id,
		conversationId: resolvedRoom,
		sender,
		content: body,
		timestamp: createdAt,
	});

	// System messages are Aether-only — no Kitty forwarding
	if (sender === "system") {
		return new Response(
			JSON.stringify({ id, conversationId: resolvedRoom, sender, content: body, createdAt }),
			{
				headers: { "Content-Type": "application/json" },
			}
		);
	}

	// Fan-out for huddle rooms: deliver to all members
	if (resolvedRoom.startsWith("huddle-")) {
		const members = getHuddleMembers(resolvedRoom);
		for (const m of members) {
			if (m !== sender) {
				sendToKitty(m, { sender, room: resolvedRoom, body, timestamp: createdAt }).catch(() => {});
			}
		}
		if (sender === "boss") {
			// Boss-mention token priority: if first word is a participant's name, assign token to them
			const firstWord = body
				.trim()
				.split(/\s+/)[0]
				.replace(/[,.:!?;]+$/, "")
				.toLowerCase();
			const mentioned = members.find((m: string) => m.toLowerCase() === firstWord);
			if (mentioned) {
				forceAssignTokenAndNotify(resolvedRoom, mentioned);
				startTokenTimer(resolvedRoom);
			} else {
				clearTokenTimer(resolvedRoom);
				clearTokensAndNotify(resolvedRoom);
			}
		} else {
			// Auto-release token if sender holds it
			clearTokenTimer(resolvedRoom);
			const next = advanceTokenAndNotify(resolvedRoom, sender);
			if (next) {
				startTokenTimer(resolvedRoom);
			}
		}
	} else {
		// Deliver to the room owner's Kitty tab, unless the sender owns the room
		const nameMatch = resolvedRoom.match(/^direct-(.+?)-\d{8}-\d{6}$/);
		const targetTeammate = (
			nameMatch ? nameMatch[1] : resolvedRoom.replace(/^direct-/, "")
		).toLowerCase();
		if (targetTeammate !== sender) {
			// Auto-wake closed teammate on incoming message (non-boss senders only)
			let woke = false;
			if (sender !== "boss") {
				const alive = await isTabAlive(targetTeammate);
				if (!alive) {
					try {
						await launchTeammate(targetTeammate);
						woke = true;
					} catch {}
				}
			}
			const msg = { sender, room: resolvedRoom, body, timestamp: createdAt };
			if (woke) {
				setTimeout(() => {
					sendToKitty(targetTeammate, msg).catch(() => {});
				}, 30000);
			} else {
				sendToKitty(targetTeammate, msg).catch(() => {});
			}
		}
	}

	return new Response(
		JSON.stringify({ id, conversationId: resolvedRoom, sender, content: body, createdAt }),
		{
			headers: { "Content-Type": "application/json" },
		}
	);
};
