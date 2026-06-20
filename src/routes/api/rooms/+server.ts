import type { RequestHandler } from "./$types";
import { getRoomsByType, getAllRooms, getHuddleMembers } from "$lib/server/facade-db";
import { getAliveTeammates } from "$lib/server/kitten";
import fs from "fs";

const CSV_PATH =
	"/Users/deepak-macmini/honeybloom/library/skills/gestalt-layer-3-janus/janus-config.csv";
const ORG_PATH = "/Users/deepak-macmini/honeybloom/library/ORG.md";

function parseDisplayName(roomId: string): string {
	const match = roomId.match(/^(?:direct|huddle)-([a-z]+)/);
	if (match) return match[1];
	const legacy = roomId.replace(/^direct-/, "").replace(/^huddle-/, "");
	return legacy.replace(/-legacy$/, "");
}

function loadModelMap(): Record<string, string> {
	try {
		const raw = fs.readFileSync(CSV_PATH, "utf-8");
		const lines = raw.trim().split("\n");
		const modelMap: Record<string, string> = {};
		for (let i = 1; i < lines.length; i++) {
			const cols = lines[i].split(",");
			if (cols.length >= 3) {
				modelMap[cols[0].trim().toLowerCase()] = cols[2].trim();
			}
		}
		return modelMap;
	} catch {
		return {};
	}
}

function loadRoster(): string[] {
	try {
		const raw = fs.readFileSync(ORG_PATH, "utf-8");
		return raw
			.split("\n")
			.filter((l) => l.startsWith("Teammate: "))
			.map((l) => l.replace("Teammate: ", "").trim().toLowerCase());
	} catch {
		return [];
	}
}

function loadSidebarGroups(): { label: string; members: string[] }[] {
	try {
		const raw = fs.readFileSync(ORG_PATH, "utf-8");
		const groups: { label: string; members: string[] }[] = [];
		let inSection = false;
		for (const line of raw.split("\n")) {
			if (line.startsWith("## Sidebar Order")) {
				inSection = true;
				continue;
			}
			if (inSection && line.startsWith("## ")) break;
			if (!inSection || !line.includes(":")) continue;
			const colonIdx = line.indexOf(":");
			const label = line.slice(0, colonIdx).trim();
			const members = line
				.slice(colonIdx + 1)
				.split(",")
				.map((m) => m.trim().toLowerCase());
			if (label && members.length) groups.push({ label, members });
		}
		return groups;
	} catch {
		return [];
	}
}

export const GET: RequestHandler = async () => {
	const modelMap = loadModelMap();
	const roster = loadRoster();
	const alive = await getAliveTeammates();
	const activeRooms = getAllRooms().filter((r) => r.type === "teammate");
	const roomByName: Record<string, string> = {};
	for (const r of activeRooms) {
		const name = parseDisplayName(r.id);
		roomByName[name] = r.id;
	}
	const sidebarGroups = loadSidebarGroups();
	const memberToGroup: Record<string, { idx: number; label: string }> = {};
	sidebarGroups.forEach((g, i) => {
		g.members.forEach((m) => {
			memberToGroup[m] = { idx: i, label: g.label };
		});
	});
	const teammates = roster.map((name) => ({
		id: roomByName[name] || `offline-${name}`,
		name,
		teammate: name,
		model: modelMap[name] || "",
		online: alive.has(name),
		group: memberToGroup[name]?.label || "",
		groupIdx: memberToGroup[name]?.idx ?? sidebarGroups.length,
	}));
	teammates.sort((a, b) => {
		if (a.groupIdx !== b.groupIdx) return a.groupIdx - b.groupIdx;
		return a.name.localeCompare(b.name);
	});

	const huddleRooms = getAllRooms().filter((r) => r.type === "huddle");
	const huddles = huddleRooms.map((r) => ({
		id: r.id,
		name: parseDisplayName(r.id),
		host: r.name,
		participants: getHuddleMembers(r.id),
		startedAt: r.startedAt,
	}));

	const pastRooms = getRoomsByType("past").map((r) => ({
		id: r.id,
		name: r.id,
		type: "past" as const,
		startedAt: r.startedAt,
	}));

	return new Response(JSON.stringify({ teammates, huddles, pastRooms }), {
		headers: { "Content-Type": "application/json" },
	});
};
