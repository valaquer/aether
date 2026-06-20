<script lang="ts">
	let { data } = $props();
	let folders: string[] = $derived(data.folders ?? []);
	let folderData: Record<string, string[]> = $derived(data.folderData ?? {});
	let selectedFolder = $state('');

	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			const saved = localStorage.getItem('bavaria-selected-folder');
			const validFolders = sidebarEntries.map(e => e.folder);
			if (saved && validFolders.includes(saved)) {
				selectedFolder = saved;
			} else if (sidebarEntries.length > 0 && !selectedFolder) {
				selectedFolder = sidebarEntries[0].folder;
			}
		} else if (sidebarEntries.length > 0 && !selectedFolder) {
			selectedFolder = sidebarEntries[0].folder;
		}
	});

	$effect(() => {
		if (typeof localStorage !== 'undefined' && selectedFolder) {
			localStorage.setItem('bavaria-selected-folder', selectedFolder);
		}
	});

	const sidebarEntries = [
		{ label: 'masters', folder: '1-original-approved-masters' },
		{ label: 'masters + IP watermark', folder: '2-masters-ip-watermark' },
	];

	let ids = $derived.by(() => {
		const folderIds = selectedFolder ? (folderData[selectedFolder] ?? []) : [];
		return folderIds.filter(id => {
			if (filterVote === 'accepted') return votes[id] === 'approved';
			if (filterVote === 'pending') return !votes[id] || votes[id] !== 'approved';
			return true;
		}).sort((a, b) => a.localeCompare(b));
	});

	let lightboxId: string | null = $state(null);
	let zoom: { x: number; y: number } | null = $state(null);

	let votes: Record<string, string> = $state({});
	let filterVote = $state('pending');

	async function castVote(id: string, vote: 'approved' | 'rejected') {
		if (votes[id] === vote) {
			delete votes[id];
			votes = { ...votes };
			await fetch('/api/bavaria-vote', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
		} else {
			votes[id] = vote;
			votes = { ...votes };
			await fetch('/api/bavaria-vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, vote }) });
		}
	}

	function onLightboxClick(e: MouseEvent) {
		if (zoom) { zoom = null; return; }
		const img = e.currentTarget as HTMLElement;
		const rect = img.getBoundingClientRect();
		zoom = {
			x: ((e.clientX - rect.left) / rect.width) * 100,
			y: ((e.clientY - rect.top) / rect.height) * 100
		};
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (zoom) zoom = null;
			else if (lightboxId) { lightboxId = null; zoom = null; }
		} else if (lightboxId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
			const currentIdx = ids.indexOf(lightboxId);
			if (currentIdx === -1) return;
			zoom = null;
			if (e.key === 'ArrowLeft' && currentIdx > 0) lightboxId = ids[currentIdx - 1];
			else if (e.key === 'ArrowRight' && currentIdx < ids.length - 1) lightboxId = ids[currentIdx + 1];
		}
	}
</script>

<svelte:head>
	<title>Bavaria – Aether</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#snippet voteButtons(id: string, size: 'sm' | 'lg')}
	{@const w = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'}
	{@const iconCheck = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'}
	{@const iconX = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'}
	<button
		class="{w} rounded-full flex items-center justify-center transition-all
		       {votes[id] === 'approved' ? 'bg-green-500 text-white' : 'bg-black/50 text-[#808080] hover:bg-green-500/40 hover:text-white'}"
		onclick={(e) => { e.stopPropagation(); castVote(id, 'approved'); }}
		title="Approve"
	>
		<svg class="{iconCheck}" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
	</button>
	<button
		class="{w} rounded-full flex items-center justify-center transition-all
		       {votes[id] === 'rejected' ? 'bg-red-500 text-white' : 'bg-black/50 text-[#808080] hover:bg-red-500/40 hover:text-white'}"
		onclick={(e) => { e.stopPropagation(); castVote(id, 'rejected'); }}
		title="Reject"
	>
		<svg class="{iconX}" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
	</button>
{/snippet}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bavaria-root">
	<!-- Column header — full width -->
	<div class="bavaria-column-header">
		<div class="bavaria-column-header-sidebar">
			<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Bavaria</p>
		</div>
		<div class="bavaria-column-header-main">
			<div style="display: flex; align-items: center; height: 100%; padding-left: 1.5rem;">
				{#each [{v: 'pending', l: 'Pending'}, {v: 'accepted', l: 'Accepted'}] as item, i}
					<button
						style="font-family: var(--font-mono); font-size: 12px; padding: 0 0.75rem; border: 1px dashed var(--color-bg-step4); {i > 0 ? 'border-left: none;' : ''} background: {filterVote === item.v ? 'var(--color-bg-element)' : 'transparent'}; color: {filterVote === item.v ? 'var(--color-text)' : 'var(--color-text-muted)'}; cursor: pointer; height: 24px; line-height: 24px;"
						onclick={() => filterVote = item.v}
					>
						{item.l}
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Body: sidebar + content -->
	<div class="bavaria-body">
		<!-- Sidebar -->
		<nav class="bavaria-sidebar">
			{#each sidebarEntries as entry, i}
				{@const count = (folderData[entry.folder] ?? []).length}
				<button
					class="bavaria-nav-item"
					class:active={selectedFolder === entry.folder}
					style="background: {selectedFolder === entry.folder ? 'rgba(122, 94, 74, 0.15)' : (i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent')};"
					onclick={() => selectedFolder = entry.folder}
				>
					{entry.label}
					{#if count > 0}
						<span style="font-size: 9px; color: #666; margin-left: 6px;">{count}</span>
					{/if}
				</button>
			{/each}
		</nav>

		<!-- Main content -->
		<main class="bavaria-content">
			{#if ids.length > 0}
				<div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 12px;">
					{#each ids as id}
						<div
							style="height: 284px; cursor: pointer; overflow: hidden; border-radius: 0.5rem; position: relative; border: 1px solid rgba(255,255,255,0.15);"
							onclick={() => lightboxId = id}
							role="listitem"
						>
							<img
								src="/api/bavaria-img/{id}"
								alt={id}
								style="height: 100%; width: auto; object-fit: contain;"
								loading="lazy"
							/>
							<div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 3px 8px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6);">
								<span style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.05em; color: #7a5e4a; font-weight: 500;">{id}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- Lightbox -->
{#if lightboxId}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
		onclick={() => lightboxId = null}
		role="dialog"
	>
		<div class="relative overflow-hidden" onclick={(e) => e.stopPropagation()}>
			<img
				src="/api/bavaria-img/{lightboxId}"
				alt={lightboxId}
				class="max-h-[90vh] max-w-[90vw] object-contain transition-transform duration-200 {zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}"
				style={zoom ? `transform: scale(3); transform-origin: ${zoom.x}% ${zoom.y}%` : ''}
				onclick={onLightboxClick}
			/>
			{#if !zoom}
				<div class="absolute bottom-2 right-2 flex gap-1">
					{@render voteButtons(lightboxId, 'lg')}
				</div>
			{/if}
		</div>
		<span class="absolute bottom-6" style="font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.05em; color: rgba(205,204,194,0.7);">
			{lightboxId}
		</span>
	</div>
{/if}

<style>
	.bavaria-root {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
	}

	.bavaria-column-header {
		display: flex;
		border-top: 1px dashed var(--color-bg-step4);
		border-bottom: 1px dashed var(--color-bg-step4);
		flex-shrink: 0;
	}

	.bavaria-column-header-sidebar {
		width: 280px;
		flex-shrink: 0;
		padding: 1rem 1rem 1rem 1.5rem;
		background: var(--color-bg-panel);
		border-right: 1px dashed var(--color-bg-step4);
	}

	.bavaria-column-header-main {
		flex: 1;
		background: var(--color-bg);
	}

	.bavaria-body {
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.bavaria-sidebar {
		width: 280px;
		flex-shrink: 0;
		background: var(--color-bg-panel);
		border-right: 1px dashed var(--color-bg-step4);
		overflow-y: auto;
		font-family: var(--font-sans);
	}

	.bavaria-nav-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		font: inherit;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0 1rem 0 1.5rem;
		transition: color 0.15s;
	}

	.bavaria-nav-item:hover {
		color: var(--color-text);
	}

	.bavaria-nav-item.active {
		color: var(--color-text);
		border-left: 2px solid #7a5e4a;
	}

	.bavaria-content {
		flex: 1;
		overflow-y: auto;
	}
</style>
