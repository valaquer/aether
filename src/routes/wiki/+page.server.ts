import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const WIKI_DIR = "/Users/deepak-macmini/honeybloom/library/wiki";

interface WikiPage {
	slug: string;
	title: string;
	content: string;
	frontmatter: Record<string, string>;
}

interface NavItem {
	slug: string;
	title: string;
	children: NavItem[];
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; content: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { frontmatter: {}, content: raw };

	const fm: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const m = line.match(/^([\w-]+):\s*(.+)$/);
		if (m) fm[m[1]] = m[2].trim();
	}
	return { frontmatter: fm, content: match[2] };
}

function extractWikilinks(content: string): string[] {
	const links: string[] = [];
	const re = /\[\[([^\]]+)\]\]/g;
	let m;
	while ((m = re.exec(content)) !== null) {
		links.push(m[1]);
	}
	return links;
}

export async function load() {
	const files = await readdir(WIKI_DIR);
	const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

	const pages: Record<string, WikiPage> = {};
	const titleToSlug: Record<string, string> = {};

	for (const file of mdFiles) {
		const raw = await readFile(path.join(WIKI_DIR, file), "utf-8");
		const slug = file.replace(/\.md$/, "");
		const { frontmatter, content } = parseFrontmatter(raw);

		pages[slug] = { slug, title: slug, content, frontmatter };
		titleToSlug[slug] = slug;
	}

	const home = pages["Home"];
	const navigation: NavItem[] = [];

	if (home) {
		const hubPattern = /\[\[([^\]]+)\]\]\s*[–-]\s*(.+)/g;
		let match;
		while ((match = hubPattern.exec(home.content)) !== null) {
			const hubTitle = match[1];
			if (!(hubTitle in titleToSlug)) continue;

			const hubPage = pages[hubTitle];
			const children: NavItem[] = [];

			if (hubPage) {
				const childLinks = extractWikilinks(hubPage.content);
				for (const link of childLinks) {
					if (link in titleToSlug && link !== hubTitle) {
						if (!children.some((c) => c.slug === link)) {
							children.push({ slug: link, title: link, children: [] });
						}
					}
				}
			}

			navigation.push({
				slug: hubTitle,
				title: hubTitle,
				children,
			});
		}
	}

	const validPages = new Set(Object.keys(pages));

	return {
		pages,
		navigation,
		validPages: [...validPages],
	};
}
