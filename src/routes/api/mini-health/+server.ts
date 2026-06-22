import type { RequestHandler } from "./$types";
import { execSync } from "child_process";

const LOAD_THRESHOLD = 10;
const FREE_GB_THRESHOLD = 0.5;
const SSH_CMD = 'ssh -i /Users/deepak-macmini/.ssh/id_hanover -o ConnectTimeout=3 -o StrictHostKeyChecking=no deepak-macmini@192.168.0.186 "sysctl -n vm.loadavg; vm_stat"';

export const GET: RequestHandler = async () => {
	try {
		const output = execSync(SSH_CMD, { timeout: 5000, encoding: "utf-8" });

		const loadMatch = output.match(/\{\s*([\d.]+)/);
		const load = loadMatch ? parseFloat(loadMatch[1]) : 0;

		const freeMatch = output.match(/Pages free:\s+(\d+)/);
		const pageSize = 16384;
		const freePages = freeMatch ? parseInt(freeMatch[1]) : 0;
		const freeGB = (freePages * pageSize) / (1024 * 1024 * 1024);

		const status = load > LOAD_THRESHOLD || freeGB < FREE_GB_THRESHOLD ? "pressure" : "ok";

		return new Response(JSON.stringify({ status, load: Math.round(load * 100) / 100, freeGB: Math.round(freeGB * 10) / 10 }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ status: "ok", load: 0, freeGB: 0 }), {
			headers: { "Content-Type": "application/json" },
		});
	}
};
