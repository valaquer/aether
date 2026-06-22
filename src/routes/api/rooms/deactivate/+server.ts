import type { RequestHandler } from "./$types";
import { resolveActiveRoom, setRoomType } from "$lib/server/aether-db";
import { deactivateTeammate } from "$lib/server/active-teammates";
import { emitEvent } from "$lib/server/events";
import { isTabAlive, closeKittyTab, killMiniProcess } from "$lib/server/kitten";
import { removeFromAllHuddles } from "$lib/server/huddle-helpers";
import { appendFileSync } from "fs";

const DEACTIVATE_LOG = "/tmp/aether-deactivate.log";

function log(msg: string) {
	const ts = new Date().toISOString();
	appendFileSync(DEACTIVATE_LOG, `${ts} ${msg}\n`);
}

export const POST: RequestHandler = async ({ request }) => {
	const { name } = await request.json();
	if (!name) {
		return new Response(JSON.stringify({ error: "Missing name" }), { status: 400 });
	}

	const teammate = name.toLowerCase();
	log(`DEACTIVATE called for ${teammate}`);

	// Remove from all active huddles (REQ-248)
	removeFromAllHuddles(teammate);

	// Move direct room to Past Rooms
	const baseRoomId = `direct-${teammate}`;
	const activeRoomId = resolveActiveRoom(baseRoomId);
	if (activeRoomId) {
		setRoomType(activeRoomId, "past");
	}

	deactivateTeammate(teammate);
	emitEvent({ type: "huddle_update" });
	log(`${teammate} deactivated OK`);

	// Kill process + close tab AFTER response sent (2s delay for clean self-kill)
	setTimeout(async () => {
		const killed = await killMiniProcess(teammate);
		log(`${teammate} killMiniProcess=${killed}`);
		const tabAlive = await isTabAlive(teammate);
		log(`${teammate} isTabAlive=${tabAlive}`);
		if (tabAlive) {
			const closed = await closeKittyTab(teammate);
			log(`${teammate} closeKittyTab=${closed}`);
		}
	}, 2000);

	return new Response(JSON.stringify({ status: "deactivated", name: teammate }), {
		headers: { "Content-Type": "application/json" },
	});
};
