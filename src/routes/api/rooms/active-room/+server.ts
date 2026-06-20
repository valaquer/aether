import type { RequestHandler } from "./$types";
import { getActiveRoomsForTeammate } from "$lib/server/aether-db";

export const GET: RequestHandler = async ({ url }) => {
	const name = url.searchParams.get("name");
	if (!name) {
		return new Response(JSON.stringify({ error: "Missing name parameter" }), { status: 400 });
	}

	const rooms = getActiveRoomsForTeammate(name.toLowerCase());

	return new Response(JSON.stringify({ rooms }), {
		headers: { "Content-Type": "application/json" },
	});
};
