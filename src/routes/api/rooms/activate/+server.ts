import type { RequestHandler } from "./$types";
import { resolveActiveRoom, saveRoom, formatTimestamp } from "$lib/server/facade-db";
import { activateTeammate, getActiveTeammates } from "$lib/server/active-teammates";
import { emitEvent } from "$lib/server/events";

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
	}

	emitEvent({ type: "huddle_update" });

	return new Response(JSON.stringify({ status: "activated", name: teammate }), {
		headers: { "Content-Type": "application/json" },
	});
};
