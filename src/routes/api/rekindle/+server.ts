import type { RequestHandler } from "./$types";
import { getHuddleMembers, resolveActiveRoom, getRoomsByType } from "$lib/server/aether-db";
import { isTabAlive, sendToKitty, launchTeammate } from "$lib/server/kitten";
import fs from "fs";

const ORG_PATH = "/Users/deepak-macmini/honeybloom/library/ORG.md";

function loadRoster(): string[] {
	try {
		const raw = fs.readFileSync(ORG_PATH, "utf-8");
		return raw
			.split("\n")
			.filter((l) => l.startsWith("Teammate: "))
			.map((l) => l.replace("Teammate: ", "").trim().toLowerCase());
	} catch {
		return [];
	}
}

// POST — rekindle all amber teammates (dead tab + active room)
export const POST: RequestHandler = async () => {
	const roster = loadRoster();
	const rekindled: string[] = [];
	const skipped: string[] = [];

	for (const name of roster) {
		const alive = await isTabAlive(name);
		if (alive) {
			skipped.push(name);
			continue;
		}

		const activeRoom = resolveActiveRoom(`direct-${name}`);
		if (!activeRoom) continue;

		const launched = await launchTeammate(name);
		if (launched) rekindled.push(name);
	}

	// Send catch-up message to rekindled teammates
	const activeHuddles = getRoomsByType("huddle");
	for (const name of rekindled) {
		const directRoomId = resolveActiveRoom(`direct-${name}`);
		const huddleRoomIds: string[] = [];
		for (const huddle of activeHuddles) {
			const members = getHuddleMembers(huddle.id);
			if (members.includes(name)) huddleRoomIds.push(huddle.id);
		}

		const rooms: string[] = [];
		if (directRoomId) rooms.push(directRoomId);
		rooms.push(...huddleRoomIds);
		if (rooms.length === 0) continue;

		const ts = new Date().toISOString();
		const body = `You were part of the following rooms and huddles and have been rekindled back into them after a brief disconnection. Use read_room to catch up:\n${rooms.join("\n")}`;
		await sendToKitty(name, { sender: "boss", room: `direct-${name}`, body, timestamp: ts });
	}

	return new Response(JSON.stringify({ rekindled, skipped }), {
		headers: { "Content-Type": "application/json" },
	});
};

// GET — count amber teammates (dead tab + active room)
export const GET: RequestHandler = async () => {
	const roster = loadRoster();
	let amberCount = 0;

	for (const name of roster) {
		const alive = await isTabAlive(name);
		if (alive) continue;
		const activeRoom = resolveActiveRoom(`direct-${name}`);
		if (activeRoom) amberCount++;
	}

	return new Response(JSON.stringify({ amberCount }), {
		headers: { "Content-Type": "application/json" },
	});
};
