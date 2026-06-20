import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const BAVARIA_DIR = "/Users/deepak-macmini/honeybloom/bavaria";

export async function load() {
	const topEntries = await readdir(BAVARIA_DIR).catch(() => []);
	const folders = topEntries.filter((f) => /^\d+-/.test(f)).sort();

	const folderData: Record<string, string[]> = {};
	const allIds: string[] = [];
	for (const folder of folders) {
		const dir = path.join(BAVARIA_DIR, folder);
		const entries = await readdir(dir).catch(() => []);
		const images = entries.filter((f) => /\.(png|jpg|jpeg|webp|svg)$/i.test(f));
		const ids = images.map((f) => f.replace(/\.(png|jpg|jpeg|webp|svg)$/i, ""));
		folderData[folder] = ids;
		allIds.push(...ids);
	}
	const ids = [...new Set(allIds)];
	ids.sort((a, b) => a.localeCompare(b));

	return { ids, folders, folderData };
}
