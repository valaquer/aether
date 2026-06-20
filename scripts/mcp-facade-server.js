#!/usr/bin/env node
// Facade MCP Server — stdio-based MCP server for teammates.
// Exposes: post_to_facade(body: string)
// Called via MCP from Kitty teammate tabs.

import { basename } from "path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const FACADE_URL = process.env.FACADE_URL || "http://localhost:51730";
const SENDER = process.env.FACADE_SENDER || basename(process.cwd());
const ROOM = process.env.FACADE_ROOM || "direct-boss";

const server = new Server(
	{ name: "Facade MCP", version: "0.1.0" },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "post_to_facade",
			description: "Post a message to a Facade room from your Kitty tab",
			inputSchema: {
				type: "object",
				properties: {
					body: { type: "string", description: "The message content" },
					room: { type: "string", description: "Target room (default: your own room)" },
				},
				required: ["body"],
			},
		},
	],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	if (request.params.name !== "post_to_facade") {
		throw new Error(`Unknown tool: ${request.params.name}`);
	}

	const args = request.params.arguments ?? {};
	const body = String(args.body ?? "");
	const room = String(args.room ?? ROOM);
	if (!body) {
		return { content: [{ type: "text", text: "Error: body is required" }] };
	}

	try {
		const res = await fetch(`${FACADE_URL}/api/message`, {
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
});

const transport = new StdioServerTransport();
server.connect(transport);
