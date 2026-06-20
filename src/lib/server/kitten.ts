import { exec, execFile } from "child_process";
import { promisify } from "util";
import { readdirSync, existsSync, writeFileSync, unlinkSync } from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

const KITTEN = "/opt/homebrew/bin/kitten";

// Kitty runs on iMac — all kitten commands go through SSH when Facade is on Mini
const IMAC_SSH = "ssh -T -o BatchMode=yes -i /Users/deepak-macmini/.ssh/id_mini -o StrictHostKeyChecking=no -o ConnectTimeout=3 d.patnaik@192.168.0.155";
const IS_MINI = os.hostname().includes("Mini");

function runKittenCmd(args: string[], timeout = 5000): Promise<{ stdout: string; stderr: string }> {
	if (IS_MINI) {
		const escaped = args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
		const cmd = `${IMAC_SSH} "${KITTEN} ${escaped}"`;
		return new Promise((resolve, reject) => {
			exec(cmd, { timeout, encoding: "utf-8" }, (err, stdout, stderr) => {
				if (err) reject(err);
				else resolve({ stdout: stdout as string, stderr: stderr as string });
			});
		});
	}
	return execFileAsync(KITTEN, args, { timeout });
}

// Per-teammate send queue: serializes sendToKitty calls so two payloads
// never interleave in the same PTY input buffer (REQ-98)
const sendQueues = new Map<string, Promise<void>>();

function enqueue(teammate: string, fn: () => Promise<void>): Promise<void> {
	const prev = sendQueues.get(teammate) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	sendQueues.set(teammate, next);
	return next;
}

export async function discoverSocket(): Promise<string | null> {
	// Return cached socket if less than 30s old (only cache successes — null results retry immediately)
	const cached = (globalThis as any).__kittySocket as { uri: string; ts: number } | undefined;
	if (cached && Date.now() - cached.ts < 30000) return cached.uri;

	if (IS_MINI) {
		// Skip default socket attempt — kitten @ ls without --to fails over SSH with TTY error
		// Go straight to named socket discovery
		try {
			const { stdout: filesOut } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
				exec(`${IMAC_SSH} "ls /tmp/honeybloom-kitty-*.sock 2>/dev/null"`, { timeout: 3000, encoding: "utf-8" }, (err, stdout, stderr) => {
					if (err) reject(err);
					else resolve({ stdout: stdout as string, stderr: stderr as string });
				});
			});
			for (const line of filesOut.trim().split("\n")) {
				if (!line) continue;
				const socketUri = `unix:${line.trim()}`;
				try {
					await runKittenCmd(["@", "--to", socketUri, "ls"], 3000);
					(globalThis as any).__kittySocket = { uri: socketUri, ts: Date.now() };
					return socketUri;
				} catch { continue; }
			}
		} catch {}
		return null;
	}

	const envSocket = process.env.KITTY_LISTEN_ON;

	if (envSocket) {
		const sockPath = envSocket.replace("unix:", "");
		if (existsSync(sockPath)) {
			try {
				await execFileAsync(KITTEN, ["@", "--to", envSocket, "ls"], { timeout: 3000 });
				return envSocket;
			} catch {
				// continue to glob
			}
		}
	}

	const tmpFiles = readdirSync("/tmp");
	const socketFiles = tmpFiles.filter(
		(f) => f.startsWith("honeybloom-kitty-") && f.endsWith(".sock")
	);
	for (const f of socketFiles) {
		const sockPath = `/tmp/${f}`;
		const socketUri = `unix:${sockPath}`;
		try {
			await execFileAsync(KITTEN, ["@", "--to", socketUri, "ls"], { timeout: 3000 });
			return socketUri;
		} catch {
			continue;
		}
	}

	return null;
}

export function sendToKitty(
	teammate: string,
	payload: { sender: string; room: string; body: string; timestamp: string }
): Promise<string> {
	let result = "queued";
	const work = enqueue(teammate, async () => {
		const socket = await discoverSocket();
		if (!socket) {
			result = "no_socket";
			console.error(`[sendToKitty] no_socket for to=${teammate}`);
			return;
		}

		let replyRoom = payload.room;
		if (payload.room.startsWith("direct-") && payload.sender !== "boss") {
			replyRoom = `direct-${payload.sender.toLowerCase()}`;
		} else if (payload.room.startsWith("direct-")) {
			// Strip session-scoped timestamps from Boss Reply-to (prevents model ID fabrication)
			const bareMatch = payload.room.match(/^(direct-[a-z]+)/);
			replyRoom = bareMatch ? bareMatch[1] : payload.room;
		}
		const text = [
			`sender: ${payload.sender}`,
			`room: ${payload.room}`,
			`timestamp: ${payload.timestamp}`,
			`body: "${payload.body}"`,
			`---\nReply to: ${replyRoom}`,
		].join("\n");

		try {
			const len = text.length;
			const enterDelay = Math.min(Math.max(1000, len * 0.5), 10000);
			const t0 = Date.now();

			// Write text to NFS temp file to avoid shell escaping issues over SSH
			const tmpFile = `/Users/d.patnaik/honeybloom/library/facade/.sendtext-${teammate}-${Date.now()}.tmp`;
			writeFileSync(tmpFile, text);

			try {
				const sendArgs = socket === "__default__"
					? ["@", "send-text", "--match", `var:teammate=${teammate}`, "--bracketed-paste", "disable", "--from-file", tmpFile]
					: ["@", "--to", socket, "send-text", "--match", `var:teammate=${teammate}`, "--bracketed-paste", "disable", "--from-file", tmpFile];
				await runKittenCmd(sendArgs, 10000);

				const sendDuration = Date.now() - t0;
				console.log(
					`[sendToKitty] to=${teammate} len=${len} delay=${enterDelay}ms sendDuration=${sendDuration}ms`
				);

				await new Promise((resolve) => setTimeout(resolve, enterDelay));

				const keyArgs = socket === "__default__"
					? ["@", "send-key", "--match", `var:teammate=${teammate}`, "enter"]
					: ["@", "--to", socket, "send-key", "--match", `var:teammate=${teammate}`, "enter"];
				await runKittenCmd(keyArgs, 3000);

				result = "delivered";
			} finally {
				try { unlinkSync(tmpFile); } catch {}
			}
		} catch (err) {
			result = `error: ${err instanceof Error ? err.message : String(err)}`;
			console.error(`[sendToKitty] FAILED to=${teammate} error=${result}`);
		}
	});
	return work.then(() => result);
}

export async function getAliveTeammates(): Promise<Set<string>> {
	const socket = await discoverSocket();
	if (!socket) return new Set();
	try {
		const lsArgs = socket === "__default__" ? ["@", "ls"] : ["@", "--to", socket, "ls"];
		const { stdout } = await runKittenCmd(lsArgs, 5000);
		const data = JSON.parse(stdout);
		const alive = new Set<string>();
		if (Array.isArray(data)) {
			for (const osWindow of data) {
				for (const tab of osWindow.tabs ?? []) {
					const teammateVar = Object.entries(tab.windows?.[0]?.user_vars ?? {}).find(
						([k]) => k === "teammate"
					);
					if (teammateVar) alive.add((teammateVar[1] as string).toLowerCase());
				}
			}
		}
		return alive;
	} catch {
		return new Set();
	}
}

export async function isTabAlive(teammate: string): Promise<boolean> {
	const socket = await discoverSocket();
	if (!socket) return false;
	try {
		const lsArgs = socket === "__default__"
			? ["@", "ls", "--match", `var:teammate=${teammate}`]
			: ["@", "--to", socket, "ls", "--match", `var:teammate=${teammate}`];
		const { stdout } = await runKittenCmd(lsArgs, 3000);
		const data = JSON.parse(stdout);
		return Array.isArray(data) && data.length > 0;
	} catch {
		return false;
	}
}

export async function closeKittyTab(teammate: string): Promise<boolean> {
	const socket = await discoverSocket();
	if (!socket) return false;
	try {
		const closeArgs = socket === "__default__"
			? ["@", "close-tab", "--match", `var:teammate=${teammate}`]
			: ["@", "--to", socket, "close-tab", "--match", `var:teammate=${teammate}`];
		await runKittenCmd(closeArgs, 3000);
		return true;
	} catch {
		return false;
	}
}
