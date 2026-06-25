<script lang="ts">
	import { marked } from 'marked';
	import { onMount, onDestroy, tick } from 'svelte';
	import LucideRewind from '~icons/lucide/rewind';
	import LucidePlay from '~icons/lucide/play';
	import LucidePause from '~icons/lucide/pause';
	import LucideFastForward from '~icons/lucide/fast-forward';
	import LucideRadio from '~icons/lucide/radio';
	import LucideMaximize2 from '~icons/lucide/maximize-2';
	import LucideMinimize2 from '~icons/lucide/minimize-2';
	import LucideX from '~icons/lucide/x';
	import LucideFiles from '~icons/lucide/files';
	import LucideBookmark from '~icons/lucide/bookmark';
	import LucideArchive from '~icons/lucide/archive';
	import LucideLibrary from '~icons/lucide/library';
	import LucideImages from '~icons/lucide/images';
	import LucideMilestone from '~icons/lucide/milestone';
	import LucideConstruction from '~icons/lucide/construction';
	import LucidePower from '~icons/lucide/power';

	marked.setOptions({ breaks: true, gfm: true });

	function renderMd(content: string): string {
		const lines = content.split('\n');
		const processed: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const isListItem = /^\d+\.\s/.test(lines[i]);
			const prevIsListItem = i > 0 && /^\d+\.\s/.test(lines[i - 1]);
			const prevIsBlank = i > 0 && lines[i - 1].trim() === '';
			if (isListItem && !prevIsListItem && !prevIsBlank && i > 0) {
				processed.push('');
			}
			if (!isListItem && prevIsListItem && lines[i].trim() !== '') {
				processed.push('');
			}
			processed.push(lines[i]);
		}
		return marked.parse(processed.join('\n')) as string;
	}

	function renderToolCard(content: string): string {
		let data: any;
		try { data = JSON.parse(content); } catch { return renderMd(content); }
		const { toolName, toolInput, toolOutput, status, summary } = data;
		const statusIcon = status === "error" ? "✗" : status === "success" ? "✓" : "";
		const statusColor = status === "error" ? "#f87171" : status === "success" ? "#4ade80" : "transparent";
		const headerStyle = "display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.5em; padding-bottom: 0.5em; border-bottom: 1px solid var(--color-bg-step4);";
		const cardStyle = "background: var(--color-bg-panel); border-radius: 4px; padding: 0.75em; margin-bottom: 0.5em;";
		const preStyle = "background: var(--color-bg); padding: 0.5em; border-radius: 4px; white-space: pre-wrap; overflow-wrap: break-word; font-size: 11px; line-height: 1.5; margin: 0;";
		const labelStyle = "font-size: 11px; margin-bottom: 0.25rem; color: var(--color-text-muted);";
		const nameStyle = "font-family: var(--font-mono); font-size: 11px; font-weight: 500;";

		if (summary) {
			return `<div style="background: var(--color-bg-panel); border-radius: 4px; padding: 0.5em 0.75em;">
				<div style="display: flex; align-items: center; gap: 0.5em;">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">${escapeHtml(toolName)}</span>
				</div>
				<div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); margin-top: 0.25em;">${escapeHtml(summary)}</div>
			</div>`;
		}

		const input = typeof toolInput === "string" ? tryParseJson(toolInput) : toolInput;
		const tool = (toolName || "").toLowerCase();

		// Edit tool — show file path header + diff-style old/new
		if (tool === "edit") {
			const filePath = input?.file_path || input?.filePath || "";
			const oldStr = input?.old_string || "";
			const newStr = input?.new_string || "";
			const fileName = filePath.split("/").slice(-2).join("/");
			let diffHtml = "";
			if (oldStr || newStr) {
				const oldLines = oldStr.split("\n").map((l: string) => `<div style="background: rgba(180,60,60,0.12); color: #c9877a; padding: 0 0.5em;">- ${escapeHtml(l)}</div>`).join("");
				const newLines = newStr.split("\n").map((l: string) => `<div style="background: rgba(60,140,80,0.12); color: #8abf8a; padding: 0 0.5em;">+ ${escapeHtml(l)}</div>`).join("");
				diffHtml = `<div style="font-family: var(--font-mono); font-size: 11px; line-height: 1.5; border-radius: 4px; overflow: hidden; background: var(--color-bg); margin-top: 0.5em;">${oldLines}${newLines}</div>`;
			}
			return `<div style="${cardStyle}">
				<div style="${headerStyle}">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">Edit</span>
					<span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted);">${escapeHtml(fileName)}</span>
				</div>
				${diffHtml}
			</div>`;
		}

		// Write tool — show file path header + content preview
		if (tool === "write") {
			const filePath = input?.file_path || input?.filePath || "";
			const fileContent = input?.content || "";
			const fileName = filePath.split("/").slice(-2).join("/");
			const preview = fileContent.length > 500 ? fileContent.substring(0, 500) + "\n... [truncated]" : fileContent;
			return `<div style="${cardStyle}">
				<div style="${headerStyle}">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">Write</span>
					<span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted);">${escapeHtml(fileName)}</span>
				</div>
				<pre style="${preStyle}"><code>${escapeHtml(preview)}</code></pre>
			</div>`;
		}

		// Bash tool — show command header + output (with diff coloring if detected)
		if (tool === "bash") {
			const command = input?.command || "";
			const description = input?.description || "";
			const output = typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2);
			const descHtml = description ? `<div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); margin-bottom: 0.5em;">${escapeHtml(description)}</div>` : "";
			return `<div style="${cardStyle}">
				<div style="${headerStyle}">
					<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
					<span style="${nameStyle} color: var(--color-text);">Bash</span>
				</div>
				${descHtml}
				<pre style="${preStyle} margin-bottom: 0.5em; background: rgba(200,180,140,0.12); color: #c8b896;"><code>$ ${escapeHtml(command)}</code></pre>
				${output ? renderBashOutput(output) : ""}
			</div>`;
		}

		// Default — render structured fields as key: value lines, not raw JSON
		let inputHtml = "";
		let outputHtml = "";
		if (toolInput) {
			const parsed = typeof toolInput === "string" ? tryParseJson(toolInput) : toolInput;
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				const lines = Object.entries(parsed)
					.filter(([, v]) => v !== null && v !== undefined && v !== "")
					.map(([k, v]) => {
						const val = typeof v === "string" ? v : JSON.stringify(v);
						const truncated = val.length > 300 ? val.substring(0, 300) + " ..." : val;
						return `<div style="margin-bottom: 0.25em;"><span style="color: var(--color-text-muted);">${escapeHtml(k)}:</span> ${escapeHtml(truncated)}</div>`;
					}).join("");
				inputHtml = `<div style="font-family: var(--font-mono); font-size: 11px; line-height: 1.5; margin-bottom: 0.5em;">${lines}</div>`;
			} else {
				const inputStr = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);
				inputHtml = `<div style="${labelStyle}">Input:</div><pre style="${preStyle} margin-bottom: 0.75em;"><code>${escapeHtml(inputStr)}</code></pre>`;
			}
		}
		if (toolOutput) {
			const output = typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput, null, 2);
			const truncated = output.length > 1000 ? output.substring(0, 1000) + "\n... [truncated]" : output;
			outputHtml = `<div style="${labelStyle}">Output:</div><pre style="${preStyle}"><code>${escapeHtml(truncated)}</code></pre>`;
		}
		return `<div style="${cardStyle}">
			<div style="${headerStyle}">
				<span style="${nameStyle} color: ${statusColor};">${statusIcon}</span>
				<span style="${nameStyle} color: var(--color-text);">${escapeHtml(toolName)}</span>
			</div>
			${inputHtml}
			${outputHtml}
		</div>`;
	}

	function renderBashOutput(output: string): string {
		const lines = output.split("\n");
		const isDiff = lines.some(l => l.startsWith("diff --git ") || l.startsWith("@@"));
		if (!isDiff) {
			return `<pre style="background: var(--color-bg); padding: 0.5em; border-radius: 4px; white-space: pre-wrap; overflow-wrap: break-word; font-size: 11px; line-height: 1.5; margin: 0;"><code>${escapeHtml(output)}</code></pre>`;
		}
		const colored = lines.map(line => {
			const escaped = escapeHtml(line);
			if (line.startsWith("diff --git ") || line.startsWith("--- ") || line.startsWith("+++ ")) {
				return `<div style="color: var(--color-text-muted); padding: 0 0.5em;">${escaped}</div>`;
			}
			if (line.startsWith("@@")) {
				return `<div style="color: var(--color-text-muted); padding: 0 0.5em;">${escaped}</div>`;
			}
			if (line.startsWith("+")) {
				return `<div style="background: rgba(60,140,80,0.12); color: #8abf8a; padding: 0 0.5em;">${escaped}</div>`;
			}
			if (line.startsWith("-")) {
				return `<div style="background: rgba(180,60,60,0.12); color: #c9877a; padding: 0 0.5em;">${escaped}</div>`;
			}
			return `<div style="padding: 0 0.5em;">${escaped}</div>`;
		}).join("");
		return `<div style="font-family: var(--font-mono); font-size: 11px; line-height: 1.5; border-radius: 4px; overflow: hidden; background: var(--color-bg);">${colored}</div>`;
	}

	function tryParseJson(str: string): any {
		try { return JSON.parse(str); } catch { return str; }
	}

	function escapeHtml(str: string): string {
		return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	}

	onMount(() => {
		document.addEventListener('click', (e) => {
			const btn = (e.target as HTMLElement).closest('.copy-btn');
			if (!btn) return;
			const pre = btn.closest('pre');
			if (!pre) return;
			const code = pre.querySelector('code');
			if (!code) return;
			try { navigator.clipboard.writeText(code.textContent || ''); } catch { fallbackCopyText(code.textContent || ''); }
			btn.textContent = 'Copied';
			setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
		});

		const observer = new MutationObserver(() => {
			document.querySelectorAll('.md-content pre').forEach((pre) => {
				if (pre.querySelector('.copy-btn')) return;
				const btn = document.createElement('button');
				btn.className = 'copy-btn';
				btn.textContent = 'Copy';
				pre.appendChild(btn);
			});
		});
		observer.observe(document.body, { childList: true, subtree: true });
		document.querySelectorAll('.md-content pre').forEach((pre) => {
			if (pre.querySelector('.copy-btn')) return;
			const btn = document.createElement('button');
			btn.className = 'copy-btn';
			btn.textContent = 'Copy';
			pre.appendChild(btn);
		});
	});

	type SidebarItem = { id: string; name: string; kind: "teammate" | "huddle" | "past"; model?: string; participants?: string[]; online?: boolean; group?: string; groupIdx?: number; startedAt?: string };
	type ChatMsg = { id: string; sender: string; content: string; createdAt: string; toolCall?: boolean; response?: boolean; summary?: string };
	type Bookmark = { id: string; messageId: string; roomId: string; name: string; createdAt: string };
	type NavItem =
		| { type: "header"; section: string }
		| { type: "teammate"; item: SidebarItem }
		| { type: "huddle"; item: SidebarItem }
		| { type: "bookmark"; bm: Bookmark }
		| { type: "past"; item: SidebarItem };

	function formatPastRoom(name: string): { label: string; date: string } {
		const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
		// direct-{name}-{YYYYMMDD}-{HHMMSS}
		const directMatch = name.match(/^direct-(.+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\d{2}$/);
		if (directMatch) {
			const [, n, y, mo, d, h, mi] = directMatch;
			return { label: n, date: `${parseInt(d)} ${months[parseInt(mo)-1]} ${y} ${h}:${mi}` };
		}
		// huddle-{host}-{YYYYMMDD}-{HHMMSS}
		const huddleMatch = name.match(/^huddle-(.+)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\d{2}$/);
		if (huddleMatch) {
			const [, host, y, mo, d, h, mi] = huddleMatch;
			return { label: host + "'s huddle", date: `${parseInt(d)} ${months[parseInt(mo)-1]} ${y} ${h}:${mi}` };
		}
		const bareMatch = name.match(/^direct-([a-z]+)$/);
		if (bareMatch) return { label: bareMatch[1], date: "" };
		const offlineMatch = name.match(/^offline-([a-z]+)$/);
		if (offlineMatch) return { label: offlineMatch[1], date: "" };
		return { label: name, date: "" };
	}

	let sidebarItems = $state<SidebarItem[]>([]);
	let selectedIndex = $state(-1);
	let conversations = $state<Record<string, ChatMsg[]>>({});
	let newMessage = $state("");
	let eventSource: EventSource | undefined;
	let messagesContainer: HTMLElement | undefined = $state();
	let liveMirrorActive = $state(false);
	let miniPressure = $state(false);
	let pausedRoom = $state<string | null>(null);
	let stoppedHuddles = $state<Set<string>>(new Set());
	let sidebarLoaded = $state(false);
	let focusMode = $state(false);
	let rewindIndex = $state<number | null>(null);

	function saveRewindPosition(room: string, messageId: string) {
		try {
			const positions = JSON.parse(localStorage.getItem('aether-rewind-positions') ?? '{}');
			positions[room] = messageId;
			localStorage.setItem('aether-rewind-positions', JSON.stringify(positions));
		} catch {}
	}

	function clearRewindPosition(room: string) {
		try {
			const positions = JSON.parse(localStorage.getItem('aether-rewind-positions') ?? '{}');
			delete positions[room];
			localStorage.setItem('aether-rewind-positions', JSON.stringify(positions));
		} catch {}
	}

	function restoreRewindPosition(room: string, messages: ChatMsg[]): number | null {
		try {
			const positions = JSON.parse(localStorage.getItem('aether-rewind-positions') ?? '{}');
			const storedId = positions[room];
			if (!storedId) return null;
			const idx = messages.findIndex(m => m.id === storedId);
			if (idx === -1) { clearRewindPosition(room); return null; }
			return idx;
		} catch { return null; }
	}
	let displayedConvId = $state("");
	let queuedMessageIds = $state<Record<string, string[]>>({});
	let messageQueues = $state<Record<string, ChatMsg[]>>({});
	let pausing = $state(false);
	let pastSearchQuery = $state("");
	let pauseError = $state(false);
	let userScrolledUp = $state(false);
	let loadingRoom = $state("");
	let broadcastedMsgId = $state<string | null>(null);
	let pulsingTeammates = $state<string[]>([]);
	let activeAccount = $state("?");
	async function fetchActiveAccount() {
		try {
			const r = await fetch("/api/account-switch");
			if (r.ok) { const d = await r.json(); activeAccount = d.account === "oovar" ? "O" : d.account === "gmail" ? "G" : "?"; }
		} catch {}
	}
	// Nav model: unified navItems array in visual order with section headers as navigable items
	let navItems = $derived.by(() => {
		const items: NavItem[] = [];
		items.push({ type: "header", section: "Teammates" });
		for (const item of sidebarItems.filter(x => x.kind === "teammate")) {
			items.push({ type: "teammate", item });
		}
		items.push({ type: "header", section: "Huddles" });
		for (const item of sidebarItems.filter(x => x.kind === "huddle").sort((a, b) => a.id.localeCompare(b.id))) {
			items.push({ type: "huddle", item });
		}
		if (bookmarks.length > 0) {
			items.push({ type: "header", section: "Bookmarks" });
			for (const bm of bookmarks) {
				items.push({ type: "bookmark", bm });
			}
		}
		const query = pastSearchQuery.trim().toLowerCase();
		const pastItems = sidebarItems.filter(x => {
			if (x.kind !== "past") return false;
			if (query && !x.id.toLowerCase().includes(query)) return false;
			return true;
		}).sort((a, b) => {
			const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
			const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
			return timeB - timeA;
		});
		items.push({ type: "header", section: "Past Rooms" });
		if (query) {
			for (const item of pastItems) {
				items.push({ type: "past", item });
			}
		}
		return items;
	});

	function navItemRoomId(nav: NavItem): string {
		if (nav.type === "header") return "";
		if (nav.type === "bookmark") return nav.bm.roomId;
		return nav.item.id;
	}

	let selectedConvId = $derived.by(() => {
		if (!sidebarLoaded) return "";
		const nav = navItems[selectedIndex];
		if (!nav) return "";
		return navItemRoomId(nav);
	});

	let currentRoomKind = $derived.by(() => {
		const nav = navItems[selectedIndex];
		if (!nav) return "";
		if (nav.type === "header") return "header";
		if (nav.type === "bookmark") {
			const item = sidebarItems.find(x => x.id === nav.bm.roomId);
			return item?.kind ?? "past";
		}
		return nav.item.kind;
	});

	let prefsTimer: ReturnType<typeof setTimeout> | undefined;

	function findNavIndex(items: NavItem[], roomId: string, section?: string): number {
		// If was on a header, find the same header
		if (section) {
			const idx = items.findIndex(n => n.type === "header" && n.section === section);
			if (idx >= 0) return idx;
		}
		// Find by room ID
		if (roomId) {
			const idx = items.findIndex(n => navItemRoomId(n) === roomId);
			if (idx >= 0) return idx;
		}
		return 0; // Teammates header
	}

	async function loadSidebar() {
		try {
			const currentRoomId = selectedConvId;
			const isInitialLoad = !sidebarLoaded;
			const wasOnHeader = !isInitialLoad && navItems[selectedIndex]?.type === "header";
			const headerSection = wasOnHeader ? (navItems[selectedIndex] as { type: "header"; section: string }).section : "";
			const fetches: Promise<Response>[] = [fetch("/api/rooms")];
			if (isInitialLoad) fetches.push(fetch("/api/preferences"));
			const responses = await Promise.all(fetches);
			const data = await responses[0].json();
			const prefs = isInitialLoad ? await responses[1].json() : null;
			const teammates = (data.teammates ?? []).map((t: { id: string; name: string; model: string; online: boolean; group?: string; groupIdx?: number }) => ({ id: t.id, name: t.name, model: t.model || "", kind: "teammate" as const, online: t.online, group: t.group || "", groupIdx: t.groupIdx ?? 0 }));
			const currentHuddles: SidebarItem[] = (data.huddles ?? []).map((h: { id: string; name: string; host: string; participants: string[] }) => ({ id: h.id, name: h.name, kind: "huddle" as const, participants: h.participants }));
			const pastItems: SidebarItem[] = (data.pastRooms ?? []).map((p: { id: string; name: string; startedAt?: string }) => ({ id: p.id, name: p.name, kind: "past" as const, startedAt: p.startedAt }));

			const items = [...teammates, ...currentHuddles, ...pastItems];
			sidebarItems = items;
			if (archiveFlashName) {
				const target = teammates.find((t: any) => t.name === archiveFlashName);
				if (target && !target.online) archiveFlashName = "";
			}
			if (archiveFlashRoom) {
				const stillActive = currentHuddles.some((h: any) => h.id === archiveFlashRoom);
				if (!stillActive) archiveFlashRoom = "";
			}
			// navItems is $derived and recalculates immediately after sidebarItems assignment
			const roomToFind = isInitialLoad ? (prefs?.selectedRoom ?? "") : currentRoomId;
			selectedIndex = findNavIndex(navItems, roomToFind, wasOnHeader ? headerSection : undefined);
			sidebarLoaded = true;
		} catch {
			sidebarItems = [];
			sidebarLoaded = true;
		}
	}

	function savePrefs() {
		if (prefsTimer) clearTimeout(prefsTimer);
		const roomId = selectedConvId;
		if (!roomId) return; // Don't save prefs when on a section header
		prefsTimer = setTimeout(() => {
			fetch("/api/preferences", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ selectedRoom: roomId }),
			}).catch(() => {});
		}, 300);
	}

	function flushQueue() {
		const convId = selectedConvId;
		const queue = convId ? (messageQueues[convId] ?? []) : [];
		if (queue.length > 0 && convId) {
			conversations[convId] = [...(conversations[convId] ?? []), ...queue];
			conversations = conversations;
			messageQueues[convId] = [];
			messageQueues = messageQueues;
		}
		userScrolledUp = false;
		if (convId) { delete queuedMessageIds[convId]; queuedMessageIds = queuedMessageIds; }
		localStorage.setItem('aether-queued-ids', JSON.stringify(queuedMessageIds));
		if (convId?.startsWith("huddle-")) { stoppedHuddles.add(convId); stoppedHuddles = new Set(stoppedHuddles); localStorage.setItem('aether-stopped-huddles', JSON.stringify([...stoppedHuddles])); } else { pausedRoom = null; localStorage.removeItem('aether-paused-room'); }
	}

	async function sendPauseMessage() {
		if (pausing) return;
		pausing = true;
		try {
			const res = await fetch("/api/message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sender: "boss", room: selectedConvId, body: "Everybody, pause." }),
			});
			if (!res.ok) throw new Error();
		} catch {
			pauseError = true;
			setTimeout(() => pauseError = false, 2000);
		} finally {
			pausing = false;
		}
	}

	function stepOne() {
		const convId = selectedConvId;
		const queue = convId ? (messageQueues[convId] ?? []) : [];
		const roomIds = convId ? (queuedMessageIds[convId] ?? []) : [];
		if (queue.length === 0) { if (currentRoomKind !== "huddle") { pausedRoom = null; localStorage.removeItem('aether-paused-room'); } if (convId) { delete queuedMessageIds[convId]; queuedMessageIds = queuedMessageIds; } localStorage.setItem('aether-queued-ids', JSON.stringify(queuedMessageIds)); return; }
		const batch: ChatMsg[] = [];
		let remaining = [...queue];
		while (remaining.length > 0) {
			const msg = remaining.shift()!;
			batch.push(msg);
			if (!msg.response) break;
		}
		messageQueues[convId!] = remaining;
		messageQueues = messageQueues;
		const batchIds = new Set(batch.map(m => m.id));
		if (convId) { queuedMessageIds[convId] = roomIds.filter(id => !batchIds.has(id)); queuedMessageIds = queuedMessageIds; }
		localStorage.setItem('aether-queued-ids', JSON.stringify(queuedMessageIds));
		if (convId && batch.length > 0) {
			const lastReal = batch.findLast(m => !m.response);
			conversations[convId] = [...(conversations[convId] ?? []), ...batch];
			conversations = conversations;
			setTimeout(() => {
				if (messagesContainer && lastReal) {
					const el = messagesContainer.querySelector(`[data-msg-id="${lastReal.id}"]`);
					if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
				}
			}, 50);
		}
		if (remaining.length === 0) {
			if (currentRoomKind !== "huddle") { pausedRoom = null; localStorage.removeItem('aether-paused-room'); }
			if (convId) { delete queuedMessageIds[convId]; queuedMessageIds = queuedMessageIds; }
			localStorage.setItem('aether-queued-ids', JSON.stringify(queuedMessageIds));
		}
	}

	function stepBack() {
		const convId = selectedConvId;
		if (!convId) return;
		const conv = conversations[convId] ?? [];
		if (conv.length === 0) return;
		const batch: ChatMsg[] = [];
		let remaining = [...conv];
		while (remaining.length > 0) {
			const msg = remaining.pop()!;
			batch.unshift(msg);
			if (!msg.response && !msg.toolCall) break;
		}
		if (batch.length === 0) return;
		conversations[convId] = remaining;
		conversations = conversations;
		const queue = messageQueues[convId] ?? [];
		messageQueues[convId] = [...batch, ...queue];
		messageQueues = messageQueues;
		const batchIds = batch.map(m => m.id);
		const roomIds = queuedMessageIds[convId] ?? [];
		queuedMessageIds[convId] = [...batchIds, ...roomIds];
		queuedMessageIds = queuedMessageIds;
		localStorage.setItem('aether-queued-ids', JSON.stringify(queuedMessageIds));
		if (!isCurrentRoomPaused) {
			if (convId.startsWith("huddle-")) { stoppedHuddles.delete(convId); stoppedHuddles = new Set(stoppedHuddles); localStorage.setItem('aether-stopped-huddles', JSON.stringify([...stoppedHuddles])); }
			else { pausedRoom = convId; localStorage.setItem('aether-paused-room', convId); }
		}
		setTimeout(() => {
			if (messagesContainer && remaining.length > 0) {
				const lastMsg = remaining[remaining.length - 1];
				const el = messagesContainer.querySelector(`[data-msg-id="${lastMsg.id}"]`);
				if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		}, 50);
	}

	async function sendMessage() {
		const content = newMessage.trim();
		if (!content || !selectedConvId) return;
		newMessage = "";
		await tick();
		resizeInput();
		userScrolledUp = false;
		if (rewindIndex !== null) { rewindIndex = null; clearRewindPosition(selectedConvId); }

		try {
			const res = await fetch("/api/message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sender: "boss", body: content, room: selectedConvId }),
			});
			setTimeout(() => { if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 50);
		} catch {
			// ignore send errors
		}
	}

	function handleSSE(event: MessageEvent) {
		try {
			const data = JSON.parse(event.data);
			if (data.type === "livemirror_status") {
				liveMirrorActive = data.active;
			} else if (data.type === "pulse_update") {
				if (data.teammate && !pulsingTeammates.includes(data.teammate)) {
					pulsingTeammates = [...pulsingTeammates, data.teammate];
				}
			} else if (data.type === "pulse_dismiss") {
				if (data.teammate) {
					pulsingTeammates = pulsingTeammates.filter(n => n !== data.teammate);
				}
				} else if (data.type === "huddle_update") {
				if (!nuking) loadSidebar();
			} else if (data.type === "message") {
				const convId = data.conversationId;
				const msg: ChatMsg = {
					id: data.id ?? `${convId}-${Date.now()}`,
					sender: data.sender,
					content: data.content,
					createdAt: data.timestamp ?? new Date().toISOString(),
					toolCall: data.toolCall === true,
					response: data.response === true,
					summary: data.summary || "",
				};
				if (msg.sender !== "boss" && ((convId.startsWith("huddle-") && !stoppedHuddles.has(convId)) || convId === pausedRoom || (convId === selectedConvId && loadingRoom))) {
					messageQueues[convId] = [...(messageQueues[convId] ?? []), msg];
					messageQueues = messageQueues;
					queuedMessageIds[convId] = [...(queuedMessageIds[convId] ?? []), msg.id];
					queuedMessageIds = queuedMessageIds;
					localStorage.setItem('aether-queued-ids', JSON.stringify(queuedMessageIds));
				} else {
					conversations[convId] = [...(conversations[convId] ?? []), msg];
					conversations = conversations;
				}
			}
		} catch {
			// ignore parse errors
		}
	}

	let sseTimeout: ReturnType<typeof setTimeout> | undefined;

	function connectEventSource() {
		eventSource?.close();
		if (sseTimeout) clearTimeout(sseTimeout);
		eventSource = new EventSource("/api/events");
		eventSource.onmessage = handleSSE;
		sseTimeout = setTimeout(() => {
			if (eventSource?.readyState !== EventSource.OPEN) {
				eventSource?.close();
				eventSource = new EventSource("/api/events");
				eventSource.onmessage = handleSSE;
				sseTimeout = setTimeout(() => {
					if (eventSource?.readyState !== EventSource.OPEN) {
						loadingRoom = "";
					}
				}, 5000);
				eventSource.onopen = () => { if (sseTimeout) clearTimeout(sseTimeout); };
			}
		}, 5000);
		eventSource.onopen = () => { if (sseTimeout) clearTimeout(sseTimeout); };
	}

	let isReconnecting = false;

	function reconnect() {
		if (isReconnecting) return;
		isReconnecting = true;
		connectEventSource();
		Promise.all([
			loadSidebar(),
			fetch("/api/livemirror-status").then(r => r.json()).then(d => { liveMirrorActive = d.active; }).catch(() => {}),
			fetch("/api/pulse").then(r => r.json()).then(d => { if (d.pending?.length) { pulsingTeammates = d.pending.map((p: {teammate: string}) => p.teammate); } }).catch(() => {}),
			fetchActiveAccount(),
		]).then(() => {
			// Force room-switch $effect to re-run and load messages
			prevRoom = "";
		}).finally(() => {
			isReconnecting = false;
		});
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible') {
			reconnect();
		}
	}

	onMount(() => {
		try { const sh = localStorage.getItem('aether-stopped-huddles'); if (sh) stoppedHuddles = new Set(JSON.parse(sh)); } catch {}
		const savedIds = localStorage.getItem('aether-queued-ids');
		if (savedIds) { try { const parsed = JSON.parse(savedIds); if (Array.isArray(parsed)) { queuedMessageIds = {}; } else { queuedMessageIds = parsed; } } catch {} }
		loadSidebar();
		loadBookmarks();
		resizeInput();
		fetch("/api/livemirror-status").then(r => r.json()).then(d => { liveMirrorActive = d.active; }).catch(() => {});
		fetch("/api/pulse").then(r => r.json()).then(d => { if (d.pending?.length) { pulsingTeammates = d.pending.map((p: {teammate: string}) => p.teammate); } }).catch(() => {});
		fetchActiveAccount();
		connectEventSource();
		pulsePoller = setInterval(() => {
			fetch("/api/pulse").then(r => r.json()).then(d => {
				const pending = (d.pending ?? []).map((p: {teammate: string}) => p.teammate);
				if (pending.length > 0) { pulsingTeammates = [...new Set([...pulsingTeammates, ...pending])]; }
			}).catch(() => {});
		}, 60000);
		sidebarPoller = setInterval(() => { loadSidebar(); }, 5000);
		fetch("/api/mini-health").then(r => r.json()).then(d => { miniPressure = d.status === "pressure"; }).catch(() => {});
		miniHealthPoller = setInterval(() => { fetch("/api/mini-health").then(r => r.json()).then(d => { miniPressure = d.status === "pressure"; }).catch(() => {}); }, 30000);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		eventSource?.close();
		if (sseTimeout) clearTimeout(sseTimeout);
		if (roomSwitchTimer) clearTimeout(roomSwitchTimer);
		if (pulsePoller) clearInterval(pulsePoller);
		if (sidebarPoller) clearInterval(sidebarPoller);
		if (miniHealthPoller) clearInterval(miniHealthPoller);
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	let inputRef: HTMLTextAreaElement | undefined = $state();

	function resizeInput() {
		if (!inputRef) return;
		inputRef.style.height = '0';
		inputRef.style.height = Math.min(inputRef.scrollHeight, 200) + 'px';
	}
	let pulsePoller: ReturnType<typeof setInterval> | undefined;
	let sidebarPoller: ReturnType<typeof setInterval> | undefined;
	let miniHealthPoller: ReturnType<typeof setInterval> | undefined;


	$effect(() => {
		const idx = selectedIndex;
		const el = document.querySelector(`[data-nav-idx="${idx}"]`);
		if (el) el.scrollIntoView({ block: "nearest", behavior: "instant" });
	});

	let prevRoom = "";
	let roomSwitchTimer: ReturnType<typeof setTimeout> | undefined;

	// Room-switch effect: debounced to avoid jitter during rapid Ctrl+Up/Down navigation.
	// Headers (selectedConvId = "") are skipped — chat panel persists last room via displayedConvId.
	$effect(() => {
		const room = selectedConvId;
		if (!room) return; // Header selected — keep displaying previous room
		if (room === prevRoom) return;
		prevRoom = room;
		displayedConvId = room;
		savePrefs();
		userScrolledUp = false;
		if (roomSwitchTimer) clearTimeout(roomSwitchTimer);
		roomSwitchTimer = setTimeout(() => {
			if (room.startsWith("huddle-") && !stoppedHuddles.has(room)) {
				// Huddle pause is implicit — all huddles paused unless in stoppedHuddles
			}
			loadingRoom = room;
			fetch(`/api/messages?room=${room}`)
				.then((r) => r.json())
				.then((msgs: any[]) => {
					if (loadingRoom !== room) return;
					const parsed = msgs.map((m) => ({ ...m, toolCall: m.type === "tool_call", response: m.type === "response" }));
					// If paused and have queued IDs, split: queued go to messageQueues, rest to conversations
					const roomQueuedIds = queuedMessageIds[room] ?? [];
					if ((room.startsWith("huddle-") && !stoppedHuddles.has(room)) && roomQueuedIds.length > 0) {
						const queuedSet = new Set(roomQueuedIds);
						const queued = parsed.filter((m: ChatMsg) => queuedSet.has(m.id));
						const rest = parsed.filter((m: ChatMsg) => !queuedSet.has(m.id));
						conversations[room] = rest;
						conversations = conversations;
						messageQueues[room] = queued;
						messageQueues = messageQueues;
					} else {
						conversations[room] = parsed;
						conversations = conversations;
					}
					loadingRoom = "";
					// Restore rewind position if one was saved for this room
					const visibleMessages = (conversations[room] ?? []).filter((m: ChatMsg) => !isTokenNoise(m) && !m.toolCall && !m.response);
					const restored = restoreRewindPosition(room, visibleMessages);
					rewindIndex = restored;
					// Scroll to bottom on initial load (unless spotlight restored)
					setTimeout(() => {
						if (rewindIndex !== null) {
							if (messagesContainer) messagesContainer.scrollTop = 0;
						} else {
							if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
							if (activityContainer) activityContainer.scrollTop = activityContainer.scrollHeight;
						}
					}, 50);
				})
				.catch(() => { if (loadingRoom === room) loadingRoom = ""; });
		}, 1000);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.ctrlKey && e.key === 'ArrowDown') {
			e.preventDefault();
			if (navItems.length === 0) return;
			selectedIndex = Math.min(selectedIndex + 1, navItems.length - 1);
			const nav = navItems[selectedIndex];
			if (nav?.type === "bookmark") pendingScrollMessageId = nav.bm.messageId;
		} else if (e.ctrlKey && e.key === 'ArrowUp') {
			e.preventDefault();
			if (navItems.length === 0) return;
			selectedIndex = Math.max(selectedIndex - 1, 0);
			const nav = navItems[selectedIndex];
			if (nav?.type === "bookmark") pendingScrollMessageId = nav.bm.messageId;
		} else if (e.key === 'Enter' && !e.shiftKey && document.activeElement !== inputRef) {
			e.preventDefault();
			inputRef?.focus();
		} else if (e.key === 'Escape' && document.activeElement === inputRef) {
			e.preventDefault();
			inputRef?.blur();
		} else if (e.ctrlKey && e.key === 'ArrowRight') {
			e.preventDefault();
			if (rewindIndex !== null) {
				if (rewindIndex >= chatMessages.length - 1) { rewindIndex = null; clearRewindPosition(selectedConvId); setTimeout(() => { if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 50); }
				else { rewindIndex++; saveRewindPosition(selectedConvId, chatMessages[rewindIndex].id); if (messagesContainer) messagesContainer.scrollTop = 0; }
			} else if (isCurrentRoomPaused) { stepOne(); }
		} else if (e.ctrlKey && e.key === 'ArrowLeft') {
			e.preventDefault();
			if (rewindIndex !== null) { if (rewindIndex > 0) { rewindIndex--; saveRewindPosition(selectedConvId, chatMessages[rewindIndex].id); if (messagesContainer) messagesContainer.scrollTop = 0; } }
			else { rewindIndex = Math.max(0, chatMessages.length - 2); saveRewindPosition(selectedConvId, chatMessages[rewindIndex].id); if (messagesContainer) messagesContainer.scrollTop = 0; }
		} else if (e.key === 'Escape' && rewindIndex !== null) {
			e.preventDefault();
			rewindIndex = null;
			clearRewindPosition(selectedConvId);
			setTimeout(() => { if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 50);
		}
	}

	function isTokenNoise(msg: ChatMsg): boolean {
		if (msg.sender !== "system") return false;
		const c = msg.content;
		return c.startsWith("Token passed to ") || c.includes("token released");
	}

	let currentMessages = $derived(displayedConvId ? (conversations[displayedConvId] ?? []).filter((m) => !isTokenNoise(m)) : []);
	function extractDate(name: string): string {
		const m = name.match(/-(\d{8})-/);
		return m ? m[1] : "";
	}
	let pastDateGroupMap = $derived.by(() => {
		const pastItems = sidebarItems.filter((x) => x.kind === "past");
		const map = new Map<string, number>();
		let groupIdx = 0;
		let lastDate = "";
		for (const item of pastItems) {
			const d = extractDate(item.id);
			if (d !== lastDate) { if (lastDate) groupIdx++; lastDate = d; }
			map.set(item.id, groupIdx);
		}
		return map;
	});
	let chatMessages = $derived(currentMessages.filter((m) => !m.toolCall && !m.response));
	let activityCards = $derived(currentMessages.filter((m) => m.toolCall || m.response));
	let isCurrentRoomPaused = $derived((selectedConvId?.startsWith("huddle-") && !stoppedHuddles.has(selectedConvId)) || pausedRoom === selectedConvId);

	$effect(() => {
		chatMessages;
		if (messagesContainer && !userScrolledUp) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	});

	let activityContainer: HTMLElement | undefined = $state();

	$effect(() => {
		activityCards;
		if (activityContainer) {
			activityContainer.scrollTop = activityContainer.scrollHeight;
		}
	});

	function autofocusInput(node: HTMLInputElement) {
		setTimeout(() => node.focus(), 0);
	}

	// Bookmarks
	let bookmarks = $state<Bookmark[]>([]);
	let editingBookmarkId = $state<string | null>(null);
	let editingBookmarkName = $state("");
	let pendingScrollMessageId = $state<string | null>(null);

	async function loadBookmarks() {
		try {
			const res = await fetch("/api/bookmarks");
			bookmarks = await res.json();
		} catch { bookmarks = []; }
	}

	async function toggleBookmark(msg: ChatMsg) {
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
				body: JSON.stringify({ messageId: msg.id, roomId: selectedConvId, name: fallbackName }),
			});
			if (res.ok) {
				const bm: Bookmark = await res.json();
				bookmarks = [bm, ...bookmarks];
				editingBookmarkId = bm.id;
				editingBookmarkName = "";
			}
		}
	}

	function commitBookmarkName(bm: Bookmark) {
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

	function navigateToBookmark(bm: Bookmark) {
		const idx = navItems.findIndex(n => n.type === "bookmark" && n.bm.id === bm.id);
		if (idx >= 0) {
			selectedIndex = idx;
			pendingScrollMessageId = bm.messageId;
		}
	}

	function scrollToMessage(messageId: string) {
		if (!messagesContainer) return;
		const el = messagesContainer.querySelector(`[data-msg-id="${messageId}"]`);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "center" });
			el.classList.add("bookmark-highlight");
			setTimeout(() => el.classList.remove("bookmark-highlight"), 2000);
			pendingScrollMessageId = null;
		}
	}

	$effect(() => {
		const msgs = currentMessages;
		const target = pendingScrollMessageId;
		if (target && msgs.length > 0) {
			setTimeout(() => scrollToMessage(target), 100);
		}
	});

	function findNextRoom(fromIdx: number): number {
		// Look forward for next non-header item
		for (let i = fromIdx + 1; i < navItems.length; i++) {
			if (navItems[i].type !== "header") return i;
		}
		// Fall back to previous non-header item
		for (let i = fromIdx - 1; i >= 0; i--) {
			if (navItems[i].type !== "header") return i;
		}
		return 0; // Teammates header as last resort
	}

	async function dismissTeammate(name: string) {
		try {
			archiveFlashName = name;
			pulsingTeammates = pulsingTeammates.filter(n => n !== name);
			const currentNav = navItems[selectedIndex];
			if (currentNav?.type === "teammate" && currentNav.item?.name === name) {
				selectedIndex = findNextRoom(selectedIndex);
			}
			fetch("/api/dismiss-pulse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teammate: name }) }).catch(() => {});
			await fetch("/api/rooms/deactivate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			setTimeout(() => { archiveFlashName = ""; }, 10000);
		} catch {}
	}

	let copyFlashRoom = $state("");
	let copyFlashMsgId = $state("");
	let archiveFlashName = $state("");
	let archiveFlashRoom = $state("");

	async function archiveHuddle(roomId: string) {
		try {
			archiveFlashRoom = roomId;
			if (selectedConvId === roomId) {
				selectedIndex = findNextRoom(selectedIndex);
			}
			await fetch("/api/archive-huddle", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ roomId }),
			});
			setTimeout(() => { archiveFlashRoom = ""; }, 10000);
		} catch {}
	}
	let nuking = $state(false);
	async function nukeAll() {
		if (nuking) return;
		nuking = true;
		try {
			selectedIndex = 0;
			const onlineTeammates = sidebarItems.filter(x => x.kind === "teammate" && x.online).map(x => x.name);
			const activeHuddles = sidebarItems.filter(x => x.kind === "huddle").map(x => x.id);
			await Promise.all([
				...onlineTeammates.map(name => fetch("/api/rooms/deactivate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => {})),
				...activeHuddles.map(roomId => fetch("/api/archive-huddle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId }) }).catch(() => {})),
			]);
			await loadSidebar();
		} finally {
			nuking = false;
		}
	}

	function fallbackCopyText(text: string) {
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

	async function copyRoom(roomId: string) {
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
			copyFlashRoom = roomId;
			setTimeout(() => { copyFlashRoom = ""; }, 1500);
		} catch {}
	}

	async function copyMessage(msg: any) {
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
			copyFlashMsgId = msg.id;
			setTimeout(() => { copyFlashMsgId = ""; }, 1500);
		} catch {}
	}

	// Ruler overlay
	let showRuler = $state(false);
	let rulerX = $state(100);
	let rulerY = $state(200);
	let dragging = $state(false);
	let dragOffsetX = 0;
	let dragOffsetY = 0;

	function onRulerMouseDown(e: MouseEvent) {
		dragging = true;
		dragOffsetX = e.clientX - rulerX;
		dragOffsetY = e.clientY - rulerY;
		e.preventDefault();
	}

	function onRulerMouseMove(e: MouseEvent) {
		if (!dragging) return;
		rulerX = e.clientX - dragOffsetX;
		rulerY = e.clientY - dragOffsetY;
	}

	function onRulerMouseUp() {
		dragging = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} onmousemove={onRulerMouseMove} onmouseup={onRulerMouseUp} />


<div style="display: grid; grid-template-columns: 350px calc(50vw - 685px) 570px 1fr 570px 1fr; height: 100vh;">
	<!-- Sidebar -->
	<div style="background: var(--color-bg-panel); border-right: 1px dashed var(--color-bg-step4); display: flex; flex-direction: column; height: 100vh; visibility: {focusMode ? 'hidden' : 'visible'};">
		<div style="flex: 1; overflow-y: auto; font-family: var(--font-sans);">
		{#if sidebarLoaded}
			{#each navItems as nav, i}
				{#if nav.type === "header"}
					<div
						data-nav-idx={i}
						onclick={() => selectedIndex = i}
						style="padding: 1rem 1rem 1rem 1.5rem; cursor: pointer; {nav.section !== 'Teammates' ? '' : 'border-top: 1px dashed var(--color-bg-step4);'} border-bottom: 1px dashed var(--color-bg-step4); background: {selectedIndex === i ? 'var(--color-bg-element)' : 'transparent'};"
					>
						<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">{nav.section}</p>
						{#if nav.section === "Past Rooms"}
							<input
								type="text"
								bind:value={pastSearchQuery}
								placeholder="Search..."
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => { if (e.key === 'Escape') { pastSearchQuery = ''; e.currentTarget.blur(); } }}
								style="display: block; margin-top: 6px; width: 100%; background: var(--color-bg-surface); border: 1px dashed var(--color-bg-step4); border-radius: 4px; padding: 4px 8px; font-size: 11px; font-family: var(--font-sans); color: var(--color-text); outline: none;"
							/>
						{/if}
					</div>
				{:else if nav.type === "teammate"}
					{@const item = nav.item}
					{@const fmt = formatPastRoom(item.id)}
					<div
						class="teammate-row{pulsingTeammates.includes(fmt.label) ? ' notification-pulse' : ''}"
						data-nav-idx={i}
						onclick={() => { if (pulsingTeammates.includes(fmt.label)) { pulsingTeammates = pulsingTeammates.filter(n => n !== fmt.label); fetch("/api/dismiss-pulse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teammate: fmt.label }) }).catch(() => {}); } selectedIndex = i; }}
						style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {archiveFlashName === fmt.label ? '#555' : (pulsingTeammates.includes(fmt.label) ? '' : (selectedIndex === i ? 'var(--color-text)' : 'var(--color-text-muted)'))}; background: {selectedIndex === i ? 'var(--color-bg-element)' : ((item.groupIdx ?? 0) % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')}; position: relative; {archiveFlashName === fmt.label ? 'opacity: 0.3;' : ''}"
					>
						<div><span class="teammate-led" style="display: inline-block; width: 4px; height: 4px; border-radius: 50%; margin-right: 6px; vertical-align: middle; background: {item.online ? '#4ade80' : '#555'}; {item.online ? 'box-shadow: 0 0 4px #4ade80, 0 0 8px #4ade8066;' : ''}"></span><span style="{item.online ? '' : 'color: #555; opacity: 0.35;'}">{fmt.label}</span> {#if fmt.date}<span class="sidebar-meta" style="font-size: 9px; color: #666;">{fmt.date}</span>{/if} {#if item.model} <span class="sidebar-meta" style="font-size: 9px; color: #666; font-family: Menlo, monospace; font-weight: bold;">{item.model}</span>{/if}</div>
						{#if item.online}<span class="sidebar-actions">
							<button class="sidebar-action-btn" onclick={(e) => { e.stopPropagation(); dismissTeammate(fmt.label); }} title="Archive"><LucideArchive width={14} height={14} style="color: {archiveFlashName === fmt.label ? '#7a5e4a' : ''}" /></button>
							<button class="sidebar-action-btn" onclick={(e) => { e.stopPropagation(); copyRoom(item.id); }} title="Copy"><LucideFiles width={14} height={14} style="color: {copyFlashRoom === item.id ? '#7a5e4a' : ''}" /></button>
						</span>{/if}
					</div>
				{:else if nav.type === "huddle"}
					{@const item = nav.item}
					{@const fmt = formatPastRoom(item.id)}
					{@const huddleLocalIdx = navItems.slice(0, i).filter(n => n.type === "huddle").length}
					{@const isMainHuddle = (item.participants?.length ?? 0) >= sidebarItems.filter(x => x.kind === "teammate").length}
					<div
						class="sidebar-row"
						data-nav-idx={i}
						onclick={() => selectedIndex = i}
						style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {archiveFlashRoom === item.id ? '#555' : (selectedIndex === i ? 'var(--color-text)' : 'var(--color-text-muted)')}; background: {selectedIndex === i ? 'var(--color-bg-element)' : (huddleLocalIdx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent')}; position: relative; {archiveFlashRoom === item.id ? 'opacity: 0.3;' : ''}"
					>
						<div>{isMainHuddle ? "Main huddle" : fmt.label} &nbsp;{#if fmt.date}<span class="sidebar-meta" style="font-size: 9px; color: #666;">{fmt.date}</span>{/if}</div>
						{#if item.participants?.length}
							<div style="font-size: 9px; line-height: 1.6; color: #666;">{#each item.participants as p, pi}{#if pi > 0}{', '}{/if}{p}{/each}</div>
						{/if}
						<span class="sidebar-actions">
							<button class="sidebar-action-btn" onclick={(e) => { e.stopPropagation(); archiveHuddle(item.id); }} title="Archive"><LucideArchive width={14} height={14} style="color: {archiveFlashRoom === item.id ? '#7a5e4a' : ''}" /></button>
							<button class="sidebar-action-btn" onclick={(e) => { e.stopPropagation(); copyRoom(item.id); }} title="Copy"><LucideFiles width={14} height={14} style="color: {copyFlashRoom === item.id ? '#7a5e4a' : ''}" /></button>
						</span>
					</div>
				{:else if nav.type === "bookmark"}
					{@const bm = nav.bm}
					{@const bmLocalIdx = navItems.slice(0, i).filter(n => n.type === "bookmark").length}
					<div
						data-nav-idx={i}
						onclick={() => { selectedIndex = i; pendingScrollMessageId = bm.messageId; }}
						style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === i ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === i ? 'var(--color-bg-element)' : (bmLocalIdx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent')};"
					>
						{#if editingBookmarkId === bm.id}
							<input
								type="text"
								bind:value={editingBookmarkName}
								placeholder="Type bookmark name"
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); commitBookmarkName(bm); } }}
								onblur={() => commitBookmarkName(bm)}
								style="background: transparent; border: none; outline: none; color: var(--color-text); font-family: var(--font-sans); font-size: inherit; width: 100%; padding: 0; text-transform: lowercase;"
								use:autofocusInput
							/>
						{:else}
							<div style="text-transform: lowercase;">{bm.name}</div>
						{/if}
					</div>
				{:else if nav.type === "past"}
					{@const item = nav.item}
					{@const fmt = formatPastRoom(item.name)}
					{@const dateGroupIdx = pastDateGroupMap.get(item.id) ?? 0}
					<div
						class="sidebar-row"
						data-nav-idx={i}
						onclick={() => selectedIndex = i}
						style="padding: 0 1rem 0 1.5rem; cursor: pointer; color: {selectedIndex === i ? 'var(--color-text)' : 'var(--color-text-muted)'}; background: {selectedIndex === i ? 'var(--color-bg-element)' : (dateGroupIdx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent')}; position: relative;"
					>
						<div>{fmt.label} &nbsp;{#if fmt.date}<span class="sidebar-meta" style="font-size: 9px; color: #666;">{fmt.date}</span>{/if}</div>
						<span class="sidebar-actions">
							<button class="sidebar-action-btn" onclick={(e) => e.stopPropagation()} title="Archive"><LucideArchive width={14} height={14} /></button>
							<button class="sidebar-action-btn" onclick={(e) => { e.stopPropagation(); copyRoom(item.id); }} title="Copy"><LucideFiles width={14} height={14} style="color: {copyFlashRoom === item.id ? '#7a5e4a' : ''}" /></button>
						</span>
					</div>
				{/if}
			{/each}
		{/if}
		</div>
	</div>

	<!-- Gap col 2 -->
	<div></div>
	{#if displayedConvId}
		<!-- Chat column (col 3 — 570px) -->
		<div style="position: relative; overflow: hidden;" class="flex flex-col">
			<!-- Conversation area (scrollable) -->
			<div class="flex-1 overflow-y-auto" style="background: var(--color-bg); padding-bottom: {currentRoomKind === "past" || selectedConvId?.startsWith("offline-") ? '0' : '120px'};" bind:this={messagesContainer} onscroll={(e) => { const el = e.currentTarget; userScrolledUp = el.scrollTop < el.scrollHeight - el.clientHeight - 50; }}>
				<div class="py-2" style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px; margin-top: auto;">
					{#each rewindIndex !== null ? [chatMessages[rewindIndex]].filter(Boolean) : chatMessages as msg}
						<div style="padding-top: {msg.toolCall ? 'calc(2rem - 1px + 0.75em)' : 'calc(2rem - 1px)'}; text-align: left; align-self: start;">
							<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">{msg.sender}</p>
						</div>
						<div class="msg-row" data-msg-id={msg.id} style="padding-top: 2rem; padding-bottom: 12px; position: relative;">
							<div style="border-left: {msg.sender === 'boss' ? '2px solid #5A3E2E' : '2px solid transparent'}; padding-left: 1.5rem;">
								{#if msg.toolCall}
									{@html renderToolCard(msg.content)}
								{:else}
									<div class="md-content">
										{@html renderMd(msg.content)}
									</div>
								{/if}
							</div>
							<span class="msg-actions">
								<button class="control-btn" onclick={() => copyMessage(msg)} title="Copy message" style="color: {copyFlashMsgId === msg.id ? '#7a5e4a' : '#555'};"><LucideFiles width={14} height={14} /></button>
								<button class="control-btn {bookmarks.some(bm => bm.messageId === msg.id) ? 'bookmarked' : ''}" onclick={() => toggleBookmark(msg)} title="Bookmark" style="margin-left: -4px; color: {bookmarks.some(bm => bm.messageId === msg.id) ? '#7a5e4a' : '#555'};"><LucideBookmark width={14} height={14} /></button>
							</span>
						</div>
					{/each}
				</div>
			</div>
			<!-- Input bar -->
			{#if currentRoomKind !== "past" && currentRoomKind !== "header" && !selectedConvId?.startsWith("offline-")}
			<div style="position: absolute; bottom: 0; left: 0; right: 0; background: var(--color-bg);">
			<!-- Control strip -->
			<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
				<div></div>
				<div class="control-strip">
					<span class="control-led" style="margin-right: 4px;" class:active={liveMirrorActive} class:pulsing={pulsingTeammates.length > 0} class:cop-car={miniPressure} title={miniPressure ? "Mini under pressure" : "Live mirror"}></span>
				<button class="control-btn" onclick={() => { if (rewindIndex !== null) { if (rewindIndex > 0) { rewindIndex--; saveRewindPosition(selectedConvId, chatMessages[rewindIndex].id); if (messagesContainer) messagesContainer.scrollTop = 0; } } else { rewindIndex = Math.max(0, chatMessages.length - 2); saveRewindPosition(selectedConvId, chatMessages[rewindIndex].id); if (messagesContainer) messagesContainer.scrollTop = 0; } }} title="Rewind">
						<LucideRewind width={14} height={14} style="color: #555;" />
				</button>
				<button class="control-btn" onclick={() => { if (isCurrentRoomPaused) stepOne(); }} title="Forward" style="{isCurrentRoomPaused ? '' : 'pointer-events: none;'}">
						<LucideFastForward width={14} height={14} style="color: {isCurrentRoomPaused ? '#7a5e4a' : '#555'};" />
					{#if true}
						{@const queueCount = (messageQueues[selectedConvId] ?? []).filter(m => !m.response).length}
						{@const hundreds = queueCount >= 100 ? String(Math.floor(queueCount / 100)) : ''}
						{@const tens = queueCount >= 10 ? String(Math.floor((queueCount % 100) / 10)) : ''}
						{@const ones = queueCount > 0 ? String(queueCount % 10) : ''}
						<span class="queue-digits"><span class="queue-digit" style="opacity: {hundreds ? 1 : 0.25};">{hundreds}</span><span class="queue-digit" style="opacity: {tens ? 1 : 0.25};">{tens}</span><span class="queue-digit" style="opacity: {ones ? 1 : 0.25};">{ones}</span></span>
					{/if}
				</button>
				<button class="control-btn" onclick={() => { if (isCurrentRoomPaused) { flushQueue(); if (selectedConvId?.startsWith("huddle-")) { stoppedHuddles.add(selectedConvId); stoppedHuddles = new Set(stoppedHuddles); localStorage.setItem('aether-stopped-huddles', JSON.stringify([...stoppedHuddles])); } else { pausedRoom = null; localStorage.removeItem('aether-paused-room'); } } else { if (selectedConvId?.startsWith("huddle-")) { stoppedHuddles.delete(selectedConvId); stoppedHuddles = new Set(stoppedHuddles); localStorage.setItem('aether-stopped-huddles', JSON.stringify([...stoppedHuddles])); } else { pausedRoom = selectedConvId; localStorage.setItem('aether-paused-room', selectedConvId); } } }} title={isCurrentRoomPaused ? "Resume live" : "Pause"}>
					{#if isCurrentRoomPaused}
						<LucidePlay width={14} height={14} style="color: #7a5e4a;" />
					{:else}
						<LucidePause width={14} height={14} style="color: #555;" />
					{/if}
				</button>
				<button class="control-btn" onclick={sendPauseMessage} disabled={pausing} title="Pause — alert room">
					<LucideX width={18} height={18} style="color: {pauseError ? '#e74c3c' : '#555'};" />
				</button>
				<span class="control-btn" title="Active account: {activeAccount === 'G' ? 'Gmail' : activeAccount === 'O' ? 'Oovar' : 'Unknown'}">
					<span style="font-family: var(--font-sans); font-size: 14px; color: #555;">{activeAccount}</span>
				</span>
				<button class="control-btn" onclick={() => focusMode = !focusMode} title={focusMode ? "Exit focus mode" : "Focus mode"}>
						{#if focusMode}
							<LucideMinimize2 width={14} height={14} style="color: #7a5e4a;" />
						{:else}
							<LucideMaximize2 width={14} height={14} style="color: #555;" />
						{/if}
					</button>
				<button class="control-btn" onclick={() => window.open('/wiki', '_blank')} title="Wiki">
					<LucideLibrary width={14} height={14} style="color: #555;" />
				</button>
				<button class="control-btn" onclick={() => window.open('/bavaria', '_blank')} title="Bavaria">
					<LucideImages width={14} height={14} style="color: #555;" />
				</button>
				<button class="control-btn" onclick={() => window.open('/markwhen-fork.html', '_blank')} title="Timeline">
					<LucideMilestone width={14} height={14} style="color: #555;" />
				</button>
				<button class="control-btn" onclick={() => window.open('http://192.168.0.186:51740', '_blank')} title="Workbench">
					<LucideConstruction width={14} height={14} style="color: #555;" />
				</button>
				<button class="control-btn" onclick={nukeAll} disabled={nuking} title="Nuke — close all teammates and huddles">
					<LucidePower width={14} height={14} style="color: {nuking ? '#7a5e4a' : '#555'};" />
				</button>
				</div>
			</div>
			<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
				<div style="padding-top: calc(0.5rem - 1px); text-align: left; align-self: start;">
					<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">boss</p>
				</div>
				<div style="padding-top: 0; padding-bottom: 1rem;">
					<form onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
						<div style="border: 1px dashed var(--color-bg-step4); border-left: 2px solid #5A3E2E;">
							<div style="padding: 0.5rem 1rem 0.5rem 1.5rem; background: var(--color-bg-element);">
								<textarea
									bind:value={newMessage}
									bind:this={inputRef}
									onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
									oninput={resizeInput}
									class="w-full bg-transparent outline-none resize-none"
									rows="1"
									placeholder=""
									style="color: var(--color-text); font-family: var(--font-mono); font-size: 12px; font-weight: 300; border: none; max-height: 200px; overflow: hidden;"
								></textarea>
								<div style="height: 29px; position: relative;"><span style="position: absolute; bottom: 4px; right: 4px; font-size: 8px; color: #444; font-family: var(--font-mono);">PM2</span></div>
							</div>
						</div>
					</form>
				</div>
			</div>
			</div>
			{/if}
		</div>
		<!-- Gap col 4 -->
		<div></div>
		<!-- Duplicate message feed (col 5 — 570px, read-only) -->
		<div bind:this={activityContainer} style="overflow-y: auto; background: var(--color-bg); visibility: {focusMode ? 'hidden' : 'visible'};">
			<div class="py-2" style="padding-top: 0.5rem;">
				<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
					{#each activityCards as msg}
						<div style="padding-top: {msg.toolCall ? 'calc(2rem - 1px + 0.75em)' : 'calc(2rem - 1px)'}; text-align: left; align-self: start;">
							<p style="margin: 0; font-family: var(--font-sans); color: var(--color-text-muted); font-size: 12px; line-height: 1.8;">{msg.sender}</p>
						</div>
						<div class="activity-row" style="padding-top: 2rem; position: relative;">
							<div style="border-left: {msg.sender === 'boss' ? '2px solid #5A3E2E' : '2px solid transparent'}; padding-left: 1.5rem;">
								{#if msg.toolCall}
									{@html renderToolCard(msg.content)}
								{:else}
									<div class="md-content">
										{@html renderMd(msg.content)}
									</div>
								{/if}
							</div>
							{#if msg.response}
							<button
								class="broadcast-btn"
								disabled={broadcastedMsgId === msg.id}
								title="Promote to chat"
								onclick={async () => {
									if (broadcastedMsgId === msg.id) return;
									try {
										await fetch('/api/broadcast', {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({ sender: msg.sender, room: selectedConvId, content: msg.content }),
										});
										broadcastedMsgId = msg.id;
									} catch {}
								}}
							><LucideRadio width={14} height={14} style="color: {broadcastedMsgId === msg.id ? '#7a5e4a' : '#555'};" /></button>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
		<!-- Gap col 6 -->
		<div></div>
	{:else}
		<div style="grid-column: 3 / 7; background: var(--color-bg);"></div>
	{/if}
</div>

<!-- Ruler toggle button -->
<button
	onclick={() => showRuler = !showRuler}
	style="position: fixed; bottom: 12px; right: 12px; z-index: 10000; width: 28px; height: 28px; border-radius: 4px; border: 1px dashed var(--color-bg-step4); background: var(--color-bg-panel); color: var(--color-text-muted); font-size: 14px; cursor: pointer; display: none; align-items: center; justify-content: center; opacity: 0.6;"
	title="Toggle ruler"
>📏</button>

<!-- Draggable ruler overlay -->
{#if showRuler}
<div
	onmousedown={onRulerMouseDown}
	style="position: fixed; left: {rulerX}px; top: {rulerY}px; z-index: 9999; cursor: {dragging ? 'grabbing' : 'grab'}; user-select: none;"
>
	<img src="/ruler.png" alt="ruler" style="height: 80px; pointer-events: none;" draggable="false" />
</div>
{/if}

<style>
.teammate-row:hover .dismiss-btn {
		opacity: 1 !important;
	}
	.sidebar-row:hover .sidebar-actions,
	.teammate-row:hover .sidebar-actions {
		opacity: 1 !important;
	}
	.sidebar-row:hover .sidebar-meta,
	.teammate-row:hover .sidebar-meta {
		opacity: 1 !important;
	}
	.sidebar-meta {
		opacity: 0;
		transition: opacity 0.15s;
	}
	.sidebar-actions {
		position: absolute;
		right: 0;
		top: 4px;
		height: 1.4em;
		opacity: 0.15;
		transition: opacity 0.15s;
		display: flex;
		align-items: center;
		gap: 12px;
		padding-right: 0.5rem;
	}
	.sidebar-action-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: #555;
		padding: 6px 2px;
		line-height: 1;
		display: flex;
		align-items: center;
	}
	.sidebar-action-btn:hover {
		color: var(--color-text);
	}
	.dismiss-btn {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		cursor: pointer;
		font-size: 14px;
		color: var(--color-text-muted);
		opacity: 0;
		transition: opacity 0.15s;
		padding: 2px 4px;
		line-height: 1;
	}
	.dismiss-btn:hover {
		color: var(--color-text);
	}
	.msg-actions {
		position: absolute;
		bottom: 4px;
		left: calc(1.5rem - 5px);
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.msg-actions .control-btn {
		opacity: 0.25;
	}
	.msg-actions .control-btn:hover {
		opacity: 1;
	}
	.msg-actions .bookmarked {
		opacity: 1;
	}
	.msg-actions .bookmarked :global(path) {
		fill: currentColor;
	}
	.activity-row:hover .broadcast-btn {
		opacity: 1 !important;
	}
	.broadcast-btn {
		position: absolute;
		top: calc(2rem - 6px);
		right: 0;
		background: #0b0d10;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 12px;
		color: var(--color-text-muted);
		opacity: 0;
		transition: opacity 0.15s;
		padding: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.bookmark-highlight {
		animation: bm-pulse 2s ease-out;
	}
	@keyframes bm-pulse {
		0% { background-color: rgba(90, 62, 46, 0.3); }
		100% { background-color: transparent; }
	}
	.control-strip {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 0 6px 1.5rem;
		background: var(--color-bg);
	}
	.control-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 11px;
		color: var(--color-text-muted);
		padding: 2px 4px;
		opacity: 0.6;
		transition: opacity 0.15s;
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.control-btn:hover {
		opacity: 1;
	}
	.queue-digits {
		display: inline-flex;
		gap: 2px;
		margin-left: 2px;
		align-items: center;
	}
	.queue-digit {
		display: inline-block;
		width: 10px;
		height: 12px;
		border: 1px solid #555;
		border-radius: 2px;
		font-size: 9px;
		font-family: var(--font-mono);
		color: #7a5e4a;
		text-align: center;
		line-height: 12px;
	}
	.control-led {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #666;
		transition: background 0.3s, box-shadow 0.3s;
	}
	.control-led.active {
		background: #4ade80;
		box-shadow: 0 0 6px #4ade80;
	}
	.control-led.pulsing {
		animation: led-pulse 1s ease-in-out infinite;
		box-shadow: none;
	}
	.control-led.cop-car {
		animation: cop-car 0.6s ease-in-out infinite;
		box-shadow: none;
	}
	@keyframes led-pulse {
		0%, 100% { background: #ff3333; }
		50% { background: #ffffff; }
	}
	@keyframes cop-car {
		0%, 100% { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
		50% { background: #3b82f6; box-shadow: 0 0 6px #3b82f6; }
	}
	.notification-pulse {
		animation: notification-pulse 1s ease-in-out infinite;
	}
	@keyframes notification-pulse {
		0%, 100% { color: #ff3333; }
		50% { color: #ffffff; }
	}
</style>
