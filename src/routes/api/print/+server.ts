import type { RequestHandler } from "./$types";
import { getMessages } from "$lib/server/aether-db";
import { writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const PRINT_SHOP = "/Users/deepak-macmini/print-shop";
const IMAC_SSH = "ssh -i /Users/deepak-macmini/.ssh/id_mini -o ConnectTimeout=3 d.patnaik@192.168.0.153";
const IMAC_SCP = "scp -i /Users/deepak-macmini/.ssh/id_mini -o ConnectTimeout=3";
const PRINTER = "Brother_HL_L2400DWE";
const PANDOC = "/opt/homebrew/bin/pandoc";

export const POST: RequestHandler = async ({ request }) => {
	const { roomId, messageId } = await request.json();
	if (!roomId) {
		return new Response(JSON.stringify({ error: "Missing roomId" }), { status: 400 });
	}

	let messages = getMessages(roomId).filter(
		(m) => m.type !== "tool_call" && m.type !== "response"
	);

	if (messageId) {
		messages = messages.filter((m) => m.id === messageId);
	}

	if (messages.length === 0) {
		return new Response(JSON.stringify({ error: "No messages found" }), { status: 404 });
	}

	const roomLabel = roomId.replace(/-\d{8}-\d{6}$/, "");
	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10);
	const timeStr = now.toTimeString().slice(0, 5).replace(":", "");

	const header = messageId
		? `# Message from ${messages[0].sender}\n\n*Printed from ${roomLabel} on ${dateStr}*\n`
		: `# ${roomLabel}\n\n*Printed on ${dateStr}*\n`;

	const body = messages
		.map((m) => {
			const ts = new Date(m.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
			return `**${m.sender}** (${ts})\n\n${m.content}\n`;
		})
		.join("\n---\n\n");

	const markdown = `${header}\n${body}`;
	const baseName = messageId
		? `print-msg-${dateStr}-${timeStr}`
		: `print-${roomLabel}-${dateStr}-${timeStr}`;
	const mdPath = `${PRINT_SHOP}/${baseName}.md`;
	const pdfPath = `${PRINT_SHOP}/${baseName}.pdf`;

	// Write markdown to print-shop (digital copy)
	writeFileSync(mdPath, markdown);

	// Generate PDF and print
	try {
		execSync(`${PANDOC} "${mdPath}" -o "${pdfPath}" --pdf-engine=xelatex -V mainfont="JetBrains Mono" -V fontsize=11pt -V geometry:"top=1cm, bottom=1cm"`, {
			env: { ...process.env, PATH: `/Library/TeX/texbin:${process.env.PATH}` },
			timeout: 30000,
		});
		execSync(`${IMAC_SCP} "${pdfPath}" d.patnaik@192.168.0.153:/tmp/${baseName}.pdf`, { timeout: 10000 });
		execSync(`${IMAC_SSH} "lp -d ${PRINTER} -o sides=two-sided-long-edge /tmp/${baseName}.pdf"`, { timeout: 10000 });
	} catch (e) {
		console.error("print: PDF generation or printing failed", e);
		return new Response(JSON.stringify({ filePath: mdPath, printed: false }), {
			headers: { "Content-Type": "application/json" },
		});
	}

	return new Response(JSON.stringify({ filePath: mdPath, printed: true }), {
		headers: { "Content-Type": "application/json" },
	});
};
