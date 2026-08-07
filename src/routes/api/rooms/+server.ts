import type { RequestHandler } from "./$types";
import { getRoomsByType, getAllRooms, getHuddleMembers, resolveActiveRoom, getRoom } from "$lib/server/aether-db";
import { getActiveTeammatesSet } from "$lib/server/active-teammates";
import fs from "fs";

const CSV_PATH =
	"/Users/deepak-macmini/honeybloom/library/scripts/janus-config.csv";
const ORG_PATH = "/Users/deepak-macmini/honeybloom/library/wiki/Organization/ORG.md";

function parseDisplayName(roomId: string): string {
	const match = roomId.match(/^(?:direct|huddle|work)-([a-z]+)/);
	if (match) return match[1];
	const legacy = roomId.replace(/^direct-/, "").replace(/^huddle-/, "").replace(/^work-/, "");
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
				const short = raw === "Opus 4.6" ? "4.6" : raw === "DeepSeek V4 Flash" ? "v4" : raw === "Fable 5" ? "f5" : raw;
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

function loadTeamHuddleRooms(): { host: string; members: string[] }[] {
	try {
		const raw = fs.readFileSync(ORG_PATH, "utf-8");
		const rooms: { host: string; members: string[] }[] = [];
		let inGroups = false;
		for (const line of raw.split("\n")) {
			if (line.startsWith("## Groups")) { inGroups = true; continue; }
			if (inGroups && line.startsWith("## ")) break;
			if (!inGroups || !line.includes("(host:")) continue;
			const match = line.match(/^(.+?)\s*\(host:\s*([a-z0-9-]+)\)/i);
			if (!match) continue;
			const members = match[1].split(",").map(m => m.trim().toLowerCase()).filter(Boolean);
			const host = match[2].toLowerCase();
			if (host && members.length) rooms.push({ host, members });
		}
		return rooms;
	} catch { return []; }
}

function loadProjectHuddleRooms(): string[] {
	try {
		const raw = fs.readFileSync(ORG_PATH, "utf-8");
		const projects: string[] = [];
		let inSection = false;
		for (const line of raw.split("\n")) {
			if (line.startsWith("## Active project rooms in Aether")) { inSection = true; continue; }
			if (inSection && line.startsWith("## ")) break;
			if (!inSection) continue;
			const trimmed = line.replace(/^[-*]\s*/, "").trim();
			if (trimmed) projects.push(trimmed);
		}
		return projects;
	} catch { return []; }
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
	const alive = getActiveTeammatesSet();
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

	const teamHuddleFixtures = loadTeamHuddleRooms();
	const projectHuddleFixtures = loadProjectHuddleRooms();
	const activeHuddleRoomIds = new Set<string>();

	const huddles: {
		id: string; name: string; host: string; hostGroup: string;
		hostGroupIdx: number; participants: string[]; startedAt?: string;
		project?: string; active: boolean;
	}[] = [];

	for (const fixture of teamHuddleFixtures) {
		if (!roster.includes(fixture.host)) continue;
		const activeId = resolveActiveRoom(`huddle-${fixture.host}`);
		if (activeId) {
			activeHuddleRoomIds.add(activeId);
			huddles.push({
				id: activeId,
				name: fixture.host,
				host: fixture.host,
				hostGroup: memberToGroup[fixture.host]?.label || "",
				hostGroupIdx: memberToGroup[fixture.host]?.idx ?? sidebarGroups.length,
				participants: getHuddleMembers(activeId),
				startedAt: getRoom(activeId)?.startedAt,
				active: true,
			});
		} else {
			huddles.push({
				id: `fixture-huddle-${fixture.host}`,
				name: fixture.host,
				host: fixture.host,
				hostGroup: memberToGroup[fixture.host]?.label || "",
				hostGroupIdx: memberToGroup[fixture.host]?.idx ?? sidebarGroups.length,
				participants: fixture.members,
				active: false,
			});
		}
	}

	const allPastRooms = getRoomsByType("past");
	for (const project of projectHuddleFixtures) {
		const key = project.toLowerCase();
		const activeId = resolveActiveRoom(`work-${key}`);
		if (activeId) {
			activeHuddleRoomIds.add(activeId);
			const room = getRoom(activeId);
			huddles.push({
				id: activeId,
				name: key,
				host: parseDisplayName(activeId),
				hostGroup: memberToGroup[parseDisplayName(activeId)]?.label || "",
				hostGroupIdx: sidebarGroups.length,
				participants: getHuddleMembers(activeId),
				startedAt: room?.startedAt,
				project: room?.name || project,
				active: true,
			});
		} else {
			const lastSession = allPastRooms
				.filter(r => r.originalRoomId === `work-${key}`)
				.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""))[0];
			const lastParticipants = lastSession ? JSON.parse(lastSession.participants || "[]") : [];
			huddles.push({
				id: `fixture-work-${key}`,
				name: key,
				host: "",
				hostGroup: "",
				hostGroupIdx: sidebarGroups.length,
				participants: lastParticipants,
				project: project,
				active: false,
			});
		}
	}

	// Include any active huddles not covered by fixtures (ad-hoc huddles)
	const remainingHuddles = getAllRooms().filter(r => r.type === "huddle" && !activeHuddleRoomIds.has(r.id));
	for (const r of remainingHuddles) {
		const isWork = r.id.startsWith("work-");
		const host = parseDisplayName(r.id);
		huddles.push({
			id: r.id,
			name: isWork ? r.name : host,
			host: isWork ? host : r.name,
			hostGroup: memberToGroup[isWork ? host : r.name]?.label || "",
			hostGroupIdx: memberToGroup[isWork ? host : r.name]?.idx ?? sidebarGroups.length,
			participants: getHuddleMembers(r.id),
			startedAt: r.startedAt,
			project: isWork ? r.name : undefined,
			active: true,
		});
	}

	const pastRooms = getRoomsByType("past").map((r) => ({
		id: r.id,
		name: r.name || r.id,
		type: "past" as const,
		startedAt: r.startedAt,
	}));

	return new Response(JSON.stringify({ teammates, huddles, pastRooms }), {
		headers: { "Content-Type": "application/json" },
	});
};
