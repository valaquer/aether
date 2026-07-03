import { json } from '@sveltejs/kit';
import { exec } from 'child_process';

const HOMEDIR = '/Users/deepak-macmini/honeybloom';

async function isPortListening(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		exec(`curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://localhost:${port}`, (err, stdout) => {
			resolve(!err && stdout.trim() === '200');
		});
	});
}

async function waitForPort(port: number, maxWaitMs: number): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < maxWaitMs) {
		if (await isPortListening(port)) return true;
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}

export async function POST({ request }: { request: Request }) {
	try {
		const { port, path } = await request.json();

		if (!port || !path) {
			return json({ status: 'failed', reason: 'Missing port or path' }, { status: 400 });
		}

		if (await isPortListening(port)) {
			return json({ status: 'running' });
		}

		const appDir = `${HOMEDIR}/${path}`;

		// Start the dev server in background
		exec(
			`nohup bash -c 'cd ${appDir} && PATH=/opt/homebrew/bin:$PATH exec npm run dev' > /tmp/${path.replace(/\//g, '-')}-dev.log 2>&1 &`
		);

		const ready = await waitForPort(port, 15000);

		return json({ status: ready ? 'running' : 'failed' });
	} catch {
		return json({ status: 'failed' }, { status: 500 });
	}
}
