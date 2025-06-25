import { XMLParser } from 'fast-xml-parser';
import { AutoRouter, IRequest } from 'itty-router';
import {
	InteractionResponseFlags,
	InteractionResponseType,
	InteractionType,
	verifyKey,
} from 'discord-interactions';
import commands from './commands';

class JsonResponse extends Response {
	constructor(body: Object, init: ResponseInit = {}) {
		const jsonBody = JSON.stringify(body);
		init = {
			...init,
			headers: {
				'content-type': 'application/json;charset=UTF-8',
				...init.headers
			},
		};
		super(jsonBody, init);
	}
}
const router = AutoRouter();

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
		console.log('Handling Application Command request');

		const command = commands.find((c) => c.data.name === interaction.data.name);

		if (!command) {
			return new JsonResponse({
				type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					content: 'Unknown command',
					flags: InteractionResponseFlags.EPHEMERAL,
				},
			});
		}

		console.log('Handling command: ', interaction.data.name);

		const data = await command.execute(interaction);

		return new JsonResponse({
			type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
			data
		});
	}

	console.error('Unknown Type');
	return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});

router.get(`/register/*`, async (request: Request, env: Env) => {
	let url = new URL(request.url)
	let password = url.pathname.split("/")[2]
	if (password !== env.PASSWORD) {
		return new JsonResponse({ error: 'Invalid Password' }, { status: 400 });
	}

	const data = JSON.stringify(commands.map(c => c.data))

	const res = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`, {
		method: "PUT",
		headers: {
			"Authorization": `Bot ${env.DISCORD_TOKEN}`,
			"Content-Type": "application/json"
		},
		body: data
	})
	return new JsonResponse({
		data,
		res: await res.json()
	})
})

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
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {

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
