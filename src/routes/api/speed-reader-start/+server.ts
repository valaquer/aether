import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { sendToKitty } from "$lib/server/kitten";
import { getMessages } from "$lib/server/aether-db";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const PRIMER_SCRIPT = "/Users/deepak-macmini/honeybloom/library/scripts/speed-reader-primer.py";

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204, headers: corsHeaders });
};

export const POST: RequestHandler = async ({ request }) => {
	const { session_id, text, filePath, roomId, startFrom } = await request.json();

	let sourceFile: string;

	// Determine source text and write to file if needed
	if (filePath) {
		// Wiki / file-based use cases — file already exists
		sourceFile = filePath;
	} else if (roomId) {
		// Huddle chunk — extract Boss-anchored chunk from Aether DB
		const allMessages = getMessages(roomId).filter(
			(m) => m.type !== "tool_call" && m.type !== "response"
		);

		let chunkMessages = allMessages;
		if (startFrom) {
			// Find the clicked message's index
			const clickedIdx = allMessages.findIndex((m) => m.id === startFrom);
			if (clickedIdx >= 0) {
				// Walk backwards to find nearest Boss message (anchor)
				let anchorIdx = clickedIdx;
				for (let i = clickedIdx; i >= 0; i--) {
					if (allMessages[i].sender === "boss") {
						anchorIdx = i;
						break;
					}
				}
				// Walk forward to find next Boss message (boundary)
				let endIdx = allMessages.length;
				for (let i = anchorIdx + 1; i < allMessages.length; i++) {
					if (allMessages[i].sender === "boss") {
						endIdx = i;
						break;
					}
				}
				chunkMessages = allMessages.slice(anchorIdx, endIdx);
			}
		}

		const conversationText = chunkMessages
			.map((m) => `${m.sender}: ${m.content}`)
			.join("\n\n");
		const tmpFile = `/tmp/speed-reader-source-${Date.now()}.txt`;
		writeFileSync(tmpFile, conversationText, "utf-8");
		sourceFile = tmpFile;
	} else if (text) {
		// Detect wiki copy-path format or raw file path
		const wikiMatch = text.match(/Locate this article in the wiki:\s*(.+\.md)/);
		const pathMatch = wikiMatch || text.match(/^(\/[^\n]+\.md)\s*$/m);
		if (pathMatch) {
			sourceFile = pathMatch[1];
		} else {
			// Pure text — write to temp file
			const tmpFile = `/tmp/speed-reader-source-${Date.now()}.txt`;
			writeFileSync(tmpFile, text, "utf-8");
			sourceFile = tmpFile;
		}
	} else {
		return json({ error: "Missing text, filePath, or roomId" }, { status: 400, headers: corsHeaders });
	}

	// Run primer script — generates session ID, opens speed reader, extracts first 100 words
	try {
		const output = execSync(`python3 "${PRIMER_SCRIPT}" "${sourceFile}"`, {
			encoding: "utf-8",
			timeout: 15000,
		});

		const lines = output.trim().split("\n");
		const primerSessionId = lines[0];
		const primerText = lines.slice(1).join("\n");

		// Open speed reader — must happen AFTER execSync returns (primer's urllib call deadlocks because execSync blocks the event loop)
		const openRes = await fetch(`http://localhost:51730/api/speed-reader-open`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: primerSessionId }),
		}).catch(() => null);

		// Send primer text to Jeh with instruction
		const body = `[speed-reader-session: ${primerSessionId}]\nJeh, Boss says, do prosodic chunking of this and throw it up in the speed reader.\n\n${primerText}`;
		await sendToKitty("jeh", {
			sender: "boss",
			room: "direct-jeh",
			body,
			timestamp: new Date().toISOString(),
		});

		return json({ ok: true, session_id: primerSessionId }, { headers: corsHeaders });
	} catch (err) {
		return json(
			{ error: `Primer failed: ${err instanceof Error ? err.message : String(err)}` },
			{ status: 500, headers: corsHeaders }
		);
	}
};
