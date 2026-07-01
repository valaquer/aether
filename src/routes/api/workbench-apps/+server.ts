import { json } from '@sveltejs/kit';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REGISTRY_PATH = resolve('/Users/deepak-macmini/honeybloom/library/aether/workbench-apps.json');

export function GET() {
	try {
		const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
		return json(data);
	} catch {
		return json([]);
	}
}
