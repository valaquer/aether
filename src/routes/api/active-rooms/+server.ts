import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getActiveRoomsForTeammate } from "$lib/server/facade-db";

export const GET: RequestHandler = ({ url }) => {
	const teammate = url.searchParams.get("teammate");
	if (!teammate) {
		return json({ error: "Missing teammate parameter" }, { status: 400 });
	}
	const rooms = getActiveRoomsForTeammate(teammate.toLowerCase());
	return json(rooms);
};
