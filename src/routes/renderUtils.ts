import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

export function renderMd(content: string): string {
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

function tryParseJson(str: string): any {
	try { return JSON.parse(str); } catch { return str; }
}

function escapeHtml(str: string): string {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

export function renderToolCard(content: string): string {
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
