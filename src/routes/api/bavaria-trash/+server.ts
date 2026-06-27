import { error, json } from "@sveltejs/kit";
import { readdir, rename } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import type { RequestHandler } from "./$types";

const BAVARIA_DIR = "/Users/deepak-macmini/honeybloom/library/bavaria";

export const POST: RequestHandler = async ({ request }) => {
	const { id, folder } = await request.json();
	if (!id || !/^[\w-]+$/i.test(id)) throw error(400, "Invalid ID");
	if (!folder || !/^[\w-]+$/i.test(folder)) throw error(400, "Invalid folder");

	const dir = path.join(BAVARIA_DIR, folder);
	const entries = await readdir(dir).catch(() => []);
	const match = entries.find((f) => f.startsWith(id + ".") && /\.(png|jpg|jpeg|webp|svg)$/i.test(f));
	if (!match) throw error(404, "File not found");

	const filePath = path.join(dir, match);
	const trashPath = path.join(homedir(), ".Trash", match);
	await rename(filePath, trashPath);

	return json({ ok: true });
};
