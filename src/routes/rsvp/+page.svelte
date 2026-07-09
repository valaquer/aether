<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let { data } = $props();

	const MIN_SPEED = 1;
	const MAX_SPEED = 100;
	const SPEED_STEP = 5;
	const CONTEXT_LINES = 3;

	let speed = $state(50);
	let scrolling = $state(false);
	let currentLineIndex = $state(0);
	let finished = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	interface Line {
		text: string;
		sender: string;
		isSenderLabel: boolean;
	}

	interface Annotation {
		selectedText: string;
		comment: string;
	}

	let lines: Line[] = $state([]);
	let lastMessageId = '';
	let roomId = '';
	let measureContainer: HTMLDivElement | null = null;
	let annotations: Annotation[] = $state([]);
	let annotating = $state(false);
	let annotationSelection = $state('');
	let annotationComment = $state('');
	let annotationInput: HTMLInputElement | null = null;
	let wasScrollingBeforeAnnotation = false;

	function stripMarkdown(text: string): string {
		let s = text;
		s = s.replace(/```\w*\n?/g, '');
		s = s.replace(/`[^`]+`/g, (m) => m.slice(1, -1));
		s = s.replace(/\|[^\n]+\|/g, '');
		s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
		s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
		s = s.replace(/^#{1,6}\s+/gm, '');
		s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
		s = s.replace(/(\*|_)(.*?)\1/g, '$2');
		s = s.replace(/~~(.*?)~~/g, '$1');
		s = s.replace(/^[-*+]\s+/gm, '');
		s = s.replace(/^\d+\.\s+/gm, '');
		s = s.replace(/^>\s+/gm, '');
		s = s.replace(/^---+$/gm, '');
		s = s.replace(/[—–]/g, '--');
		s = s.replace(/\n{2,}/g, '\n');
		return s.trim();
	}

	function measureLines(text: string): string[] {
		if (!measureContainer) return [text];
		measureContainer.textContent = '';
		const words = text.split(/\s+/).filter(Boolean);
		if (words.length === 0) return [];

		const result: string[] = [];
		let currentLine = '';

		for (const word of words) {
			const testLine = currentLine ? currentLine + ' ' + word : word;
			measureContainer.textContent = testLine;
			const width = measureContainer.scrollWidth;
			const maxWidth = measureContainer.clientWidth;

			if (width > maxWidth && currentLine) {
				result.push(currentLine);
				currentLine = word;
			} else {
				currentLine = testLine;
			}
		}
		if (currentLine) result.push(currentLine);
		measureContainer.textContent = '';
		return result;
	}

	function buildLines(messages: { sender: string; content: string }[]): Line[] {
		const result: Line[] = [];

		for (const msg of messages) {
			const stripped = stripMarkdown(msg.content);
			if (!stripped) continue;

			result.push({
				text: msg.sender.charAt(0).toUpperCase() + msg.sender.slice(1),
				sender: msg.sender,
				isSenderLabel: true,
			});

			const paragraphs = stripped.split(/\n/).filter(Boolean);
			for (const para of paragraphs) {
				const visualLines = measureLines(para);
				for (const vl of visualLines) {
					result.push({
						text: vl,
						sender: msg.sender,
						isSenderLabel: false,
					});
				}
			}
		}

		return result;
	}

	function buildPasteLines(text: string): Line[] {
		const stripped = stripMarkdown(text);
		if (!stripped) return [];
		const result: Line[] = [];
		const paragraphs = stripped.split(/\n/).filter(Boolean);
		for (const para of paragraphs) {
			const visualLines = measureLines(para);
			for (const vl of visualLines) {
				result.push({ text: vl, sender: '', isSenderLabel: false });
			}
		}
		return result;
	}

	function getLineDelay(): number {
		return 3000 * Math.pow(0.96, speed - 50);
	}

	async function checkForNewMessages(): Promise<boolean> {
		if (!roomId || !lastMessageId) return false;
		try {
			const res = await fetch(`/api/rsvp-check?roomId=${encodeURIComponent(roomId)}&after=${encodeURIComponent(lastMessageId)}`);
			if (!res.ok) return false;
			const data = await res.json();
			if (data.messages && data.messages.length > 0) {
				const newLines = buildLines(data.messages);
				lines = [...lines, ...newLines];
				lastMessageId = data.messages[data.messages.length - 1].id;
				return true;
			}
		} catch {}
		return false;
	}

	async function advance() {
		if (!scrolling) return;
		if (currentLineIndex >= lines.length - 1) {
			const found = await checkForNewMessages();
			if (found) {
				advance();
				return;
			}
			finished = true;
			scrolling = false;
			await postAnnotations();
			setTimeout(() => { try { window.close(); } catch {} }, 3000);
			return;
		}

		currentLineIndex++;
		timer = setTimeout(advance, getLineDelay());
	}

	function goToLine(idx: number) {
		if (timer) clearTimeout(timer);
		currentLineIndex = Math.max(0, Math.min(idx, lines.length - 1));
		finished = false;
		if (scrolling) {
			timer = setTimeout(advance, getLineDelay());
		}
	}

	function jumpToPrevSpeaker() {
		let idx = currentLineIndex - 1;
		while (idx > 0 && !lines[idx].isSenderLabel) idx--;
		goToLine(Math.max(0, idx));
	}

	function jumpToNextSpeaker() {
		let idx = currentLineIndex + 1;
		while (idx < lines.length && !lines[idx].isSenderLabel) idx++;
		if (idx < lines.length) goToLine(idx);
	}

	function handleSelection() {
		if (annotating || finished) return;
		const sel = window.getSelection();
		const text = sel?.toString().trim();
		if (!text) return;
		wasScrollingBeforeAnnotation = scrolling;
		if (scrolling) {
			scrolling = false;
			if (timer) clearTimeout(timer);
		}
		annotationSelection = text;
		annotationComment = '';
		annotating = true;
		sel?.removeAllRanges();
		setTimeout(() => annotationInput?.focus(), 50);
	}

	function submitAnnotation() {
		if (annotationComment.trim()) {
			annotations.push({ selectedText: annotationSelection, comment: annotationComment.trim() });
		}
		annotating = false;
		annotationSelection = '';
		annotationComment = '';
		scrolling = true;
		timer = setTimeout(advance, getLineDelay());
	}

	function cancelAnnotation() {
		annotating = false;
		annotationSelection = '';
		annotationComment = '';
		scrolling = true;
		timer = setTimeout(advance, getLineDelay());
	}

	async function postAnnotations() {
		if (annotations.length === 0 || !roomId) return;
		const annotationBody = "Boss's feedback:\n" + annotations.map(a => `on '${a.selectedText}': ${a.comment}`).join('\n');
		try {
			await fetch('/api/message', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sender: 'boss', room: roomId, body: annotationBody }),
			});
		} catch {}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.code === 'Space') {
			e.preventDefault();
			scrolling = !scrolling;
			if (scrolling && !finished) {
				timer = setTimeout(advance, getLineDelay());
			} else if (!scrolling && timer) {
				clearTimeout(timer);
			}
		} else if (e.code === 'ArrowUp' && e.ctrlKey) {
			e.preventDefault();
			jumpToPrevSpeaker();
		} else if (e.code === 'ArrowDown' && e.ctrlKey) {
			e.preventDefault();
			jumpToNextSpeaker();
		} else if (e.code === 'ArrowUp') {
			e.preventDefault();
			if (currentLineIndex > 0) goToLine(currentLineIndex - 1);
		} else if (e.code === 'ArrowDown') {
			e.preventDefault();
			if (currentLineIndex < lines.length - 1) goToLine(currentLineIndex + 1);
		} else if (e.code === 'ArrowLeft') {
			e.preventDefault();
			speed = Math.max(MIN_SPEED, speed - SPEED_STEP);
		} else if (e.code === 'ArrowRight') {
			e.preventDefault();
			speed = Math.min(MAX_SPEED, speed + SPEED_STEP);
		} else if (e.code === 'Escape') {
			e.preventDefault();
			try { window.close(); } catch {}
		}
	}

	onMount(() => {
		if (data.pasteMode) {
			const pasteText = localStorage.getItem('rsvp-paste-text');
			localStorage.removeItem('rsvp-paste-text');
			if (!pasteText?.trim()) {
				finished = true;
				return;
			}
			lines = buildPasteLines(pasteText);
			if (lines.length === 0) {
				finished = true;
				return;
			}
			document.addEventListener('keydown', handleKeydown);
			scrolling = true;
			timer = setTimeout(advance, getLineDelay());
			return;
		}

		if (data.error || data.messages.length === 0) {
			finished = true;
			return;
		}

		roomId = data.roomId || '';
		lastMessageId = data.messages[data.messages.length - 1]?.id || '';
		lines = buildLines(data.messages);

		if (lines.length === 0) {
			finished = true;
			return;
		}

		document.addEventListener('keydown', handleKeydown);
		scrolling = true;
		timer = setTimeout(advance, getLineDelay());
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		if (typeof document !== 'undefined') {
			document.removeEventListener('keydown', handleKeydown);
		}
	});

	let progress = $derived(lines.length > 0 ? (currentLineIndex + 1) / lines.length : 0);

	function lineFontSize(idx: number): number {
		return 16;
	}

	function lineColor(idx: number): string {
		const dist = Math.abs(idx - currentLineIndex);
		if (dist === 0) return '#7a5e4a';
		return 'transparent';
	}

	function lineOpacity(idx: number): number {
		const dist = Math.abs(idx - currentLineIndex);
		if (dist === 0) return 1;
		return 0;
	}

	function lineTopOffset(idx: number): number {
		const lineHeight = 1.4;
		const gap = 16;
		if (idx === currentLineIndex) return 0;

		const dir = idx > currentLineIndex ? 1 : -1;
		let offset = 0;
		let i = currentLineIndex;
		while (i !== idx) {
			const thisH = lineFontSize(i) * lineHeight;
			const nextI = i + dir;
			const nextH = lineFontSize(nextI) * lineHeight;
			offset += dir * ((thisH / 2) + gap + (nextH / 2));
			i = nextI;
		}
		return offset;
	}

	let visibleRange = $derived({
		start: Math.max(0, currentLineIndex - CONTEXT_LINES),
		end: Math.min(lines.length - 1, currentLineIndex + CONTEXT_LINES),
	});
</script>

<svelte:head>
	<title>Speed Reader</title>
</svelte:head>

<!-- Hidden container for measuring line widths at largest display size -->
<div
	bind:this={measureContainer}
	class="measure-container"
></div>

<div class="teleprompter-container">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="current-line" style="top: 40vh;" onmouseup={handleSelection}>
		{#if finished}
			<span class="end-display">end</span>
		{:else if lines[currentLineIndex]}
			{lines[currentLineIndex].text}
		{/if}
	</div>

	{#if annotating}
		<div class="annotation-box" style="top: calc(40vh + 40px);">
			<div class="annotation-label">on '{annotationSelection}':</div>
			<input
				bind:this={annotationInput}
				bind:value={annotationComment}
				class="annotation-input"
				placeholder="Your comment..."
				onkeydown={(e) => {
					if (e.code === 'Enter') { e.preventDefault(); submitAnnotation(); }
					else if (e.code === 'Escape') { e.preventDefault(); cancelAnnotation(); }
					e.stopPropagation();
				}}
			/>
		</div>
	{/if}

	<div class="speed-display">
		{scrolling ? `speed: ${speed}` : 'PAUSED'}
	</div>

	<div class="progress-bar">
		<div class="progress-fill" style="width: {progress * 100}%"></div>
	</div>

	<div class="help">
		<span>Space: scroll</span>
		<span>↑↓: line</span>
		<span>Ctrl+↑↓: speaker</span>
		<span>←→: speed</span>
		<span>Esc: close</span>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #0e1114;
		overflow: hidden;
	}

	.measure-container {
		position: absolute;
		top: -9999px;
		left: 0;
		width: 450px;
		font-family: 'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
		font-size: 16px;
		white-space: nowrap;
		visibility: hidden;
		pointer-events: none;
	}

	.teleprompter-container {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #0e1114;
		position: relative;
		user-select: none;
	}

	.current-line {
		user-select: text;
		position: absolute;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 450px;
		font-family: 'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
		font-size: 16px;
		line-height: 1.8;
		color: #CDCCC2;
		text-align: center;
	}

	.end-display {
		color: #333;
		font-style: italic;
	}

	.speed-display {
		position: fixed;
		bottom: 40px;
		right: 40px;
		font-family: 'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
		font-style: italic;
		font-size: 28px;
		color: #333;
	}

	.progress-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		width: 100%;
		height: 3px;
		background: #1a1c20;
	}

	.progress-fill {
		height: 100%;
		background: #7a5e4a;
		transition: width 0.1s linear;
	}

	.annotation-box {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		width: 450px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.annotation-label {
		font-family: 'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
		font-size: 11px;
		color: #808080;
	}

	.annotation-input {
		font-family: 'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
		font-size: 12px;
		color: #CDCCC2;
		background: #0b0d10;
		border: 1px dashed #282a30;
		padding: 8px 12px;
		outline: none;
	}

	.annotation-input::placeholder {
		color: #444;
	}

	.help {
		position: fixed;
		bottom: 12px;
		display: flex;
		gap: 24px;
		font-family: 'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', ui-monospace, monospace;
		font-size: 12px;
		color: #222;
	}
</style>
