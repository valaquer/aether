import type { RequestHandler } from "./$types";
import { getActiveHoustonAlerts, createHoustonAlert, clearAllHoustonAlerts } from "$lib/server/aether-db";
import { emitEvent } from "$lib/server/events";
import { v4 } from "uuid";

export const GET: RequestHandler = async () => {
	const alerts = getActiveHoustonAlerts();
	return new Response(JSON.stringify({ count: alerts.length, alerts }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const { vendor, message, deep_link } = await request.json();
	if (!vendor || !message) {
		return new Response(JSON.stringify({ error: "Missing vendor or message" }), { status: 400 });
	}

	createHoustonAlert({ id: v4(), vendor, message, deep_link });
	emitEvent({ type: "houston_alert" });

	return new Response(JSON.stringify({ ok: true }), {
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
