import type { RequestHandler } from "./$types";
import fs from "fs";
import path from "path";

const PREFS_FILE = path.join("/Users/deepak-macmini/honeybloom/library/aether/aether-preferences.json");

function readPrefs(): Record<string, string> {
	try {
		if (!fs.existsSync(PREFS_FILE)) return {};
		const raw = fs.readFileSync(PREFS_FILE, "utf-8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

function writePrefs(data: Record<string, string>): void {
	const dir = path.dirname(PREFS_FILE);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(PREFS_FILE, JSON.stringify(data, null, 2));
}

export const GET: RequestHandler = async () => {
	const prefs = readPrefs();
	return new Response(JSON.stringify(prefs), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const prefs = readPrefs();
		if (body.selectedRoom !== undefined) {
			prefs.selectedRoom = body.selectedRoom;
		}
		writePrefs(prefs);
		return new Response(JSON.stringify({ ok: true }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
	}
};
