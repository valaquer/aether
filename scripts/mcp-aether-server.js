#!/usr/bin/env node
// Aether MCP Server — stdio-based MCP server for teammates.
// Exposes: post_to_aether(body: string)
// Called via MCP from Kitty teammate tabs.

import { basename } from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const AETHER_URL = process.env.AETHER_URL || "http://localhost:51730";
const SENDER = process.env.AETHER_SENDER || basename(process.cwd());
const ROOM = process.env.AETHER_ROOM || "direct-boss";

const server = new Server(
	{ name: "Aether MCP", version: "0.1.0" },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "post_to_aether",
			description: "Post a message to a Aether room from your Kitty tab",
			inputSchema: {
				type: "object",
				properties: {
					body: { type: "string", description: "The message content" },
					room: { type: "string", description: "Target room (default: your own room)" },
				},
				required: ["body"],
			},
		},
		{
			name: "post_speed_reader_chunk",
			description: "Send a speed reader chunk for Boss's reading session",
			inputSchema: {
				type: "object",
				properties: {
					session_id: { type: "string", description: "The speed reader session ID" },
					chunk_text: { type: "string", description: "The text chunk (one breath-group)" },
					chunk_index: { type: "number", description: "Chunk sequence number starting at 0" },
					is_last: { type: "boolean", description: "True if this is the final chunk of this batch" },
					session_complete: { type: "boolean", description: "True if this is the final batch of the entire session (no more text)" },
				},
				required: ["session_id", "chunk_text", "chunk_index", "is_last"],
			},
		},
		{
			name: "post_speed_reader_batch",
			description: "Send all prosodic chunks for a batch in one call",
			inputSchema: {
				type: "object",
				properties: {
					session_id: { type: "string", description: "The speed reader session ID" },
					chunks: { type: "array", items: { type: "string" }, description: "Array of prosodic chunk texts in order" },
					session_complete: { type: "boolean", description: "True if this is the final batch (no more text)" },
				},
				required: ["session_id", "chunks"],
			},
		},
		{
			name: "open_speed_reader",
			description: "Open the speed reader in Boss's Safari browser for a given session",
			inputSchema: {
				type: "object",
				properties: {
					session_id: { type: "string", description: "The speed reader session ID to display" },
				},
				required: ["session_id"],
			},
		},
		{
			name: "label_speed_reader_session",
			description: "Save metadata for a speed reader session (label and source)",
			inputSchema: {
				type: "object",
				properties: {
					session_id: { type: "string", description: "The speed reader session ID" },
					label: { type: "string", description: "Description of the content (e.g. 'AI professor article on alignment')" },
					source: { type: "string", description: "Where the text came from (e.g. 'wiki', 'pasted article', URL)" },
				},
				required: ["session_id", "label"],
			},
		},
		{
			name: "search_speed_reader_sessions",
			description: "Search past speed reader sessions by label keyword",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "Search term to match against session labels" },
				},
				required: ["query"],
			},
		},
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const toolName = request.params.name;
	const args = request.params.arguments ?? {};

	if (toolName === "post_to_aether") {
		const body = String(args.body ?? "");
		const room = String(args.room ?? ROOM);
		if (!body) {
			return { content: [{ type: "text", text: "Error: body is required" }] };
		}

		try {
			const res = await fetch(`${AETHER_URL}/api/message`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sender: SENDER, body, room }),
			});

			if (!res.ok) {
				const text = await res.text();
				let msg = "Something went wrong.";
				try {
					const parsed = JSON.parse(text);
					if (parsed.message) msg = parsed.message;
					else if (parsed.error) msg = parsed.error;
				} catch {
					if (text) msg = text;
				}
				return { content: [{ type: "text", text: msg }] };
			}

			return { content: [{ type: "text", text: `Message sent to room ${room}.` }] };
		} catch (err) {
			return {
				content: [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
				],
			};
		}
	} else if (toolName === "post_speed_reader_chunk") {
		const session_id = String(args.session_id ?? "");
		const chunk_text = String(args.chunk_text ?? "");
		const chunk_index = Number(args.chunk_index ?? 0);
		const is_last = Boolean(args.is_last);
		const session_complete = Boolean(args.session_complete);

		if (!session_id || !chunk_text) {
			return { content: [{ type: "text", text: "Error: session_id and chunk_text are required" }] };
		}

		const payload = { session_id, chunk_text, chunk_index, is_last };
		if (session_complete) payload.session_complete = true;

		try {
			const res = await fetch(`${AETHER_URL}/api/speed-reader-chunks`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const text = await res.text();
				return { content: [{ type: "text", text: `Error: ${text}` }] };
			}

			const result = await res.json();
			if (result.stopped) {
				return { content: [{ type: "text", text: `STOPPED: Boss closed the speed reader. Stop sending chunks.` }] };
			}

			return { content: [{ type: "text", text: `Chunk ${chunk_index} sent.` }] };
		} catch (err) {
			return {
				content: [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
				],
			};
		}
	} else if (toolName === "post_speed_reader_batch") {
		const session_id = String(args.session_id ?? "");
		const chunks = args.chunks ?? [];
		const session_complete = Boolean(args.session_complete);

		if (!session_id || !Array.isArray(chunks) || chunks.length === 0) {
			return { content: [{ type: "text", text: "Error: session_id and non-empty chunks array required" }] };
		}

		try {
			// Get current max chunk_index for this session
			const existingRes = await fetch(`${AETHER_URL}/api/speed-reader-chunks?session=${encodeURIComponent(session_id)}`);
			const existingData = await existingRes.json();
			let startIndex = (existingData.chunks && existingData.chunks.length) || 0;

			for (let i = 0; i < chunks.length; i++) {
				const isLast = i === chunks.length - 1;
				const payload = {
					session_id,
					chunk_text: String(chunks[i]),
					chunk_index: startIndex + i,
					is_last: isLast,
				};
				if (isLast && session_complete) payload.session_complete = true;

				await fetch(`${AETHER_URL}/api/speed-reader-chunks`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			}

			return { content: [{ type: "text", text: `Batch of ${chunks.length} chunks sent (indices ${startIndex}-${startIndex + chunks.length - 1}).` }] };
		} catch (err) {
			return {
				content: [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
				],
			};
		}
	} else if (toolName === "label_speed_reader_session") {
		const session_id = String(args.session_id ?? "");
		const label = String(args.label ?? "");
		const source = args.source ? String(args.source) : undefined;

		if (!session_id || !label) {
			return { content: [{ type: "text", text: "Error: session_id and label are required" }] };
		}

		try {
			const res = await fetch(`${AETHER_URL}/api/speed-reader-sessions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ session_id, label, source }),
			});

			if (!res.ok) {
				const text = await res.text();
				return { content: [{ type: "text", text: `Error: ${text}` }] };
			}

			return { content: [{ type: "text", text: `Session labeled: "${label}"` }] };
		} catch (err) {
			return {
				content: [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
				],
			};
		}
	} else if (toolName === "search_speed_reader_sessions") {
		const query = String(args.query ?? "");

		if (!query) {
			return { content: [{ type: "text", text: "Error: query is required" }] };
		}

		try {
			const res = await fetch(`${AETHER_URL}/api/speed-reader-sessions?q=${encodeURIComponent(query)}`);

			if (!res.ok) {
				const text = await res.text();
				return { content: [{ type: "text", text: `Error: ${text}` }] };
			}

			const data = await res.json();
			if (!data.sessions || data.sessions.length === 0) {
				return { content: [{ type: "text", text: "No matching sessions found." }] };
			}

			const list = data.sessions.map(s => `${s.session_id} | ${s.label} | ${s.created_at}`).join("\n");
			return { content: [{ type: "text", text: list }] };
		} catch (err) {
			return {
				content: [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
				],
			};
		}
	} else if (toolName === "open_speed_reader") {
		const session_id = String(args.session_id ?? "");

		if (!session_id) {
			return { content: [{ type: "text", text: "Error: session_id is required" }] };
		}

		try {
			const res = await fetch(`${AETHER_URL}/api/speed-reader-open`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ session_id }),
			});

			if (!res.ok) {
				const text = await res.text();
				return { content: [{ type: "text", text: `Error: ${text}` }] };
			}

			return { content: [{ type: "text", text: `Speed reader opened for session ${session_id}.` }] };
		} catch (err) {
			return {
				content: [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
				],
			};
		}
	} else {
		throw new Error(`Unknown tool: ${toolName}`);
	}
});

const transport = new StdioServerTransport();
server.connect(transport);
