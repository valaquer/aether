import { clearAllTokens, getTokenHolder, forceAssignToken, getHuddleMembers } from "./aether-db";
import { sendToKitty } from "./kitten";

const TRIAGE_PROMPT = `System: Would you like to respond to Boss's message? If this is in your lane or you feel you must speak, request the token. Otherwise, do nothing.`;

const TOKEN_GRANTED_PROMPT = `System: You have the token. Respond in the huddle.`;

const RUNNER_UP_PROMPT = `System: Someone is answering. Have a look. Maybe it's what you wanted to say? If you still want to speak up -- to contest it or add something of your own -- the token will be made available shortly.`;

const RETRIAGE_PROMPT = `System: The token is available if you still want to answer. If yes, request the token, else do nothing.`;

const tokenTimers = new Map<string, NodeJS.Timeout>();

export function sendTriagePrompt(roomId: string): void {
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();
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
}

export function sendRunnerUpPrompt(roomId: string, excludeSender: string): void {
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();
	for (const m of members) {
		if (m !== excludeSender && m !== "boss" && m !== "houston") {
			sendToKitty(m, {
				sender: "system",
				room: roomId,
				body: RUNNER_UP_PROMPT,
				timestamp: now,
			}).catch(() => {});
		}
	}
}

export function clearQueueAndRetriage(roomId: string, poster: string): void {
	clearAllTokens(roomId);
	const members = getHuddleMembers(roomId);
	const now = new Date().toISOString();
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
}

export function sendTokenGrantedPrompt(roomId: string, grantedTo: string): void {
	const now = new Date().toISOString();
	sendToKitty(grantedTo, {
		sender: "system",
		room: roomId,
		body: TOKEN_GRANTED_PROMPT,
		timestamp: now,
	}).catch(() => {});
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
	sendTokenGrantedPrompt(roomId, targetName);
}

export function clearTokenTimer(roomId: string): void {
	const timer = tokenTimers.get(roomId);
	if (timer) {
		clearTimeout(timer);
		tokenTimers.delete(roomId);
	}
}
