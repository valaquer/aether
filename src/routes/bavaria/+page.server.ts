import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const BAVARIA_DIR = "/Users/deepak-macmini/honeybloom/library/bavaria";
const MANIFEST_FILE = path.join(BAVARIA_DIR, "bavaria-manifest.json");

function nextCode(codes: string[]): string {
	if (codes.length === 0) return "A01";
	const last = codes.sort().pop()!;
	const letter = last[0];
	const num = parseInt(last.slice(1), 10);
	if (num < 99) return letter + String(num + 1).padStart(2, "0");
	const nextLetter = String.fromCharCode(letter.charCodeAt(0) + 1);
	return nextLetter + "01";
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

	let manifest: { assets?: Record<string, any>; folderCodes?: Record<string, string>; retiredCodes?: string[] } = {};
	try {
		manifest = JSON.parse(await readFile(MANIFEST_FILE, "utf-8"));
	} catch {}
	const folderCodes: Record<string, string> = manifest.folderCodes ?? {};
	const retiredCodes: string[] = manifest.retiredCodes ?? [];

	let dirty = false;
	const allUsedCodes = [...Object.values(folderCodes), ...retiredCodes];
	for (const entry of sortedOldestFirst) {
		if (!folderCodes[entry.name]) {
			folderCodes[entry.name] = nextCode(allUsedCodes);
			allUsedCodes.push(folderCodes[entry.name]);
			dirty = true;
		}
	}
	if (dirty) {
		manifest.folderCodes = folderCodes;
		manifest.retiredCodes = retiredCodes;
		await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, "\t") + "\n");
	}

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

	let votes: Record<string, string> = {};
	let comments: Record<string, string> = {};
	for (const [id, entry] of Object.entries(manifest.assets ?? {})) {
		const e = entry as { vote?: string | null; comment?: string };
		if (e.vote) votes[id] = e.vote;
		if (e.comment) comments[id] = e.comment;
	}

	return { ids, folders, folderData, votes, folderCodes, comments };
}
