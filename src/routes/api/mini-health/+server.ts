import type { RequestHandler } from "./$types";
import { execSync } from "child_process";

const LOAD_THRESHOLD = 4;
const FREE_GB_THRESHOLD = 1;

export const GET: RequestHandler = async () => {
	try {
		const loadStr = execSync("sysctl -n vm.loadavg", { timeout: 3000, encoding: "utf-8" });
		const loadMatch = loadStr.match(/\{\s*([\d.]+)/);
		const load = loadMatch ? parseFloat(loadMatch[1]) : 0;

		const vmStr = execSync("vm_stat", { timeout: 3000, encoding: "utf-8" });
		const freeMatch = vmStr.match(/Pages free:\s+(\d+)/);
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
