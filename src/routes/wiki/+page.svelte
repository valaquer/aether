<script lang="ts">
	import { marked } from 'marked';

	marked.setOptions({ breaks: true, gfm: true });

	let { data } = $props();
	let pages = $derived(data.pages);
	let navigation = $derived(data.navigation);
	let validPages = $derived(new Set(data.validPages));

	let selectedPage = $state('Home');

	function selectPage(slug: string) {
		selectedPage = slug;
		const pane = document.querySelector('.wiki-reading-pane');
		if (pane) pane.scrollTop = 0;
	}

	function renderMarkdown(content: string): string {
		const processed = content.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
			if (validPages.has(name)) {
				return `<a class="wikilink" data-page="${name}" href="#">${name}</a>`;
			}
			return name;
		});
		return marked.parse(processed, { async: false }) as string;
	}

	function handleClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.classList.contains('wikilink')) {
			e.preventDefault();
			const page = target.getAttribute('data-page');
			if (page && validPages.has(page)) {
				selectPage(page);
			}
		}
	}

	let currentPage = $derived(pages[selectedPage]);
	let renderedContent = $derived(currentPage ? renderMarkdown(currentPage.content) : '');
</script>

<svelte:head>
	<title>Wiki – Facade</title>
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="wiki-root" onclick={handleClick}>
	<!-- Sidebar -->
	<nav class="wiki-sidebar">
		<div class="wiki-section-header">
			<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Our Wiki</p>
		</div>

		<button
			class="wiki-nav-item wiki-nav-home"
			class:active={selectedPage === 'Home'}
			onclick={() => selectPage('Home')}
		>
			Home
		</button>

		{#each navigation as hub}
			<div class="wiki-section-header">
				<p style="display: inline-block; font-size: 13px; font-weight: 500; font-family: var(--font-sans); background: var(--gradient-accent); background-repeat: no-repeat; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">{hub.title}</p>
			</div>

			{#each hub.children as child}
				<button
					class="wiki-nav-item wiki-nav-child"
					class:active={selectedPage === child.slug}
					onclick={() => selectPage(child.slug)}
				>
					{child.title}
				</button>
			{/each}
		{/each}
	</nav>

	<!-- Gap -->
	<div></div>

	<!-- Reading Pane -->
	<main class="wiki-reading-pane">
		<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
			<div></div>
			<div>
				{#if currentPage}
					{#if currentPage.frontmatter['last-verified'] || currentPage.frontmatter.tags}
						<div class="wiki-meta-bar">
							{#if currentPage.frontmatter['last-verified']}
								<span class="wiki-meta-tag">Verified: {currentPage.frontmatter['last-verified']}</span>
							{/if}
							{#if currentPage.frontmatter.tags}
								<span class="wiki-meta-tag">{currentPage.frontmatter.tags}</span>
							{/if}
						</div>
					{/if}
					<article class="md-content" style="padding-left: 1.5rem; border-left: 2px solid transparent;">
						{@html renderedContent}
					</article>
				{/if}
				<div class="wiki-cache-code">Cache Code: W2G</div>
			</div>
		</div>
	</main>
</div>

<style>
	.wiki-root {
		display: grid;
		grid-template-columns: 280px calc(50vw - 565px) 570px;
		height: 100vh;
		background: var(--color-bg);
		color: var(--color-text);
	}

	/* Sidebar */
	.wiki-sidebar {
		background: var(--color-bg-panel);
		border-right: 1px dashed var(--color-bg-step4);
		padding: 1rem 0;
		overflow-y: auto;
		height: 100vh;
		font-family: var(--font-sans);
	}

	.wiki-section-header {
		padding: 1rem 1rem 1rem 1.5rem;
		border-bottom: 1px dashed var(--color-bg-step4);
	}

	.wiki-nav-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		font: inherit;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 0 1rem 0 1.5rem;
		text-transform: lowercase;
		transition: color 0.15s;
	}

	.wiki-nav-item:hover {
		color: var(--color-text);
	}

	.wiki-nav-item.active {
		color: var(--color-text);
		background: rgba(122, 94, 74, 0.15);
		border-left: 2px solid #7a5e4a;
	}

	.wiki-nav-home {
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	.wiki-nav-child {
		padding-left: 2.5rem;
	}

	.wiki-hub-group {
		margin-bottom: 4px;
	}

	/* Reading Pane */
	.wiki-reading-pane {
		padding: 2rem 0 2rem 0;
		overflow-y: auto;
		height: 100vh;
	}

	.wiki-meta-bar {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px dashed var(--color-bg-step4);
	}

	.wiki-meta-tag {
		font-size: 11px;
		color: #777;
		font-family: var(--font-mono);
	}

	.wiki-cache-code {
		margin-top: 3rem;
		font-size: 10px;
		color: #333;
		font-family: var(--font-mono);
	}

	/* Wikilink styling — matches Facade link colors */
	.wiki-reading-pane :global(.wikilink) {
		color: #7a5e4a;
		text-decoration: none;
		cursor: pointer;
	}

	.wiki-reading-pane :global(.wikilink:hover) {
		color: #a8836a;
		text-decoration: underline;
	}
</style>
