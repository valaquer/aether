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
					is_last: { type: "boolean", description: "True if this is the final chunk" },
				},
				required: ["session_id", "chunk_text", "chunk_index", "is_last"],
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

		if (!session_id || !chunk_text) {
			return { content: [{ type: "text", text: "Error: session_id and chunk_text are required" }] };
		}

		try {
			const res = await fetch(`${AETHER_URL}/api/speed-reader-chunks`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ session_id, chunk_text, chunk_index, is_last }),
			});

			if (!res.ok) {
				const text = await res.text();
				return { content: [{ type: "text", text: `Error: ${text}` }] };
			}

			return { content: [{ type: "text", text: `Chunk ${chunk_index} sent.` }] };
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
