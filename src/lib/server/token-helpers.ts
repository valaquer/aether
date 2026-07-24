import { releaseToken, clearAllTokens, getTokenHolder, forceAssignToken, getHuddleMembers } from "./aether-db";
import { sendToKitty } from "./kitten";

const TRIAGE_PROMPT = `Would you like to respond to Boss's message? Just a yes or no will suffice at this point. Whether you should answer or not depends on if Boss named you specifically, you have specific domain knowledge on this matter or you feel you must flag a concern. If yes, request the token.`;

const RETRIAGE_PROMPT = `The floor is open if you want to answer. Read Boss's message and the response(s) of your teammate(s). Given what is said already, do you still feel the need to speak up? To address something yet unsaid, perhaps? It's ok if you have nothing.`;

const tokenTimers = new Map<string, NodeJS.Timeout>();

export function advanceTokenAndNotify(roomId: string, releasedBy: string): string | null {
	const result = releaseToken(roomId, releasedBy);
	if (!result.startsWith("released:")) return null;

	const next = result.replace("released: token advanced to ", "");
	const now = new Date().toISOString();

	sendToKitty(next, {
		sender: "system",
		room: roomId,
		body: "You have the token. Read before posting — don't repeat what is already said.",
		timestamp: now,
	}).catch(() => {});

	return next;
}

export function sendTriagePrompt(roomId: string): void {
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();
	setTimeout(() => {
		for (const m of members) {
			if (m !== "boss" && m !== "houston") {
				sendToKitty(m, {
					sender: "system",
					room: roomId,
					body: TRIAGE_PROMPT,
					timestamp: now,
				}).catch(() => {});
			}
		}
	}, 500);
}

export function clearQueueAndRetriage(roomId: string, poster: string): void {
	clearAllTokens(roomId);
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();
	setTimeout(() => {
		for (const m of members) {
			if (m !== poster && m !== "boss" && m !== "houston") {
				sendToKitty(m, {
					sender: "system",
					room: roomId,
					body: RETRIAGE_PROMPT,
					timestamp: now,
				}).catch(() => {});
			}
		}
	}, 500);
}

export function clearTokensAndNotify(roomId: string): void {
	clearAllTokens(roomId);
}

export function startTokenTimer(roomId: string): void {
	clearTokenTimer(roomId);
	const timer = setTimeout(() => {
		tokenTimers.delete(roomId);
		const holder = getTokenHolder(roomId);
		if (!holder) return;
		clearQueueAndRetriage(roomId, holder);
	}, 30_000);
	tokenTimers.set(roomId, timer);
}

export function forceAssignTokenAndNotify(roomId: string, targetName: string): void {
	clearTokenTimer(roomId);
	forceAssignToken(roomId, targetName);
	const now = new Date().toISOString();

	// Only the recipient is notified (REQ-147)
	sendToKitty(targetName, {
		sender: "system",
		room: roomId,
		body: "You have the token. Read before posting — don't repeat what is already said.",
		timestamp: now,
	}).catch(() => {});
}

export function clearTokenTimer(roomId: string): void {
	const timer = tokenTimers.get(roomId);
	if (timer) {
		clearTimeout(timer);
		tokenTimers.delete(roomId);
	}
}
