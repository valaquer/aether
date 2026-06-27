import { json, error } from "@sveltejs/kit";
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import type { RequestHandler } from "./$types";

const BAVARIA_DIR = "/Users/deepak-macmini/honeybloom/library/bavaria";
const MANIFEST_FILE = path.join(BAVARIA_DIR, "bavaria-manifest.json");

interface AssetEntry {
	vote: "approved" | "rejected" | null;
	filename: string;
}

interface Manifest {
	assets: Record<string, AssetEntry>;
}

function findAssetFile(id: string): string | null {
	try {
		const topEntries = readdirSync(BAVARIA_DIR);
		const folders = topEntries.filter((f) => !f.startsWith("."));
		for (const folder of folders) {
			const dir = path.join(BAVARIA_DIR, folder);
			try {
				const files = readdirSync(dir);
				const match = files.find(
					(f) => /\.(png|jpg|jpeg|webp|svg)$/i.test(f) && f.replace(/\.(png|jpg|jpeg|webp|svg)$/i, "") === id
				);
				if (match) return path.join(dir, match);
			} catch {}
		}
	} catch {}
	return null;
}

function setImmutable(filePath: string, lock: boolean): void {
	try {
		execSync(`chflags ${lock ? "uchg" : "nouchg"} "${filePath}"`, { timeout: 3000 });
	} catch (err) {
		console.error(`[vault] chflags failed for ${filePath}:`, err instanceof Error ? err.message : String(err));
	}
}

function trashFile(filePath: string): void {
	try {
		const filename = path.basename(filePath);
		const trashDir = "/Users/deepak-macmini/.Trash";
		execSync(`mv "${filePath}" "${trashDir}/${filename}"`, { timeout: 3000 });
	} catch (err) {
		console.error(`[trash] move to Trash failed for ${filePath}:`, err instanceof Error ? err.message : String(err));
	}
}

async function loadManifest(): Promise<Manifest> {
	try {
		return JSON.parse(await readFile(MANIFEST_FILE, "utf-8"));
	} catch {
		return { assets: {} };
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const { id, vote } = await request.json();
	if (!id || !["approved", "rejected"].includes(vote)) throw error(400, "Invalid payload");

	const manifest = await loadManifest();
	if (!manifest.assets[id]) manifest.assets[id] = { vote: null, filename: id };

	if (vote === "rejected") {
		const filePath = findAssetFile(id);
		if (filePath) {
			setImmutable(filePath, false);
			trashFile(filePath);
		}
		manifest.assets[id].vote = "rejected";
	} else {
		manifest.assets[id].vote = "approved";
		const filePath = findAssetFile(id);
		if (filePath) setImmutable(filePath, true);
	}

	await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, "\t"));
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	if (!id) throw error(400, "Missing id");

	const manifest = await loadManifest();
	if (manifest.assets[id]) manifest.assets[id].vote = null;
	await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, "\t"));

	const filePath = findAssetFile(id);
	if (filePath) setImmutable(filePath, false);

	return json({ ok: true });
};
