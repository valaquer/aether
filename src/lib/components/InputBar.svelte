<script lang="ts">
	let {
		onSend,
		focusMode = false,
		cacheCode = "M2N",
		value = $bindable(""),
	}: {
		onSend: (text: string) => void;
		focusMode?: boolean;
		cacheCode?: string;
		value?: string;
	} = $props();
	let textareaRef: HTMLTextAreaElement | undefined = $state();

	let lastLength = 0;
	function resize() {
		if (!textareaRef) return;
		const len = textareaRef.value.length;
		if (len < lastLength) {
			textareaRef.style.height = "auto";
		}
		lastLength = len;
		const target = Math.max(textareaRef.scrollHeight, 24);
		if (target !== textareaRef.offsetHeight) {
			textareaRef.style.height = target + "px";
		}
	}

	function resetHeight() {
		if (!textareaRef) return;
		textareaRef.style.height = "auto";
	}

	function handleSubmit() {
		const text = value.trim();
		if (!text) return;
		value = "";
		resetHeight();
		onSend(text);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	export function focus() {
		textareaRef?.focus();
	}
</script>

<div style="display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0 12px;">
	<div style="padding-top: calc(0.5rem - 1px); text-align: left; align-self: start;">
		<p class="sender-label" style="margin: 0; color: var(--color-text-muted); font-size: {focusMode ? '18px' : '12px'}; line-height: {focusMode ? '2.2' : '1.8'};">boss</p>
	</div>
	<div style="padding-top: 0; padding-bottom: 1rem;">
		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
			<div style="border: 1px dashed var(--color-bg-step4); border-left: 2px solid #5A3E2E;">
				<div style="padding: 0.5rem 1rem 0.5rem 1.5rem; background: var(--color-bg-element);">
					<textarea
						bind:value={value}
						bind:this={textareaRef}
						onkeydown={handleKeydown}
						oninput={resize}
						class="w-full bg-transparent outline-none resize-none"
						rows="1"
						placeholder=""
						style="color: var(--color-text); font-family: {focusMode ? "'OpenDyslexic', var(--font-mono)" : 'var(--font-mono)'}; font-size: {focusMode ? '18px' : '12px'}; font-weight: 300; border: none; max-height: 200px; overflow-y: auto; line-height: {focusMode ? '2.2' : '1.8'};"
					></textarea>
					<div style="height: 29px; position: relative;"><span style="position: absolute; bottom: 4px; right: 4px; font-size: 8px; color: #444; font-family: var(--font-mono);">{cacheCode}</span></div>
				</div>
			</div>
		</form>
	</div>
</div>
