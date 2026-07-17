import type { RequestHandler } from "./$types";
import { createHoustonAlert } from "$lib/server/aether-db";
import { emitEvent } from "$lib/server/events";
import { clearTriageTimer } from "$lib/server/houston-triage";
import { v4 } from "uuid";

type EscalateReason = "blocked_on_boss" | "user_impact" | "poller_dead" | "triage_timeout";

const REASON_LABELS: Record<EscalateReason, string> = {
	blocked_on_boss: "Blocked on Boss",
	user_impact: "User-facing outage",
	poller_dead: "Houston poller down",
	triage_timeout: "Triage timeout",
};

export const POST: RequestHandler = async ({ request }) => {
	const { reason, message } = await request.json() as { reason: EscalateReason; message: string };
	if (!reason || !message) {
		return new Response(JSON.stringify({ error: "Missing reason or message" }), { status: 400 });
	}

	const label = REASON_LABELS[reason] || reason;
	createHoustonAlert({ id: v4(), vendor: `escalation-${reason}`, message: `${label}: ${message}`, deep_link: "" });
	emitEvent({ type: "houston_alert" });
	clearTriageTimer();

	try {
		const Database = (await import("better-sqlite3")).default;
		const houstonDb = new Database("/Users/deepak-macmini/honeybloom/library/houston-app/houston.db");
		houstonDb.pragma("busy_timeout = 30000");
		houstonDb.prepare(
			"INSERT INTO alert_log (ts, vendor, event_type, message, deep_link) VALUES (?, ?, ?, ?, ?)"
		).run(new Date().toISOString(), `escalation-${reason}`, "escalation", `${label}: ${message}`, "");
		houstonDb.close();
	} catch (e) {
		console.error("[HOUSTON] escalation log to houston.db failed:", e);
	}

	return new Response(JSON.stringify({ ok: true, reason, label }), {
		headers: { "Content-Type": "application/json" },
	});
};
