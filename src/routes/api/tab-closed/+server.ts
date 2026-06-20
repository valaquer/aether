import type { RequestHandler } from "./$types";
import { getRoomsByType } from "$lib/server/facade-db";
import { isTabAlive } from "$lib/server/kitten";
import { emitEvent } from "$lib/server/events";

function parseDisplayName(roomId: string): string {
	const match = roomId.match(/^(?:direct|huddle)-([a-z]+)/);
	if (match) return match[1];
	return roomId.replace(/^direct-/, "").replace(/^huddle-/, "");
}

export const GET: RequestHandler = async ({ url }) => {
	const teammate = url.searchParams.get("teammate") ?? "";
	if (!teammate) {
		return new Response("missing teammate param", { status: 400 });
	}

	const teammateRooms = getRoomsByType("teammate");
	let zombieCount = 0;

	for (const room of teammateRooms) {
		const name = parseDisplayName(room.id);
		const alive = await isTabAlive(name);
		if (!alive) zombieCount++;
	}

	emitEvent({ type: "zombie_update", zombieCount });

	return new Response(JSON.stringify({ zombieCount }), {
		headers: { "Content-Type": "application/json" },
	});
};
