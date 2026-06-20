import type { RequestHandler } from "./$types";
import fs from "fs";

const GLOBAL_FLAG = "/Users/deepak-macmini/honeybloom/library/facade/livemirror-global";

export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify({ active: fs.existsSync(GLOBAL_FLAG) }), {
		headers: { "Content-Type": "application/json" },
	});
};
