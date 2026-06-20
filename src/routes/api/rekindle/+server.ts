import type { RequestHandler } from "./$types";
import { getRoomsByType, getHuddleMembers, resolveActiveRoom } from "$lib/server/aether-db";
import { isTabAlive, sendToKitty } from "$lib/server/kitten";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const LAUNCH_SCRIPT = "/Users/deepak-macmini/honeybloom/library/scripts/kitty-open-teammate.sh";

function parseDisplayName(roomId: string): string {
	const match = roomId.match(/^(?:direct|huddle)-([a-z]+)/);
	if (match) return match[1];
	return roomId.replace(/^direct-/, "").replace(/^huddle-/, "");
}

export const POST: RequestHandler = async () => {
	const teammateRooms = getRoomsByType("teammate");
	const rekindled: string[] = [];
	const skipped: string[] = [];

	for (const room of teammateRooms) {
		const name = parseDisplayName(room.id);
		const alive = await isTabAlive(name);
		if (alive) {
			skipped.push(name);
			continue;
		}

		// Launch Kitty tab via --solo (no pair/trio group launch)
		try {
			await execFileAsync(LAUNCH_SCRIPT, ["--solo", name], {
				timeout: 30000,
			});
			rekindled.push(name);
		} catch (err) {
			console.error(
				`[rekindle] Failed to launch ${name}:`,
				err instanceof Error ? err.message : String(err)
			);
		}
	}

	// After all tabs launched, send catch-up message to rekindled teammates
	const activeHuddles = getRoomsByType("huddle");
	for (const name of rekindled) {
		const directRoomId = resolveActiveRoom(`direct-${name}`);
		const huddleRoomIds: string[] = [];
		for (const huddle of activeHuddles) {
			const members = getHuddleMembers(huddle.id);
			if (members.includes(name)) huddleRoomIds.push(huddle.id);
		}
		const ts = new Date().toISOString();
		let body: string;
		if (huddleRoomIds.length > 0 && directRoomId) {
			body = `You were active in your direct room and in one or more huddles but got closed accidentally. Get caught up on the conversations using the read_room tool. You were in direct room ${directRoomId} and huddles ${huddleRoomIds.join(", ")}.`;
		} else if (directRoomId) {
			body = `You were active in your direct room but got closed accidentally. Get caught up using read_room with roomId: ${directRoomId}`;
		} else if (huddleRoomIds.length > 0) {
			body = `You were in huddles but got closed accidentally. Get caught up using read_room. Your huddles: ${huddleRoomIds.join(", ")}`;
		} else {
			continue;
		}
		await sendToKitty(name, { sender: "boss", room: `direct-${name}`, body, timestamp: ts });
	}

	return new Response(JSON.stringify({ rekindled, skipped }), {
		headers: { "Content-Type": "application/json" },
	});
};

// GET — returns zombie count for client-side copper flash
export const GET: RequestHandler = async () => {
	const teammateRooms = getRoomsByType("teammate");
	let zombieCount = 0;

	for (const room of teammateRooms) {
		const name = parseDisplayName(room.id);
		const alive = await isTabAlive(name);
		if (!alive) zombieCount++;
	}

	return new Response(JSON.stringify({ zombieCount }), {
		headers: { "Content-Type": "application/json" },
	});
};
