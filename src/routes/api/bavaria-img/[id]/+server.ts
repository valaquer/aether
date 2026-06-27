import { error } from "@sveltejs/kit";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "./$types";

const BAVARIA_DIR = "/Users/deepak-macmini/honeybloom/library/bavaria";

export const GET: RequestHandler = async ({ params }) => {
	const id = params.id;
	if (!/^[\w-]+$/i.test(id)) throw error(400, "Invalid ID");

	const topEntries = await readdir(BAVARIA_DIR).catch(() => []);
	const folders = topEntries.filter((f) => !f.startsWith("."));

	let filePath: string | null = null;
	for (const folder of folders) {
		const dir = path.join(BAVARIA_DIR, folder);
		const entries = await readdir(dir).catch(() => []);
		const match = entries.find((f) => f.startsWith(id + ".") && /\.(png|jpg|jpeg|webp|svg)$/i.test(f));
		if (match) {
			filePath = path.join(dir, match);
			break;
		}
	}

	if (!filePath) throw error(404, "Image not found");

	const ext = path.extname(filePath).toLowerCase();
	const contentType =
		ext === ".png" ? "image/png" :
		ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
		ext === ".webp" ? "image/webp" :
		ext === ".svg" ? "image/svg+xml" :
		"application/octet-stream";

	const file = await readFile(filePath);
	return new Response(file, {
		headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
	});
};
