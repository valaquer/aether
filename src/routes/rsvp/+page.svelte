<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let { data } = $props();

	const MIN_WPM = 100;
	const MAX_WPM = 200;
	const LONG_TOKEN_THRESHOLD = 15;

	let wpm = $state(150);
	let paused = $state(false);
	let currentWord = $state('');
	let anchorIndex = $state(0);
	let showingSender = $state(false);
	let wordIndex = $state(0);
	let finished = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	interface Token {
		text: string;
		sender: string;
		isSenderLabel: boolean;
	}

	function stripMarkdown(text: string): string {
		let s = text;
		s = s.replace(/```[\s\S]*?```/g, '');
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
		s = s.replace(/\n{2,}/g, '\n');
		return s.trim();
	}

	function tokenize(messages: { sender: string; content: string }[]): Token[] {
		const tokens: Token[] = [];
		let lastSender = '';

		for (const msg of messages) {
			const plain = stripMarkdown(msg.content);
			if (!plain) continue;

			tokens.push({ text: msg.sender.charAt(0).toUpperCase() + msg.sender.slice(1), sender: msg.sender, isSenderLabel: true });

			const words = plain.split(/\s+/).filter(Boolean);
			for (const word of words) {
				tokens.push({ text: word, sender: msg.sender, isSenderLabel: false });
			}
		}

		return tokens;
	}

	function getAnchorIndex(word: string): number {
		const len = word.length;
		if (len <= 1) return 0;
		if (len <= 3) return 1;
		if (len <= 5) return 2;
		if (len <= 9) return 3;
		if (len <= 13) return 4;
		return 5;
	}

	function getDelay(token: Token): number {
		const baseDelay = 60000 / wpm;

		if (token.isSenderLabel) return 1000;

		let multiplier = 1;
		const text = token.text;
		const lastChar = text[text.length - 1];

		if (lastChar === '.' || lastChar === '?' || lastChar === '!') {
			multiplier = 2;
		} else if (lastChar === ',' || lastChar === ':' || lastChar === ';') {
			multiplier = 1.5;
		}

		if (text.length > LONG_TOKEN_THRESHOLD) {
			multiplier = Math.max(multiplier, 1 + (text.length - LONG_TOKEN_THRESHOLD) * 0.1);
		}

		return baseDelay * multiplier;
	}

	let tokens: Token[] = [];

	function playNext() {
		if (paused) return;
		if (wordIndex >= tokens.length) {
			finished = true;
			currentWord = 'end';
			anchorIndex = 0;
			showingSender = false;
			timer = setTimeout(() => {
				try { window.close(); } catch {}
			}, 3000);
			return;
		}

		const token = tokens[wordIndex];
		currentWord = token.text;
		showingSender = token.isSenderLabel;
		anchorIndex = token.isSenderLabel ? 0 : getAnchorIndex(token.text);
		wordIndex++;

		timer = setTimeout(playNext, getDelay(token));
	}

	function jumpToIndex(idx: number) {
		if (timer) clearTimeout(timer);
		wordIndex = idx;
		finished = false;
		const token = tokens[wordIndex];
		if (token) {
			currentWord = token.text;
			showingSender = token.isSenderLabel;
			anchorIndex = token.isSenderLabel ? 0 : getAnchorIndex(token.text);
			wordIndex++;
		}
		if (!paused) {
			timer = setTimeout(playNext, getDelay(token));
		}
	}

	function jumpToPrevSpeaker() {
		let idx = Math.max(0, wordIndex - 2);
		if (tokens[idx]?.isSenderLabel) idx--;
		while (idx > 0 && !tokens[idx].isSenderLabel) {
			idx--;
		}
		if (tokens[idx]?.isSenderLabel) {
			jumpToIndex(idx);
		} else {
			jumpToIndex(0);
		}
	}

	function jumpToNextSpeaker() {
		let idx = wordIndex;
		while (idx < tokens.length && !tokens[idx].isSenderLabel) {
			idx++;
		}
		if (idx < tokens.length) {
			jumpToIndex(idx);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.code === 'Space') {
			e.preventDefault();
			paused = !paused;
			if (!paused && !finished) playNext();
		} else if (e.code === 'ArrowLeft' && e.ctrlKey) {
			e.preventDefault();
			jumpToPrevSpeaker();
		} else if (e.code === 'ArrowRight' && e.ctrlKey) {
			e.preventDefault();
			jumpToNextSpeaker();
		} else if (e.code === 'ArrowLeft') {
			e.preventDefault();
			wpm = Math.max(MIN_WPM, wpm - 25);
		} else if (e.code === 'ArrowRight') {
			e.preventDefault();
			wpm = Math.min(MAX_WPM, wpm + 25);
		} else if (e.code === 'Escape') {
			e.preventDefault();
			try { window.close(); } catch {}
		}
	}

	function tokenizePasteText(text: string): Token[] {
		const plain = stripMarkdown(text);
		if (!plain) return [];
		const words = plain.split(/\s+/).filter(Boolean);
		return words.map(w => ({ text: w, sender: '', isSenderLabel: false }));
	}

	onMount(() => {
		if (data.pasteMode) {
			const pasteText = localStorage.getItem('rsvp-paste-text');
			localStorage.removeItem('rsvp-paste-text');
			if (!pasteText?.trim()) {
				currentWord = 'No text to read';
				finished = true;
				return;
			}
			tokens = tokenizePasteText(pasteText);
			if (tokens.length === 0) {
				currentWord = 'No readable content';
				finished = true;
				return;
			}
			document.addEventListener('keydown', handleKeydown);
			playNext();
			return;
		}

		if (data.error || data.messages.length === 0) {
			currentWord = data.error || 'No messages';
			finished = true;
			return;
		}

		tokens = tokenize(data.messages);

		if (tokens.length === 0) {
			currentWord = 'No readable content';
			finished = true;
			return;
		}

		document.addEventListener('keydown', handleKeydown);
		playNext();
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		if (typeof document !== 'undefined') {
			document.removeEventListener('keydown', handleKeydown);
		}
	});

	let wordProgress = $derived(tokens.length > 0 ? Math.min(wordIndex / tokens.length, 1) : 0);
	let wordCount = $derived(tokens.filter(t => !t.isSenderLabel).length);
	let currentWordIndex = $derived(tokens.slice(0, wordIndex).filter(t => !t.isSenderLabel).length);

	let beforeAnchor = $derived(showingSender ? '' : currentWord.slice(0, anchorIndex));
	let anchorChar = $derived(showingSender ? '' : currentWord[anchorIndex] || '');
	let afterAnchor = $derived(showingSender ? '' : currentWord.slice(anchorIndex + 1));
</script>

<svelte:head>
	<title>RSVP</title>
</svelte:head>

<div class="rsvp-container">
	<!-- Anchor guides -->
	<div class="guide-top"></div>
	<div class="guide-bottom"></div>

	{#if showingSender}
		<div class="sender-display">
			<span class="sender-label">{currentWord}</span>
		</div>
	{:else}
		<div class="word-display">
			<span class="word-before">{beforeAnchor}</span><span class="word-anchor">{anchorChar}</span><span class="word-after">{afterAnchor}</span>
		</div>
	{/if}

	<div class="wpm-display">
		{wpm} wpm
	</div>


	<div class="progress-bar">
		<div class="progress-fill" style="width: {wordProgress * 100}%"></div>
	</div>

	<div class="help">
		<span>Space: pause</span>
		<span>Arrows: speed</span>
		<span>Esc: close</span>
	</div>
</div>

<style>
	@font-face {
		font-family: 'Playfair Display';
		src: url('/fonts/PlayfairDisplay.ttf') format('truetype');
		font-weight: 100 900;
		font-style: normal;
		font-display: block;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		background: #0b0d10;
		overflow: hidden;
	}

	.rsvp-container {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #0b0d10;
		position: relative;
		user-select: none;
	}

	.guide-top {
		position: fixed;
		top: calc(42% - 130px);
		left: 50%;
		transform: translateX(-50%);
		width: 3px;
		height: 30px;
		background: #7a5e4a;
		border-radius: 2px;
		pointer-events: none;
	}

	.guide-bottom {
		position: fixed;
		top: calc(42% + 110px);
		left: 50%;
		transform: translateX(-50%);
		width: 3px;
		height: 30px;
		background: #7a5e4a;
		border-radius: 2px;
		pointer-events: none;
	}

	.word-display {
		position: fixed;
		top: 42%;
		left: 0;
		right: 0;
		transform: translateY(-50%);
		display: flex;
		align-items: baseline;
		white-space: nowrap;
		font-family: Baskerville, 'Baskerville Old Face', Georgia, serif;
		font-size: 120px;
		line-height: 1;
	}

	.word-before {
		color: #e8e6e3;
		flex: 1;
		text-align: right;
	}

	.word-anchor {
		color: #c0392b;
		flex-shrink: 0;
	}

	.word-after {
		color: #e8e6e3;
		flex: 1;
		text-align: left;
	}

	.sender-display {
		position: fixed;
		top: 42%;
		left: 50%;
		transform: translate(-50%, -50%);
	}

	.sender-label {
		font-family: Baskerville, 'Baskerville Old Face', Georgia, serif;
		font-size: 40px;
		color: #7a5e4a;
		white-space: nowrap;
	}

	.wpm-display {
		position: fixed;
		bottom: 40px;
		right: 40px;
		font-family: Baskerville, 'Baskerville Old Face', Georgia, serif;
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

	.help {
		position: fixed;
		bottom: 12px;
		display: flex;
		gap: 24px;
		font-family: Baskerville, 'Baskerville Old Face', Georgia, serif;
		font-size: 12px;
		color: #222;
	}
</style>
