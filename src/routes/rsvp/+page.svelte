<script lang="ts">
	import SpeedReader from '$lib/SpeedReader.svelte';
	import { onMount } from 'svelte';

	let { data } = $props();

	let pasteText = $state('');
	let ready = $state(false);

	async function handleCheckNewMessages(roomId: string, afterId: string) {
		try {
			const res = await fetch(`/api/rsvp-check?roomId=${encodeURIComponent(roomId)}&after=${encodeURIComponent(afterId)}`);
			if (!res.ok) return null;
			const result = await res.json();
			if (result.messages && result.messages.length > 0) {
				return { messages: result.messages, lastId: result.messages[result.messages.length - 1].id };
			}
		} catch {}
		return null;
	}

	async function handlePostAnnotations(roomId: string, body: string) {
		try {
			await fetch('/api/message', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sender: 'boss', room: roomId, body }),
			});
		} catch {}
	}

	onMount(() => {
		if (data.pasteMode) {
			const stored = localStorage.getItem('rsvp-paste-text');
			localStorage.removeItem('rsvp-paste-text');
			pasteText = stored || '';
		}
		ready = true;
	});
</script>

{#if ready}
	{#if data.sessionId}
		<SpeedReader sessionId={data.sessionId} />
	{:else if data.pasteMode}
		<SpeedReader pasteText={pasteText} />
	{:else}
		<SpeedReader
			messages={data.messages || []}
			roomId={data.roomId || ''}
			onCheckNewMessages={handleCheckNewMessages}
			onPostAnnotations={handlePostAnnotations}
		/>
	{/if}
{/if}
