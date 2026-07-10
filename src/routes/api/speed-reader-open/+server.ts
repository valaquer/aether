import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const IMAC_IP = "192.168.0.153";
const MINI_IP = "192.168.0.186";
const SSH_KEY = "/Users/deepak-macmini/.ssh/id_mini";

export const POST: RequestHandler = async ({ request }) => {
	const { session_id } = await request.json();

	if (!session_id) {
		return json({ error: "Missing session_id" }, { status: 400 });
	}

	const url = `http://${MINI_IP}:51730/rsvp?session=${encodeURIComponent(session_id)}`;

	try {
		// Check if a tab with this session URL is already open
		const checkCmd = `ssh -i ${SSH_KEY} d.patnaik@${IMAC_IP} 'osascript -e "tell application \\"Safari\\" to set tabURLs to URL of every tab of every window" -e "tabURLs"'`;
		const { stdout } = await execAsync(checkCmd, { timeout: 10000 });
		if (stdout.includes(session_id)) {
			return json({ ok: true, session_id, already_open: true });
		}

		// Open new tab
		const openCmd = `ssh -i ${SSH_KEY} d.patnaik@${IMAC_IP} 'osascript -e "tell application \\"Safari\\" to open location \\"${url}\\""'`;
		await execAsync(openCmd, { timeout: 10000 });
		return json({ ok: true, session_id });
	} catch (err) {
		// If the check fails, still try to open
		try {
			const openCmd = `ssh -i ${SSH_KEY} d.patnaik@${IMAC_IP} 'osascript -e "tell application \\"Safari\\" to open location \\"${url}\\""'`;
			await execAsync(openCmd, { timeout: 10000 });
			return json({ ok: true, session_id });
		} catch (openErr) {
			return json({ error: `Failed to open Safari: ${openErr instanceof Error ? openErr.message : String(openErr)}` }, { status: 500 });
		}
	}
};
