// client-only — these functions use document/navigator APIs and are only called from onclick handlers

export function fallbackCopyText(text: string) {
	const ta = document.createElement("textarea");
	ta.value = text;
	ta.style.cssText = "position:fixed;left:-9999px";
	document.body.appendChild(ta);
	ta.select();
	document.execCommand("copy");
	document.body.removeChild(ta);
}

function fallbackCopyRich(html: string, plain: string) {
	const div = document.createElement("div");
	div.contentEditable = "true";
	div.innerHTML = html;
	div.style.cssText = "position:fixed;left:-9999px";
	document.body.appendChild(div);
	const range = document.createRange();
	range.selectNodeContents(div);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
	document.execCommand("copy");
	document.body.removeChild(div);
}

export async function copyRoom(roomId: string): Promise<string | void> {
	try {
		const res = await fetch("/api/copy-room", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ roomId }),
		});
		if (!res.ok) return;
		const { filePath } = await res.json();
		const text = `Read up on the conversation that happened in this room: ${filePath}`;
		try { await navigator.clipboard.writeText(text); } catch { fallbackCopyText(text); }
		return roomId;
	} catch {}
}

export async function copyMessage(msg: any): Promise<string | void> {
	try {
		const row = document.querySelector(`.msg-row[data-msg-id="${msg.id}"]`);
		const contentEl = row?.querySelector('.md-content') ?? row?.firstElementChild;
		const html = `<strong>${msg.sender}</strong><br>${contentEl?.innerHTML ?? msg.content}`;
		const plain = `${msg.sender}\n${msg.content}`;
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([html], { type: "text/html" }),
					"text/plain": new Blob([plain], { type: "text/plain" }),
				})
			]);
		} catch { fallbackCopyRich(html, plain); }
		return msg.id;
	} catch {}
}

export async function printRoom(roomId: string): Promise<string | void> {
	try {
		const res = await fetch("/api/print", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ roomId }),
		});
		if (!res.ok) return;
		return roomId;
	} catch {}
}

export async function printMessage(msg: any, roomId: string): Promise<string | void> {
	try {
		const res = await fetch("/api/print", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ roomId, messageId: msg.id }),
		});
		if (!res.ok) return;
		return msg.id;
	} catch {}
}
