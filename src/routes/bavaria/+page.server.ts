import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const BAVARIA_DIR = "/Users/deepak-macmini/honeybloom/library/bavaria";
const MANIFEST_FILE = path.join(BAVARIA_DIR, "bavaria-manifest.json");

function parseCode(folderName: string): string {
	const m = folderName.match(/^([A-Z]\d+)\s/) || folderName.match(/^(\d+)-/);
	return m ? m[1] : "";
}

export async function load() {
	const topEntries = await readdir(BAVARIA_DIR).catch(() => []);
	const dirEntries = topEntries.filter((f) => !f.startsWith(".") && !f.endsWith(".json") && !f.endsWith(".bak") && !f.startsWith("masters-backup"));
	const withTimes = await Promise.all(dirEntries.map(async (f) => {
		const s = await stat(path.join(BAVARIA_DIR, f)).catch(() => null);
		return { name: f, birth: s?.birthtime?.getTime() ?? 0 };
	}));
	const sortedOldestFirst = withTimes.sort((a, b) => a.birth - b.birth);
	const folders = [...sortedOldestFirst].reverse().map((e) => e.name);

	const folderCodes: Record<string, string> = {};
	for (const f of folders) {
		const code = parseCode(f);
		if (code) folderCodes[f] = code;
	}

	let manifest: { assets?: Record<string, any> } = {};
	try {
		manifest = JSON.parse(await readFile(MANIFEST_FILE, "utf-8"));
	} catch {}

	const folderData: Record<string, string[]> = {};
	const allIds: string[] = [];
	const videoIds: string[] = [];
	for (const folder of folders) {
		const dir = path.join(BAVARIA_DIR, folder);
		const entries = await readdir(dir).catch(() => []);
		const assets = entries.filter((f) => /\.(png|jpg|jpeg|webp|svg|mp4)$/i.test(f));
		const ids = assets.map((f) => f.replace(/\.(png|jpg|jpeg|webp|svg|mp4)$/i, ""));
		for (const f of assets) {
			if (/\.mp4$/i.test(f)) videoIds.push(f.replace(/\.mp4$/i, ""));
		}
		folderData[folder] = ids;
		allIds.push(...ids);
	}
	const ids = [...new Set(allIds)];
	ids.sort((a, b) => a.localeCompare(b));

	let votes: Record<string, string> = {};
	let comments: Record<string, string> = {};
	for (const [id, entry] of Object.entries(manifest.assets ?? {})) {
		const e = entry as { vote?: string | null; comment?: string };
		if (e.vote) votes[id] = e.vote;
		if (e.comment) comments[id] = e.comment;
	}

	return { ids, folders, folderData, votes, folderCodes, comments, videoIds };
}
