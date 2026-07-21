import path from "path";

export interface CodexRolloutState {
	initialized: boolean;
	offsets: Record<string, number>;
}

export interface DiscoveredCodexRollout {
	path: string;
	completeSize: number;
}

export interface CodexAssistantResponse {
	text: string;
	timestamp?: string;
}

export interface CodexResponseRecord extends CodexAssistantResponse {
	recordOffset: number;
}

export const EMPTY_CODEX_ROLLOUT_STATE: CodexRolloutState = {
	initialized: false,
	offsets: {},
};

export function codexTeammateFromCwd(cwd: string, honeybloomRoot: string): string | null {
	const root = path.resolve(honeybloomRoot);
	const resolvedCwd = path.resolve(cwd);
	return path.dirname(resolvedCwd) === root ? path.basename(resolvedCwd) : null;
}

export function isCodexRolloutPath(filePath: string, sessionsDir: string): boolean {
	const relative = path.relative(path.resolve(sessionsDir), path.resolve(filePath));
	return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function parseCodexRolloutState(raw: string | null): CodexRolloutState {
	if (!raw) return { ...EMPTY_CODEX_ROLLOUT_STATE, offsets: {} };
	try {
		const parsed = JSON.parse(raw) as Partial<CodexRolloutState>;
		if (
			typeof parsed.initialized !== "boolean" ||
			!parsed.offsets ||
			typeof parsed.offsets !== "object"
		) {
			return { ...EMPTY_CODEX_ROLLOUT_STATE, offsets: {} };
		}
		const offsets: Record<string, number> = {};
		for (const [filePath, offset] of Object.entries(parsed.offsets)) {
			if (Number.isSafeInteger(offset) && offset >= 0) offsets[filePath] = offset;
		}
		return { initialized: parsed.initialized, offsets };
	} catch {
		return { ...EMPTY_CODEX_ROLLOUT_STATE, offsets: {} };
	}
}

export function registerCodexRollouts(
	state: CodexRolloutState,
	discovered: DiscoveredCodexRollout[]
): { state: CodexRolloutState; changed: boolean } {
	const offsets = { ...state.offsets };
	let changed = !state.initialized;
	for (const rollout of discovered) {
		if (offsets[rollout.path] !== undefined) continue;
		offsets[rollout.path] = state.initialized ? 0 : rollout.completeSize;
		changed = true;
	}
	return {
		state: { initialized: true, offsets },
		changed,
	};
}

export function lastCompleteJsonlOffset(buffer: Buffer): number {
	const newline = buffer.lastIndexOf(0x0a);
	return newline < 0 ? 0 : newline + 1;
}

export function extractCodexAssistantResponse(line: string): CodexAssistantResponse | null {
	let entry: unknown;
	try {
		entry = JSON.parse(line);
	} catch {
		return null;
	}
	if (!entry || typeof entry !== "object") return null;
	const record = entry as Record<string, unknown>;
	if (record.type !== "response_item") return null;
	const payload = record.payload;
	if (!payload || typeof payload !== "object") return null;
	const message = payload as Record<string, unknown>;
	if (
		message.type !== "message" ||
		message.role !== "assistant" ||
		!Array.isArray(message.content)
	) {
		return null;
	}
	const text = message.content
		.filter(
			(part): part is { type: "output_text"; text: string } =>
				!!part &&
				typeof part === "object" &&
				(part as Record<string, unknown>).type === "output_text" &&
				typeof (part as Record<string, unknown>).text === "string"
		)
		.map((part) => part.text)
		.join("");
	return {
		text,
		timestamp: typeof record.timestamp === "string" ? record.timestamp : undefined,
	};
}

export function consumeCompleteCodexJsonl(
	buffer: Buffer,
	baseOffset: number,
	onResponse: (response: CodexResponseRecord) => boolean
): number {
	let lineStart = 0;
	while (lineStart < buffer.length) {
		const newline = buffer.indexOf(0x0a, lineStart);
		if (newline < 0) break;
		const recordOffset = baseOffset + lineStart;
		const line = buffer.subarray(lineStart, newline).toString("utf-8");
		const response = extractCodexAssistantResponse(line);
		if (response?.text && !onResponse({ ...response, recordOffset })) return recordOffset;
		lineStart = newline + 1;
	}
	return baseOffset + lineStart;
}
