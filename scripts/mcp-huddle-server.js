#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync } from "fs";

const AETHER_URL = process.env.AETHER_URL || "http://localhost:51730";

const server = new Server(
	{ name: "Huddle MCP", version: "0.1.0" },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "start_huddle",
			description:
				"Start a huddle. Creates a huddle room, auto-wakes participants, posts invitation.",
			inputSchema: {
				type: "object",
				properties: {
					host: { type: "string", description: "Host name" },
					participants: {
						type: "array",
						items: { type: "string" },
						description: "Participant names",
					},
				},
				required: ["host", "participants"],
			},
		},
		{
			name: "end_huddle",
			description: "End a huddle. Moves the room to past rooms.",
			inputSchema: {
				type: "object",
				properties: {
					roomId: { type: "string", description: "Huddle room ID" },
				},
				required: ["roomId"],
			},
		},
		{
			name: "add_to_huddle",
			description: "Add participants to an active huddle.",
			inputSchema: {
				type: "object",
				properties: {
					roomId: { type: "string", description: "Huddle room ID" },
					participants: {
						type: "array",
						items: { type: "string" },
						description: "Participant names to add",
					},
				},
				required: ["roomId", "participants"],
			},
		},
		{
			name: "remove_from_huddle",
			description: "Remove participants from an active huddle.",
			inputSchema: {
				type: "object",
				properties: {
					roomId: { type: "string", description: "Huddle room ID" },
					participants: {
						type: "array",
						items: { type: "string" },
						description: "Participant names to remove",
					},
				},
				required: ["roomId", "participants"],
			},
		},
		{
			name: "request_token",
			description: "Request the speaking token in your huddle. You'll be queued FIFO.",
			inputSchema: {
				type: "object",
				properties: {
					sender: { type: "string", description: "Your teammate name" },
					roomId: { type: "string", description: "Huddle room ID" },
				},
				required: ["sender", "roomId"],
			},
		},
		{
			name: "read_room",
			description:
				"Read the message history of any room (direct, huddle, or past). Writes to a file - use Read to view it.",
			inputSchema: {
				type: "object",
				properties: {
					roomId: {
						type: "string",
						description:
							"The room ID (e.g. direct-chica-20260603-130950, huddle-rio-20260603-130951)",
					},
				},
				required: ["roomId"],
			},
		},
	],
}));

async function callFacade(action, body) {
	try {
		const res = await fetch(`${AETHER_URL}/api/huddle`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, ...body }),
		});
		if (!res.ok) {
			const text = await res.text();
			return `Error: Facade returned ${res.status}: ${text}`;
		}
		return JSON.stringify(await res.json());
	} catch (err) {
		return `Error: Facade is not responding at ${AETHER_URL}`;
	}
}

async function callFacadeToken(action, body) {
	try {
		const res = await fetch(`${AETHER_URL}/api/huddle`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, ...body }),
		});
		if (!res.ok) {
			const text = await res.text();
			return `Error: Facade returned ${res.status}: ${text}`;
		}
		const data = await res.json();
		return data.result;
	} catch (err) {
		return `Error: Facade is not responding at ${AETHER_URL}`;
	}
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const args = request.params.arguments ?? {};
	switch (request.params.name) {
		case "start_huddle":
			return {
				content: [
					{
						type: "text",
						text: await callFacade("start", { host: args.host, participants: args.participants }),
					},
				],
			};
		case "end_huddle":
			return {
				content: [{ type: "text", text: await callFacade("end", { roomId: args.roomId }) }],
			};
		case "add_to_huddle":
			return {
				content: [
					{
						type: "text",
						text: await callFacade("add", { roomId: args.roomId, participants: args.participants }),
					},
				],
			};
		case "remove_from_huddle":
			return {
				content: [
					{
						type: "text",
						text: await callFacade("remove", {
							roomId: args.roomId,
							participants: args.participants,
						}),
					},
				],
			};
		case "request_token":
			return {
				content: [
					{
						type: "text",
						text: await callFacadeToken("request", { sender: args.sender, roomId: args.roomId }),
					},
				],
			};
		case "read_room": {
			try {
				const params = new URLSearchParams({ roomId: args.roomId });
				const res = await fetch(`${AETHER_URL}/api/huddle-history?${params}`);
				if (!res.ok) {
					const text = await res.text();
					try {
						const parsed = JSON.parse(text);
						return { content: [{ type: "text", text: parsed.error || text }] };
					} catch {
						return { content: [{ type: "text", text }] };
					}
				}
				const rooms = await res.json();
				const formatted = rooms
					.map((r) => {
						const header = `--- ${r.roomId} (started ${r.startedAt}) ---`;
						const msgs = r.messages
							.map((m) => `[${m.createdAt}] ${m.sender}: ${m.content}`)
							.join("\n");
						return `${header}\n${msgs}`;
					})
					.join("\n\n");
				const filePath = `/tmp/room-${args.roomId}.md`;
				writeFileSync(filePath, formatted || "No messages found for this room.");
				return {
					content: [
						{ type: "text", text: `Room history written to ${filePath} — use Read to view it.` },
					],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Error: Facade is not responding at ${AETHER_URL}` }],
				};
			}
		}
		default:
			throw new Error(`Unknown tool: ${request.params.name}`);
	}
});

const transport = new StdioServerTransport();
server.connect(transport);
