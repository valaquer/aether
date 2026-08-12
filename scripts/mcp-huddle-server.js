#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const AETHER_URL = process.env.AETHER_URL || "http://localhost:51820";

const server = new Server(
	{ name: "Huddle MCP", version: "0.1.0" },
	{ capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "start_huddle",
			description:
				"Start a huddle. Creates a team huddle (default) or a work huddle (when project is provided). Work huddles are project-scoped cross-team rooms.",
			inputSchema: {
				type: "object",
				properties: {
					host: { type: "string", description: "Host name" },
					participants: {
						type: "array",
						items: { type: "string" },
						description: "Participant names",
					},
					project: {
						type: "string",
						description: "Project name from ORG.md (e.g. Manhattan, Prague). When provided, creates a work huddle instead of a team huddle.",
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
			name: "pass_token",
			description: "Release the token without posting. Use when you have the token but your point is already covered.",
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
			name: "find_huddle",
			description:
				"Find an active huddle. By default finds a team huddle by host name. When project is provided, finds the work huddle for that project instead.",
			inputSchema: {
				type: "object",
				properties: {
					host: {
						type: "string",
						description:
							"The huddle host's name (e.g. dante, guru, rio). Used for team huddles.",
					},
					project: {
						type: "string",
						description:
							"Project name (e.g. Manhattan, Prague). When provided, finds the work huddle for this project instead of a team huddle.",
					},
				},
			},
		},
		{
			name: "read_room",
			description:
				"Read the message history of any room (direct, huddle, or past). Returns content directly.",
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

async function callAether(action, body) {
	try {
		const res = await fetch(`${AETHER_URL}/api/huddle`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, ...body }),
		});
		if (!res.ok) {
			const text = await res.text();
			return `Error: Aether returned ${res.status}: ${text}`;
		}
		return JSON.stringify(await res.json());
	} catch (err) {
		return `Error: Aether is not responding at ${AETHER_URL}`;
	}
}

async function callAetherToken(action, body) {
	try {
		const res = await fetch(`${AETHER_URL}/api/huddle`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action, ...body }),
		});
		if (!res.ok) {
			const text = await res.text();
			return `Error: Aether returned ${res.status}: ${text}`;
		}
		const data = await res.json();
		return data.result;
	} catch (err) {
		return `Error: Aether is not responding at ${AETHER_URL}`;
	}
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const args = request.params.arguments ?? {};
	switch (request.params.name) {
		case "start_huddle": {
			const body = { host: args.host, participants: args.participants };
			if (args.project) body.project = args.project;
			return {
				content: [
					{
						type: "text",
						text: await callAether("start", body),
					},
				],
			};
		}
		case "end_huddle":
			return {
				content: [{ type: "text", text: await callAether("end", { roomId: args.roomId }) }],
			};
		case "add_to_huddle":
			return {
				content: [
					{
						type: "text",
						text: await callAether("add", { roomId: args.roomId, participants: args.participants }),
					},
				],
			};
		case "remove_from_huddle":
			return {
				content: [
					{
						type: "text",
						text: await callAether("remove", {
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
						text: await callAetherToken("request", { sender: args.sender, roomId: args.roomId }),
					},
				],
			};
		case "pass_token":
			return {
				content: [
					{
						type: "text",
						text: await callAetherToken("pass", { sender: args.sender, roomId: args.roomId }),
					},
				],
			};
		case "find_huddle": {
			try {
				const res = await fetch(`${AETHER_URL}/api/rooms`);
				if (!res.ok) {
					return { content: [{ type: "text", text: `Error: Aether returned ${res.status}` }] };
				}
				const data = await res.json();
				const allHuddles = data.huddles ?? [];

				if (args.project) {
					const proj = args.project.toLowerCase();
					const match = allHuddles.find((h) => h.active && h.id.startsWith("work-") && h.name?.toLowerCase() === proj)
						?? allHuddles.find((h) => h.id.startsWith("work-") && h.name?.toLowerCase() === proj);
					if (!match) {
						return { content: [{ type: "text", text: `No active work huddle for project "${args.project}".` }] };
					}
					return {
						content: [{
							type: "text",
							text: `Found active work huddle:\n  Room ID: ${match.id}\n  Project: ${match.name}\n  Host: ${match.host}\n  Participants: ${match.participants.join(", ")}\n  Started: ${match.startedAt}`,
						}],
					};
				}

				const host = args.host?.toLowerCase();
				if (!host) {
					return { content: [{ type: "text", text: "Provide either host (for team huddle) or project (for work huddle)." }] };
				}
				const match = allHuddles.find((h) => h.active && h.host === host && !h.id.startsWith("work-"))
					?? allHuddles.find((h) => h.host === host && !h.id.startsWith("work-"));
				if (!match) {
					return {
						content: [{ type: "text", text: `No active team huddle for ${args.host}. The team may not be in a huddle right now.` }],
					};
				}
				return {
					content: [{
						type: "text",
						text: `Found active huddle:\n  Room ID: ${match.id}\n  Host: ${match.host}\n  Team: ${match.hostGroup}\n  Participants: ${match.participants.join(", ")}\n  Started: ${match.startedAt}`,
					}],
				};
			} catch (err) {
				return { content: [{ type: "text", text: `Error: Aether is not responding at ${AETHER_URL}` }] };
			}
		}
		case "read_room": {
			if (args.roomId?.startsWith("direct-burt") && process.env.FACADE_SENDER !== "burt") {
				return { content: [{ type: "text", text: "Access denied — direct-burt rooms are restricted to Burt only." }] };
			}
			try {
				const params = new URLSearchParams({ room: args.roomId, limit: "-1" });
				const res = await fetch(`${AETHER_URL}/api/messages?${params}`);
				if (!res.ok) {
					const text = await res.text();
					try {
						const parsed = JSON.parse(text);
						return { content: [{ type: "text", text: parsed.error || text }] };
					} catch {
						return { content: [{ type: "text", text }] };
					}
				}
				const messages = await res.json();
				if (!messages.length) {
					return { content: [{ type: "text", text: "No messages found for this room." }] };
				}
				const startedAt = messages[0]?.createdAt ?? messages[0]?.created_at ?? "unknown";
				const header = `--- ${args.roomId} (started ${startedAt}) ---`;
				const formatted = messages
					.map((m) => `[${m.createdAt || m.created_at}] ${m.sender}: ${m.content}`)
					.join("\n");
				return {
					content: [
						{ type: "text", text: `${header}\n${formatted}` },
					],
				};
			} catch (err) {
				return {
					content: [{ type: "text", text: `Error: Aether is not responding at ${AETHER_URL}` }],
				};
			}
		}
		default:
			throw new Error(`Unknown tool: ${request.params.name}`);
	}
});

const transport = new StdioServerTransport();
server.connect(transport);
