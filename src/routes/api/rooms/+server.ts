import type { RequestHandler } from "./$types";
import { getRoomsByType, getAllRooms, getHuddleMembers } from "$lib/server/aether-db";
import { getAliveTeammates } from "$lib/server/kitten";
import fs from "fs";

const CSV_PATH =
	"/Users/deepak-macmini/honeybloom/library/skills/runbook-janus-coding/janus-config.csv";
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
				const raw = cols[2].trim();
				const short = raw === "Opus 4.6" ? "4.6" : raw === "DeepSeek V4 Flash" ? "v4" : raw;
				modelMap[cols[0].trim().toLowerCase()] = short;
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
	const memberToGroup: Record<string, { idx: number; label: string; memberIdx: number }> = {};
	sidebarGroups.forEach((g, i) => {
		g.members.forEach((m, mi) => {
			memberToGroup[m] = { idx: i, label: g.label, memberIdx: mi };
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
		memberIdx: memberToGroup[name]?.memberIdx ?? 0,
	}));
	teammates.sort((a, b) => {
		if (a.groupIdx !== b.groupIdx) return a.groupIdx - b.groupIdx;
		return a.memberIdx - b.memberIdx;
	});

	const huddleRooms = getAllRooms().filter((r) => r.type === "huddle");
	const huddles = huddleRooms.map((r) => ({
		id: r.id,
		name: parseDisplayName(r.id),
		host: r.name,
		hostGroup: memberToGroup[r.name]?.label || "",
		hostGroupIdx: memberToGroup[r.name]?.idx ?? sidebarGroups.length,
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
