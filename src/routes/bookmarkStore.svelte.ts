export type Bookmark = { id: string; messageId: string; roomId: string; name: string; createdAt: string };

let bookmarks = $state<Bookmark[]>([]);
let editingBookmarkId = $state<string | null>(null);
let editingBookmarkName = $state("");
let pendingScrollMessageId = $state<string | null>(null);

export function getBookmarks() { return bookmarks; }
export function setBookmarks(val: Bookmark[]) { bookmarks = val; }
export function getEditingBookmarkId() { return editingBookmarkId; }
export function setEditingBookmarkId(val: string | null) { editingBookmarkId = val; }
export function getEditingBookmarkName() { return editingBookmarkName; }
export function setEditingBookmarkName(val: string) { editingBookmarkName = val; }
export function getPendingScrollMessageId() { return pendingScrollMessageId; }
export function setPendingScrollMessageId(val: string | null) { pendingScrollMessageId = val; }

export async function loadBookmarks() {
	try {
		const res = await fetch("/api/bookmarks");
		bookmarks = await res.json();
	} catch { bookmarks = []; }
}

export async function toggleBookmark(msg: { id: string; sender: string; createdAt: string; content: string }, roomId: string) {
	const existing = bookmarks.find(bm => bm.messageId === msg.id);
	if (existing) {
		await fetch("/api/bookmarks", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: existing.id }),
		});
		bookmarks = bookmarks.filter(bm => bm.id !== existing.id);
	} else {
		const fallbackTime = new Date(msg.createdAt);
		const hh = String(fallbackTime.getHours()).padStart(2, "0");
		const mm = String(fallbackTime.getMinutes()).padStart(2, "0");
		const fallbackName = `${msg.sender} \u00b7 ${hh}:${mm}`;
		const res = await fetch("/api/bookmarks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messageId: msg.id, roomId, name: fallbackName }),
		});
		if (res.ok) {
			const bm: Bookmark = await res.json();
			bookmarks = [bm, ...bookmarks];
			editingBookmarkId = bm.id;
			editingBookmarkName = "";
		}
	}
}

export function commitBookmarkName(bm: Bookmark) {
	const trimmed = editingBookmarkName.trim();
	if (trimmed) {
		bm.name = trimmed;
		fetch("/api/bookmarks", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id: bm.id, name: bm.name }),
		}).catch(() => {});
	}
	editingBookmarkId = null;
	editingBookmarkName = "";
	bookmarks = [...bookmarks];
}
