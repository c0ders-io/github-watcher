import { XMLParser } from 'fast-xml-parser';
import { AutoRouter, IRequest } from 'itty-router';
import {
	InteractionResponseFlags,
	InteractionResponseType,
	InteractionType,
	verifyKey,
} from 'discord-interactions';
import commands from './commands';

// GitHub commit interface
interface GitHubCommit {
	sha: string;
	commit: {
		message: string;
		author: {
			name: string;
			date: string;
		};
	};
	html_url: string;
	author?: {
		login?: string;
		avatar_url?: string;
	};
}

interface WatchedRepo {
	repo: string;
	channelId: string;
	lastCommitId: string | null;
	addedBy: string;
	addedAt: string;
}

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

router.get('/', (request, env: Env) => {
	return new Response(`👋 GitHub Watcher Bot - ${env.DISCORD_APPLICATION_ID}`);
});

router.post('/', async (request, env: Env) => {
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

		const data = await command.execute(interaction, env);

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
	const guild = env.GUILD_ID
	if (guild) {
		const res = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${guild}/commands`, {
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
	}
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

// Function to send Discord message
async function sendDiscordMessage(channelId: string, content: string, env: Env) {
	try {
		const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
			method: 'POST',
			headers: {
				'Authorization': `Bot ${env.DISCORD_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ content }),
		});

		if (!response.ok) {
			console.error(`Failed to send message to channel ${channelId}:`, await response.text());
		}
	} catch (error) {
		console.error(`Error sending message to channel ${channelId}:`, error);
	}
}

// Function to get latest commits from GitHub
async function getLatestCommits(repo: string, env: Env): Promise<GitHubCommit[]> {
	try {
		const headers: Record<string, string> = {
			'User-Agent': 'Discord-Bot-GitHub-Watcher',
			'Accept': 'application/vnd.github.v3+json'
		};

		if (env.GITHUB_TOKEN) {
			headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
		}
		const response = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=5`, { headers });
		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		console.error(`Error fetching commits for ${repo}:`, error);
		return [];
	}
}

// Function to create commit embed message
function createCommitMessage(commit: GitHubCommit, repo: string): string {
	const author = commit.author?.login || commit.commit.author.name;
	const message = commit.commit.message.split('\n')[0]; // First line only
	const shortSha = commit.sha.substring(0, 7);
	const date = new Date(commit.commit.author.date).toLocaleString();

	return `🔄 **New commit in ${repo}**\n` +
		`**Author:** ${author}\n` +
		`**Message:** ${message}\n` +
		`**SHA:** \`${shortSha}\`\n` +
		`**Date:** ${date}\n` +
		`**Link:** ${commit.html_url}`;
}

// Scheduled function to check for new commits
export async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
	console.log(`GitHub watcher triggered at ${event.cron}`);

	try {
		// Get watched repositories
		const reposData = await env.GITHUB_CACHE.get("watched_repos");
		if (!reposData) {
			console.log("No repositories to watch");
			return;
		}

		const repos: WatchedRepo[] = JSON.parse(reposData);
		if (repos.length === 0) {
			console.log("No repositories in watch list");
			return;
		}

		console.log(`Checking ${repos.length} repositories for updates`);

		// Check each repository for new commits
		for (const watchedRepo of repos) {
			try {
				console.log(`Checking ${watchedRepo.repo}...`);

				const commits = await getLatestCommits(watchedRepo.repo, env);
				if (commits.length === 0) {
					continue;
				}

				const latestCommit = commits[0];

				// If this is the first time checking or there's a new commit
				if (!watchedRepo.lastCommitId || watchedRepo.lastCommitId !== latestCommit.sha) {
					// If we have a previous commit ID and it's different, we have new commits
					if (watchedRepo.lastCommitId && watchedRepo.lastCommitId !== latestCommit.sha) {
						// Find new commits (commits that came after the last known commit)
						const newCommits = [];
						for (const commit of commits) {
							if (commit.sha === watchedRepo.lastCommitId) {
								break; // Stop when we reach the last known commit
							}
							newCommits.push(commit);
						}

						// Send notification for each new commit
						for (const commit of newCommits.reverse()) { // Reverse to show oldest first
							const message = createCommitMessage(commit, watchedRepo.repo);
							await sendDiscordMessage(watchedRepo.channelId, message, env);

							// Add a small delay between messages to avoid rate limiting
							await new Promise(resolve => setTimeout(resolve, 1000));
						}

						console.log(`Sent ${newCommits.length} commit notifications for ${watchedRepo.repo}`);
					}

					// Update the last commit ID
					watchedRepo.lastCommitId = latestCommit.sha;
				}
			} catch (error) {
				console.error(`Error checking repository ${watchedRepo.repo}:`, error);
			}
		}

		// Save updated repository data
		await env.GITHUB_CACHE.put("watched_repos", JSON.stringify(repos));

		console.log("GitHub watcher completed successfully");
	} catch (error) {
		console.error("Error in scheduled GitHub watcher:", error);
	}
}

const server = {
	verifyDiscordRequest,
	fetch: router.fetch,
	scheduled,
};

export default server;