import type { RequestHandler } from "./$types";
import { execSync } from "child_process";

// GET — auto-detect active account from claude auth status
export const GET: RequestHandler = async () => {
	let account = "unknown";
	try {
		const raw = execSync("/opt/homebrew/bin/claude auth status 2>&1", {
			timeout: 5000,
			encoding: "utf-8",
		});
		const parsed = JSON.parse(raw);
		const email = (parsed.email ?? "").toLowerCase();
		if (email.includes("oovar")) account = "oovar";
		else if (email.includes("gmail")) account = "gmail";
	} catch {}
	return new Response(JSON.stringify({ account }), {
		headers: { "Content-Type": "application/json" },
	});
};
