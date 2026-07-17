import type { RequestHandler } from "./$types";
import { getActiveHoustonAlerts, createHoustonAlert, clearAllHoustonAlerts, saveMessage, readEngineeringGroup } from "$lib/server/aether-db";
import { resolveActiveRoom } from "$lib/server/aether-db";
import { emitEvent } from "$lib/server/events";
import { exec } from "child_process";
import { sendToKitty } from "$lib/server/kitten";
import { v4 } from "uuid";

const OPEN_TEAM_SCRIPT = "/Users/deepak-macmini/honeybloom/library/scripts/open-team.sh";
const AETHER_URL = "http://localhost:51730";

export const GET: RequestHandler = async () => {
	const alerts = getActiveHoustonAlerts();
	return new Response(JSON.stringify({ count: alerts.length, alerts }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const { vendor, message, deep_link, type } = await request.json();
	if (!vendor || !message) {
		return new Response(JSON.stringify({ error: "Missing vendor or message" }), { status: 400 });
	}

	const isRecovery = type === "recovery";

	if (!isRecovery) {
		createHoustonAlert({ id: v4(), vendor, message, deep_link });
		emitEvent({ type: "houston_alert" });
	}

	const members = readEngineeringGroup();
	const leader = members[0] || "guru";

	// Use standard huddle API — creates session-scoped room, handles dedup, auto-wake
	let roomId: string;
	try {
		const huddleResp = await fetch(`${AETHER_URL}/api/huddle`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "start", host: "houston", participants: members }),
		});
		const huddleData = await huddleResp.json();
		roomId = huddleData.roomId || resolveActiveRoom("huddle-houston") || "huddle-houston";
	} catch {
		roomId = resolveActiveRoom("huddle-houston") || "huddle-houston";
	}

	// Post alert message to watchtower
	const prefix = isRecovery ? "✅" : "🚨";
	const body = deep_link
		? `${prefix} ${vendor.toUpperCase()}: ${message}\nFix: ${deep_link}`
		: `${prefix} ${vendor.toUpperCase()}: ${message}`;

	const msg = {
		id: v4(),
		conversationId: roomId,
		sender: "system",
		content: body,
		createdAt: new Date().toISOString(),
		type: "message",
	};
	saveMessage(msg);
	emitEvent({
		type: "message",
		conversationId: roomId,
		sender: "system",
		content: body,
		timestamp: msg.createdAt,
	});

	// Wake Guru's team huddle + send autonomous triage nudge
	exec(`bash ${OPEN_TEAM_SCRIPT} ${leader}`, { timeout: 60000 }, () => {
		const nudge = `HOUSTON ALERT — ${vendor.toUpperCase()}: ${message} (${new Date().toISOString()}). You are authorized for autonomous triage per runbook-houston-triage Section 0 — do not wait for Boss. Read the watchtower log (${roomId}), run Triage Path A independently, post your findings there. Act on pre-authorized responses only; anything beyond the RUNBOOK: investigate, document, hold.`;
		setTimeout(() => {
			for (const m of members) {
				sendToKitty(m, { sender: "system", room: roomId, body: nudge, timestamp: new Date().toISOString() }).catch(() => {});
			}
		}, 30000);
	});

	return new Response(JSON.stringify({ ok: true, roomId }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const DELETE: RequestHandler = async () => {
	clearAllHoustonAlerts();
	emitEvent({ type: "houston_alert" });

	return new Response(JSON.stringify({ ok: true, cleared: true }), {
		headers: { "Content-Type": "application/json" },
	});
};
