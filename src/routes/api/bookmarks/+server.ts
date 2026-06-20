import type { RequestHandler } from "./$types";
import {
	saveBookmark,
	getBookmarks,
	updateBookmarkName,
	deleteBookmark,
} from "$lib/server/aether-db";
import { v4 } from "uuid";

export const GET: RequestHandler = async () => {
	const bookmarks = getBookmarks();
	return new Response(JSON.stringify(bookmarks), {
		headers: { "Content-Type": "application/json" },
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const { messageId, roomId, name } = await request.json();
	if (!messageId || !roomId || !name) {
		return new Response(JSON.stringify({ error: "Missing messageId, roomId, or name" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
	const id = v4();
	const createdAt = new Date().toISOString();
	saveBookmark({ id, messageId, roomId, name, createdAt });
	return new Response(JSON.stringify({ id, messageId, roomId, name, createdAt }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = await request.json();
	if (!id) {
		return new Response(JSON.stringify({ error: "Missing id" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
	deleteBookmark(id);
	return new Response(JSON.stringify({ ok: true }), {
		headers: { "Content-Type": "application/json" },
	});
};

export const PATCH: RequestHandler = async ({ request }) => {
	const { id, name } = await request.json();
	if (!id || !name) {
		return new Response(JSON.stringify({ error: "Missing id or name" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		});
	}
	updateBookmarkName(id, name);
	return new Response(JSON.stringify({ ok: true }), {
		headers: { "Content-Type": "application/json" },
	});
};
