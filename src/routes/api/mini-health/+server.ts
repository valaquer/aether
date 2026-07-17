import type { RequestHandler } from "./$types";
import { execSync } from "child_process";
import { getHeartbeat } from "$lib/server/houston-state";

const LOAD_THRESHOLD = 10;
const FREE_GB_THRESHOLD = 0.05;

export const GET: RequestHandler = async () => {
	const { stale: pollerStale } = getHeartbeat();

	try {
		const loadOutput = execSync("sysctl -n vm.loadavg", { timeout: 3000, encoding: "utf-8" });
		const vmOutput = execSync("vm_stat", { timeout: 3000, encoding: "utf-8" });

		const loadMatch = loadOutput.match(/\{\s*([\d.]+)/);
		const load = loadMatch ? parseFloat(loadMatch[1]) : 0;

		const freeMatch = vmOutput.match(/Pages free:\s+(\d+)/);
		const pageSize = 16384;
		const freePages = freeMatch ? parseInt(freeMatch[1]) : 0;
		const freeGB = (freePages * pageSize) / (1024 * 1024 * 1024);

		const status = load > LOAD_THRESHOLD || freeGB < FREE_GB_THRESHOLD || pollerStale ? "pressure" : "ok";

		return new Response(JSON.stringify({ status, load: Math.round(load * 100) / 100, freeGB: Math.round(freeGB * 10) / 10, pollerStale }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch {
		return new Response(JSON.stringify({ status: "pressure", load: 0, freeGB: 0, pollerStale }), {
			headers: { "Content-Type": "application/json" },
		});
	}
};
