import { describe, expect, it, vi } from "vitest";
import {
	codexTeammateFromCwd,
	consumeCompleteCodexJsonl,
	extractCodexAssistantResponse,
	isCodexRolloutPath,
	lastCompleteJsonlOffset,
	parseCodexRolloutState,
	registerCodexRollouts,
} from "./codex-rollout";

function jsonl(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

function assistant(texts: string[], timestamp = "2026-07-21T12:00:00.000Z"): object {
	return {
		timestamp,
		type: "response_item",
		payload: {
			type: "message",
			role: "assistant",
			content: texts.map((text) => ({ type: "output_text", text })),
		},
	};
}

describe("Codex rollout parsing", () => {
	it("isolates exact one-level Honeybloom teammates and Codex session paths", () => {
		expect(codexTeammateFromCwd("/honeybloom/chica", "/honeybloom")).toBe("chica");
		expect(codexTeammateFromCwd("/honeybloom/chica/subdir", "/honeybloom")).toBeNull();
		expect(codexTeammateFromCwd("/elsewhere/chica", "/honeybloom")).toBeNull();
		expect(isCodexRolloutPath("/codex/sessions/2026/rollout.jsonl", "/codex/sessions")).toBe(
			true
		);
		expect(isCodexRolloutPath("/codex/other/rollout.jsonl", "/codex/sessions")).toBe(false);
	});

	it("selects only the canonical assistant response representation", () => {
		expect(extractCodexAssistantResponse(jsonl(assistant(["visible"])).trim())?.text).toBe(
			"visible"
		);
		expect(
			extractCodexAssistantResponse(
				jsonl({ type: "event_msg", payload: { type: "agent_message", message: "visible" } }).trim()
			)
		).toBeNull();
	});

	it.each([
		{ type: "response_item", payload: { type: "message", role: "user", content: [] } },
		{ type: "response_item", payload: { type: "message", role: "developer", content: [] } },
		{ type: "response_item", payload: { type: "reasoning", summary: [] } },
		{ type: "response_item", payload: { type: "custom_tool_call", name: "exec" } },
		{ type: "response_item", payload: { type: "message", role: "assistant" } },
	])("fails closed for non-terminal or drifted records", (record) => {
		expect(extractCodexAssistantResponse(JSON.stringify(record))).toBeNull();
	});

	it("fails closed for malformed JSON", () => {
		expect(extractCodexAssistantResponse("{broken")).toBeNull();
	});

	it("concatenates ordered output_text blocks into one logical response", () => {
		const result = extractCodexAssistantResponse(JSON.stringify(assistant(["alpha", " beta"])));
		expect(result?.text).toBe("alpha beta");
	});

	it("retains a partial final line", () => {
		const complete = jsonl({ type: "session_meta", payload: {} });
		const buffer = Buffer.from(`${complete}{"type":"response_`);
		expect(lastCompleteJsonlOffset(buffer)).toBe(Buffer.byteLength(complete));
		const callback = vi.fn(() => true);
		expect(consumeCompleteCodexJsonl(buffer, 400, callback)).toBe(
			400 + Buffer.byteLength(complete)
		);
		expect(callback).not.toHaveBeenCalled();
	});

	it("uses one callback and record identity for a multi-part response", () => {
		const buffer = Buffer.from(jsonl(assistant(["one", " two"])));
		const callback = vi.fn(() => true);
		const next = consumeCompleteCodexJsonl(buffer, 900, callback);
		expect(next).toBe(900 + buffer.length);
		expect(callback).toHaveBeenCalledOnce();
		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({ text: "one two", recordOffset: 900 })
		);
	});

	it("does not advance an unroutable response and advances once after retry", () => {
		const buffer = Buffer.from(jsonl(assistant(["route me"])));
		expect(consumeCompleteCodexJsonl(buffer, 1200, () => false)).toBe(1200);
		const callback = vi.fn(() => true);
		expect(consumeCompleteCodexJsonl(buffer, 1200, callback)).toBe(1200 + buffer.length);
		expect(callback).toHaveBeenCalledOnce();
	});
});

describe("Codex rollout cutover state", () => {
	it("captures growth after the synchronous cutover snapshot", () => {
		const registered = registerCodexRollouts({ initialized: false, offsets: {} }, [
			{ path: "/rollout-a.jsonl", completeSize: 500 },
		]).state;
		expect(registered).toEqual({ initialized: true, offsets: { "/rollout-a.jsonl": 500 } });
		const appended = Buffer.from(jsonl(assistant(["after cutover"])));
		expect(
			consumeCompleteCodexJsonl(appended, registered.offsets["/rollout-a.jsonl"], () => true)
		).toBe(500 + appended.length);
	});

	it("survives reload before the first cursor movement", () => {
		const cutover = registerCodexRollouts({ initialized: false, offsets: {} }, [
			{ path: "/rollout-a.jsonl", completeSize: 700 },
		]).state;
		const reloaded = parseCodexRolloutState(JSON.stringify(cutover));
		const appended = Buffer.from(jsonl(assistant(["after crash"])));
		const callback = vi.fn(() => true);
		expect(
			consumeCompleteCodexJsonl(appended, reloaded.offsets["/rollout-a.jsonl"], callback)
		).toBe(700 + appended.length);
		expect(callback).toHaveBeenCalledWith(
			expect.objectContaining({ text: "after crash", recordOffset: 700 })
		);
	});

	it("starts an unknown post-cutover rollout at zero", () => {
		const result = registerCodexRollouts(
			{ initialized: true, offsets: { "/rollout-a.jsonl": 700 } },
			[{ path: "/rollout-b.jsonl", completeSize: 900 }]
		).state;
		expect(result.offsets["/rollout-b.jsonl"]).toBe(0);
	});

	it("registers concurrent same-CWD rollout paths independently", () => {
		const result = registerCodexRollouts({ initialized: true, offsets: {} }, [
			{ path: "/same-cwd-a.jsonl", completeSize: 100 },
			{ path: "/same-cwd-b.jsonl", completeSize: 200 },
		]).state;
		expect(result.offsets).toEqual({ "/same-cwd-a.jsonl": 0, "/same-cwd-b.jsonl": 0 });

		const responses: string[] = [];
		const first = Buffer.from(jsonl(assistant(["first session"])));
		const second = Buffer.from(jsonl(assistant(["second session"])));
		result.offsets["/same-cwd-a.jsonl"] = consumeCompleteCodexJsonl(
			first,
			result.offsets["/same-cwd-a.jsonl"],
			(response) => {
				responses.push(response.text);
				return true;
			}
		);
		result.offsets["/same-cwd-b.jsonl"] = consumeCompleteCodexJsonl(
			second,
			result.offsets["/same-cwd-b.jsonl"],
			(response) => {
				responses.push(response.text);
				return true;
			}
		);

		expect(responses).toEqual(["first session", "second session"]);
		expect(result.offsets).toEqual({
			"/same-cwd-a.jsonl": first.length,
			"/same-cwd-b.jsonl": second.length,
		});
	});
});
