import { error, json } from "@sveltejs/kit";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "./$types";

const BAVARIA_DIR = "/Users/deepak-macmini/honeybloom/library/bavaria";
const MANIFEST_FILE = path.join(BAVARIA_DIR, "bavaria-manifest.json");

export const POST: RequestHandler = async ({ request }) => {
	const { id, comment } = await request.json();
	if (!id || !/^[\w-]+$/i.test(id)) throw error(400, "Invalid ID");

	let manifest: Record<string, any> = {};
	try { manifest = JSON.parse(await readFile(MANIFEST_FILE, "utf-8")); } catch {}

	if (!manifest.assets) manifest.assets = {};
	if (!manifest.assets[id]) manifest.assets[id] = {};
	manifest.assets[id].comment = comment;

	await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, "\t") + "\n");
	return json({ ok: true });
};
