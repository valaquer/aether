import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildMiniProcessCleanupCommand,
	cleanupMiniAndMaybeCloseTab,
	getTeammateHarness,
	persistOpenCodeInbox,
	shouldPersistOpenCodeInbox,
} from "./kitten";

const tempDirs: string[] = [];

function writeJanus(contents: string): string {
	const dir = mkdtempSync(join(tmpdir(), "aether-janus-test-"));
	tempDirs.push(dir);
	const csvPath = join(dir, "janus-config.csv");
	writeFileSync(csvPath, contents);
	return csvPath;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("OpenCode inbox routing", () => {
	const payload = {
		sender: "boss",
		room: "direct-natalie",
		body: "Review this",
		timestamp: "2026-07-21T19:00:00Z",
	};

	it("persists backlog only for the recipient's current OpenCode harness", () => {
		const csvPath = writeJanus(
			"teammate,role,model,harness,provider,api_key,effort_level,model_api_id,machine\n" +
				"rio,QA,Sol,Codex,OpenAI,,high,gpt-5.6-sol,mini\n" +
				"natalie,Contrarian,V4,OpenCode,DeepSeek,,high,deepseek-v4,mini\n"
		);

		expect(getTeammateHarness("rio", csvPath)).toBe("Codex");
		expect(shouldPersistOpenCodeInbox("rio", csvPath)).toBe(false);
		expect(shouldPersistOpenCodeInbox("natalie", csvPath)).toBe(true);
	});

	it("writes exactly one JSONL record only for OpenCode", () => {
		const csvPath = writeJanus(
			"teammate,role,model,harness\n" +
				"natalie,Contrarian,V4,OpenCode\n" +
				"rio,QA,Sol,Codex\n" +
				"chica,Principal,Opus,Claude\n"
		);
		const inboxDir = mkdtempSync(join(tmpdir(), "aether-inbox-test-"));
		tempDirs.push(inboxDir);

		expect(persistOpenCodeInbox("natalie", payload, csvPath, inboxDir)).toBe(true);
		expect(persistOpenCodeInbox("rio", payload, csvPath, inboxDir)).toBe(false);
		expect(persistOpenCodeInbox("chica", payload, csvPath, inboxDir)).toBe(false);

		const natalieInbox = join(inboxDir, "opencode-inbox-natalie.jsonl");
		expect(readFileSync(natalieInbox, "utf-8")).toBe(`${JSON.stringify(payload)}\n`);
		expect(existsSync(join(inboxDir, "opencode-inbox-rio.jsonl"))).toBe(false);
		expect(existsSync(join(inboxDir, "opencode-inbox-chica.jsonl"))).toBe(false);
	});

	it("does not write for malformed Janus rows and emits a diagnostic", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const csvPath = writeJanus(
			"teammate,role,model,harness\n" +
				"natalie,Contrarian,V4,OpenCode\n" +
				"natalie,Contrarian,Sol,Codex\n"
		);
		const inboxDir = mkdtempSync(join(tmpdir(), "aether-inbox-test-"));
		tempDirs.push(inboxDir);

		expect(persistOpenCodeInbox("natalie", payload, csvPath, inboxDir)).toBe(false);
		expect(existsSync(join(inboxDir, "opencode-inbox-natalie.jsonl"))).toBe(false);
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});

	it("does not write when the harness header is missing and diagnoses it", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const csvPath = writeJanus("teammate,role,model\nnatalie,Contrarian,V4\n");
		const inboxDir = mkdtempSync(join(tmpdir(), "aether-inbox-test-"));
		tempDirs.push(inboxDir);

		expect(persistOpenCodeInbox("natalie", payload, csvPath, inboxDir)).toBe(false);
		expect(existsSync(join(inboxDir, "opencode-inbox-natalie.jsonl"))).toBe(false);
		expect(error).toHaveBeenCalledOnce();
		error.mockRestore();
	});

	it("diagnoses an inbox append failure and creates no record", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const csvPath = writeJanus("teammate,role,model,harness\nnatalie,Contrarian,V4,OpenCode\n");
		const dir = mkdtempSync(join(tmpdir(), "aether-inbox-test-"));
		tempDirs.push(dir);
		const notADirectory = join(dir, "not-a-directory");
		writeFileSync(notADirectory, "occupied");

		expect(persistOpenCodeInbox("natalie", payload, csvPath, notADirectory)).toBe(false);
		expect(error).toHaveBeenCalledOnce();
		expect(readFileSync(notADirectory, "utf-8")).toBe("occupied");
		error.mockRestore();
	});

	it("fails closed for missing teammates or an unreadable config", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const csvPath = writeJanus("teammate,role,model,harness\nchica,OPS,Sol,Codex\n");

		expect(shouldPersistOpenCodeInbox("unknown", csvPath)).toBe(false);
		expect(shouldPersistOpenCodeInbox("chica", `${csvPath}.missing`)).toBe(false);
		expect(error).toHaveBeenCalledTimes(2);
		error.mockRestore();
	});

	it("fails closed and diagnoses blank or duplicate teammate harness rows", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const blankPath = writeJanus("teammate,role,model,harness\nnatalie,Contrarian,V4,\n");
		const duplicatePath = writeJanus(
			"teammate,role,model,harness\n" +
				"natalie,Contrarian,V4,OpenCode\n" +
				"natalie,Contrarian,Sol,Codex\n"
		);

		expect(getTeammateHarness("natalie", blankPath)).toBeNull();
		expect(getTeammateHarness("natalie", duplicatePath)).toBeNull();
		expect(error).toHaveBeenCalledTimes(2);
		error.mockRestore();
	});
});

describe("Mini teammate process cleanup", () => {
	it("records descendants, native Codex, then its allowlisted Node launcher", () => {
		const command = buildMiniProcessCleanupCommand("rio");

		expect(() => execFileSync("/bin/bash", ["-n"], { input: command })).not.toThrow();
		expect(command).toContain('record_descendants "$native"');
		expect(command.indexOf('add_target "$native" native')).toBeLessThan(
			command.indexOf('add_target "$launcher" launcher')
		);
		expect(command).toContain('node" /opt/homebrew/bin/codex "*');
		expect(command).toContain("fingerprint_of");
		expect(command).toContain('still_target "$pid" && kill -9');
		expect(command).toContain("surviving teammate processes");
	});

	it("rejects altered teammate input instead of retargeting it", () => {
		expect(() => buildMiniProcessCleanupCommand("rio; touch /tmp/bad")).toThrow(
			"Invalid teammate name"
		);
	});

	it("does not force-kill the same command after its process-start identity changes", () => {
		const definitions = buildMiniProcessCleanupCommand("rio").split('targets=""')[0];
		expect(() =>
			execFileSync("/bin/bash", [
				"-c",
				`${definitions}
command_of() { printf /tmp/bin/codex-code-mode-host; }
cwd_of() { printf '%s' "$expected_cwd"; }
is_live() { return 0; }
birth=first-start
birth_of() { printf '%s' "$birth"; }
fp_123=$(fingerprint_of 123)
role_123=descendant
birth=second-start
called=0
kill() { called=1; }
pid=123
still_target "$pid" && kill -9 "$pid" || true
[ "$called" -eq 0 ]`,
			])
		).not.toThrow();
	});

	it("does not inspect or close the Kitty tab after cleanup failure", async () => {
		const close = vi.fn(async () => true);
		const isAlive = vi.fn(async () => true);
		await expect(
			cleanupMiniAndMaybeCloseTab("rio", {
				kill: async () => {
					throw new Error("surviving teammate processes: 123");
				},
				isAlive,
				close,
			})
		).rejects.toThrow("surviving teammate processes: 123");
		expect(isAlive).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
	});

	it.each(["killed", "none"] as const)(
		"closes a surviving Kitty tab after successful %s cleanup",
		async (cleanup) => {
			const close = vi.fn(async () => true);
			const result = await cleanupMiniAndMaybeCloseTab("rio", {
				kill: async () => cleanup,
				isAlive: async () => true,
				close,
			});
			expect(result).toEqual({ cleanup, tabAlive: true, closed: true });
			expect(close).toHaveBeenCalledOnce();
		}
	);
});
