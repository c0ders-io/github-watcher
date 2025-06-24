import { XMLParser } from 'fast-xml-parser';

export default {
	async fetch(req, env, ctx) {
		const FEED_URL = "https://github.com/vercel/next.js/commits/canary.atom";
		
		const res = await fetch(FEED_URL);
		const xml = await res.text();

		const parser = new XMLParser({ ignoreAttributes: false });
		const parsed = parser.parse(xml);

		const entries = parsed.feed.entry;
		const latest = Array.isArray(entries) ? entries[0] : entries;
		const commitId = latest.id.split('/')?.pop(); 
		await env.GITHUB_CACHE.put("latestCommit", commitId);
		
		return new Response(commitId, { status: 200 });
	},

	// The scheduled handler is invoked at the interval set in our wrangler.jsonc's
	// [[triggers]] configuration.
	async scheduled(event, env, ctx): Promise<void> {
		// A Cron Trigger can make requests to other endpoints on the Internet,
		// publish to a Queue, query a D1 Database, and much more.
		//
		// We'll keep it simple and make an API call to a Cloudflare API:
		let resp = await fetch('https://api.cloudflare.com/client/v4/ips');
		let wasSuccessful = resp.ok ? 'success' : 'fail';

		// You could store this result in KV, write to a D1 Database, or publish to a Queue.
		// In this template, we'll just log the result:
		console.log(`trigger fired at ${event.cron}: ${wasSuccessful}`);
	},
} satisfies ExportedHandler<Env>;
