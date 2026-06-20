import { releaseToken, clearAllTokens, getTokenHolder, forceAssignToken } from "./facade-db";
import { sendToKitty } from "./kitten";
import { isActivityDeaf } from "./harness-reader";

const tokenTimers = new Map<string, NodeJS.Timeout>();

export function advanceTokenAndNotify(roomId: string, releasedBy: string): string | null {
	const result = releaseToken(roomId, releasedBy);
	if (!result.startsWith("released:")) return null;

	const next = result.replace("released: token advanced to ", "");
	const now = new Date().toISOString();

	// Only the recipient is notified — observers don't need to know (REQ-147)
	if (!isActivityDeaf(next, roomId)) {
		sendToKitty(next, {
			sender: "system",
			room: roomId,
			body: "You have the token. Read before posting — don't repeat what is already said.",
			timestamp: now,
		}).catch(() => {});
	}

	return next;
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
		const next = advanceTokenAndNotify(roomId, holder);
		if (next) {
			startTokenTimer(roomId);
		} else {
			clearTokensAndNotify(roomId);
		}
	}, 30_000);
	tokenTimers.set(roomId, timer);
}

export function forceAssignTokenAndNotify(roomId: string, targetName: string): void {
	clearTokenTimer(roomId);
	forceAssignToken(roomId, targetName);
	const now = new Date().toISOString();

	// Only the recipient is notified (REQ-147)
	if (!isActivityDeaf(targetName, roomId)) {
		sendToKitty(targetName, {
			sender: "system",
			room: roomId,
			body: "You have the token. Read before posting — don't repeat what is already said.",
			timestamp: now,
		}).catch(() => {});
	}
}

export function clearTokenTimer(roomId: string): void {
	const timer = tokenTimers.get(roomId);
	if (timer) {
		clearTimeout(timer);
		tokenTimers.delete(roomId);
	}
}
