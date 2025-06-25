import { XMLParser } from 'fast-xml-parser';
import { AutoRouter, IRequest } from 'itty-router';
import {
	InteractionResponseType,
	InteractionType,
	verifyKey,
} from 'discord-interactions';
class JsonResponse extends Response {
	constructor(body: any, init: ResponseInit = {}) {
		const jsonBody = JSON.stringify(body);
		init = init || {
			headers: {
				'content-type': 'application/json;charset=UTF-8',
			},
		};
		super(jsonBody, init);
	}
}
const router = AutoRouter();

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get('/', (request, env) => {
	return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});
router.post('/', async (request, env) => {
	const { isValid, interaction } = await server.verifyDiscordRequest(
		request,
		env,
	);
	if (!isValid || !interaction) {
		return new Response('Bad request signature.', { status: 401 });
	}

	if (interaction.type === InteractionType.PING) {
		return new JsonResponse({
			type: InteractionResponseType.PONG,
		});
	}

	if (interaction.type === InteractionType.APPLICATION_COMMAND) {
		switch (interaction.data.name.toLowerCase()) {
			case 'ping': {
				return new JsonResponse({
					type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'Pong!',
					},
				});
			}
		}
	}

	console.error('Unknown Type');
	return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request: IRequest, env: Env) {
	const signature = request.headers.get('x-signature-ed25519');
	const timestamp = request.headers.get('x-signature-timestamp');
	const body = await request.text();
	const isValidRequest =
		signature &&
		timestamp &&
		(await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
	if (!isValidRequest) {
		return { isValid: false };
	}

	return { interaction: JSON.parse(body), isValid: true };
}
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise < void> {
	
	let resp = await fetch('https://api.cloudflare.com/client/v4/ips');
	let wasSuccessful = resp.ok ? 'success' : 'fail';
	/*const FEED_URL = "https:/ / github.com / vercel / next.js / commits / canary.atom";

	const res = await fetch(FEED_URL);
	const xml = await res.text();

	const parser = new XMLParser({ ignoreAttributes: false });
	const parsed = parser.parse(xml);

	const entries = parsed.feed.entry;
	const latest = Array.isArray(entries) ? entries[0] : entries;
	const commitId = latest.id.split('/')?.pop();
	await env.GITHUB_CACHE.put("latestCommit", commitId);
	console.log(env.DISCORD_PUBLIC_KEY)
	return new Response(commitId, { status: 200 });*/
	// You could store this result in KV, write to a D1 Database, or publish to a Queue.
	// In this template, we'll just log the result:
	console.log(`trigger fired at ${event.cron}: ${wasSuccessful}`);
}

const server = {
	verifyDiscordRequest,
	fetch: router.fetch,
	scheduled,
};

export default server;
