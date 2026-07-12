<script lang="ts">
	import SpeedReader from '$lib/SpeedReader.svelte';
	import { onMount } from 'svelte';

	let { data } = $props();

	let ready = $state(false);

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
		ready = true;
	});
</script>

{#if ready}
	{#if data.sessionId}
		<SpeedReader
			sessionId={data.sessionId}
			roomId="direct-jeh"
			onPostAnnotations={handlePostAnnotations}
		/>
	{:else if data.messages && data.messages.length > 0}
		<SpeedReader
			messages={data.messages}
			roomId={data.roomId || ''}
			onPostAnnotations={handlePostAnnotations}
		/>
	{:else}
		<SpeedReader
			sessionId=""
			roomId="direct-jeh"
			onPostAnnotations={handlePostAnnotations}
		/>
	{/if}
{/if}
