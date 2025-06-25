import { AutoRouter, IRequest } from 'itty-router';
import {
	InteractionResponseFlags,
	InteractionResponseType,
	InteractionType,
	verifyKey,
} from 'discord-interactions';
import commands from './commands';
import { GitHubEvent } from './commands/add-repo';

// GitHub API interfaces
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

interface GitHubPullRequest {
	id: number;
	number: number;
	title: string;
	body: string;
	state: 'open' | 'closed';
	merged: boolean;
	html_url: string;
	user: {
		login: string;
		avatar_url: string;
	};
	created_at: string;
	updated_at: string;
	closed_at?: string;
	merged_at?: string;
}

interface GitHubIssue {
	id: number;
	number: number;
	title: string;
	body: string;
	state: 'open' | 'closed';
	html_url: string;
	user: {
		login: string;
		avatar_url: string;
	};
	created_at: string;
	updated_at: string;
	closed_at?: string;
}

interface GitHubRelease {
	id: number;
	tag_name: string;
	name: string;
	body: string;
	html_url: string;
	author: {
		login: string;
		avatar_url: string;
	};
	created_at: string;
	published_at: string;
	prerelease: boolean;
	draft: boolean;
}

interface WatchedRepo {
	repo: string;
	channelId: string;
	lastCommitId: string | null;
	lastPullRequestId: number | null;
	lastIssueId: number | null;
	lastReleaseId: number | null;
	addedBy: string;
	addedAt: string;
	watchedEvents: GitHubEvent[];
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

// Helper function to create GitHub API headers
function createGitHubHeaders(env: Env): Record<string, string> {
	const headers: Record<string, string> = {
		'User-Agent': 'Discord-Bot-GitHub-Watcher',
		'Accept': 'application/vnd.github.v3+json'
	};

	if (env.GITHUB_TOKEN) {
		headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
	}

	return headers;
}

// Function to get latest commits from GitHub
async function getLatestCommits(repo: string, env: Env): Promise<GitHubCommit[]> {
	try {
		const headers = createGitHubHeaders(env);
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

// Function to get latest pull requests
async function getLatestPullRequests(repo: string, env: Env): Promise<GitHubPullRequest[]> {
	try {
		const headers = createGitHubHeaders(env);
		const response = await fetch(`https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&per_page=10`, { headers });
		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		console.error(`Error fetching pull requests for ${repo}:`, error);
		return [];
	}
}

// Function to get latest issues
async function getLatestIssues(repo: string, env: Env): Promise<GitHubIssue[]> {
	try {
		const headers = createGitHubHeaders(env);
		const response = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&sort=updated&per_page=10`, { headers });
		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		console.error(`Error fetching issues for ${repo}:`, error);
		return [];
	}
}

// Function to get latest releases
async function getLatestReleases(repo: string, env: Env): Promise<GitHubRelease[]> {
	try {
		const headers = createGitHubHeaders(env);
		const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=5`, { headers });
		if (!response.ok) {
			throw new Error(`GitHub API error: ${response.status}`);
		}
		return await response.json();
	} catch (error) {
		console.error(`Error fetching releases for ${repo}:`, error);
		return [];
	}
}

// Message creation functions
function createCommitMessage(commit: GitHubCommit, repo: string): string {
	const author = commit.author?.login || commit.commit.author.name;
	const message = commit.commit.message.split('\n')[0]; // First line only
	const shortSha = commit.sha.substring(0, 7);
	const date = new Date(commit.commit.author.date).toLocaleString();

	return `📝 **New commit in ${repo}**\n` +
		`**Author:** ${author}\n` +
		`**Message:** ${message}\n` +
		`**SHA:** \`${shortSha}\`\n` +
		`**Date:** ${date}\n` +
		`**Link:** ${commit.html_url}`;
}

function createPullRequestMessage(pr: GitHubPullRequest, repo: string, action: 'opened' | 'closed' | 'merged'): string {
	const emoji = action === 'opened' ? '🔀' : action === 'merged' ? '✅' : '❌';
	const actionText = action === 'opened' ? 'opened' : action === 'merged' ? 'merged' : 'closed';
	const date = new Date(action === 'opened' ? pr.created_at : action === 'merged' ? (pr.merged_at || pr.closed_at || pr.updated_at) : (pr.closed_at || pr.updated_at)).toLocaleString();

	return `${emoji} **Pull request ${actionText} in ${repo}**\n` +
		`**Title:** ${pr.title}\n` +
		`**Author:** ${pr.user.login}\n` +
		`**Number:** #${pr.number}\n` +
		`**Date:** ${date}\n` +
		`**Link:** ${pr.html_url}`;
}

function createIssueMessage(issue: GitHubIssue, repo: string, action: 'opened' | 'closed'): string {
	const emoji = action === 'opened' ? '🐛' : '✔️';
	const date = new Date(action === 'opened' ? issue.created_at : (issue.closed_at || issue.updated_at)).toLocaleString();

	return `${emoji} **Issue ${action} in ${repo}**\n` +
		`**Title:** ${issue.title}\n` +
		`**Author:** ${issue.user.login}\n` +
		`**Number:** #${issue.number}\n` +
		`**Date:** ${date}\n` +
		`**Link:** ${issue.html_url}`;
}

function createReleaseMessage(release: GitHubRelease, repo: string): string {
	const date = new Date(release.published_at).toLocaleString();
	const prerelease = release.prerelease ? ' (Pre-release)' : '';

	return `🚀 **New release in ${repo}**${prerelease}\n` +
		`**Version:** ${release.tag_name}\n` +
		`**Name:** ${release.name}\n` +
		`**Author:** ${release.author.login}\n` +
		`**Date:** ${date}\n` +
		`**Link:** ${release.html_url}`;
}

// Scheduled function to check for new events
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

		// Check each repository for new events
		for (const watchedRepo of repos) {
			try {
				console.log(`Checking ${watchedRepo.repo}...`);

				// Check commits
				if (watchedRepo.watchedEvents.includes(GitHubEvent.COMMITS) || watchedRepo.watchedEvents.includes(GitHubEvent.PUSH)) {
					await checkCommits(watchedRepo, env);
				}

				// Check pull requests
				if (watchedRepo.watchedEvents.some(e => [GitHubEvent.PR_OPENED, GitHubEvent.PR_CLOSED, GitHubEvent.PR_MERGED].includes(e))) {
					await checkPullRequests(watchedRepo, env);
				}

				// Check issues
				if (watchedRepo.watchedEvents.some(e => [GitHubEvent.ISSUES_OPENED, GitHubEvent.ISSUES_CLOSED].includes(e))) {
					await checkIssues(watchedRepo, env);
				}

				// Check releases
				if (watchedRepo.watchedEvents.includes(GitHubEvent.RELEASES)) {
					await checkReleases(watchedRepo, env);
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

async function checkCommits(watchedRepo: WatchedRepo, env: Env) {
	const commits = await getLatestCommits(watchedRepo.repo, env);
	if (commits.length === 0) return;

	const latestCommit = commits[0];

	if (!watchedRepo.lastCommitId || watchedRepo.lastCommitId !== latestCommit.sha) {
		if (watchedRepo.lastCommitId && watchedRepo.lastCommitId !== latestCommit.sha) {
			const newCommits = [];
			for (const commit of commits) {
				if (commit.sha === watchedRepo.lastCommitId) break;
				newCommits.push(commit);
			}

			for (const commit of newCommits.reverse()) {
				const message = createCommitMessage(commit, watchedRepo.repo);
				await sendDiscordMessage(watchedRepo.channelId, message, env);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			console.log(`Sent ${newCommits.length} commit notifications for ${watchedRepo.repo}`);
		}

		watchedRepo.lastCommitId = latestCommit.sha;
	}
}

async function checkPullRequests(watchedRepo: WatchedRepo, env: Env) {
	const pullRequests = await getLatestPullRequests(watchedRepo.repo, env);
	if (pullRequests.length === 0) return;

	const latestPR = pullRequests[0];

	if (!watchedRepo.lastPullRequestId || watchedRepo.lastPullRequestId < latestPR.id) {
		const newPRs = pullRequests.filter(pr => !watchedRepo.lastPullRequestId || pr.id > watchedRepo.lastPullRequestId);

		for (const pr of newPRs.reverse()) {
			// Check for PR opened
			if (watchedRepo.watchedEvents.includes(GitHubEvent.PR_OPENED) && pr.state === 'open') {
				const message = createPullRequestMessage(pr, watchedRepo.repo, 'opened');
				await sendDiscordMessage(watchedRepo.channelId, message, env);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			// Check for PR merged
			if (watchedRepo.watchedEvents.includes(GitHubEvent.PR_MERGED) && pr.merged) {
				const message = createPullRequestMessage(pr, watchedRepo.repo, 'merged');
				await sendDiscordMessage(watchedRepo.channelId, message, env);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			// Check for PR closed (but not merged)
			if (watchedRepo.watchedEvents.includes(GitHubEvent.PR_CLOSED) && pr.state === 'closed' && !pr.merged) {
				const message = createPullRequestMessage(pr, watchedRepo.repo, 'closed');
				await sendDiscordMessage(watchedRepo.channelId, message, env);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		watchedRepo.lastPullRequestId = latestPR.id;
		console.log(`Checked ${newPRs.length} pull request updates for ${watchedRepo.repo}`);
	}
}

async function checkIssues(watchedRepo: WatchedRepo, env: Env) {
	const issues = await getLatestIssues(watchedRepo.repo, env);
	if (issues.length === 0) return;

	// Filter out pull requests (GitHub API includes PRs in issues endpoint)
	const actualIssues = issues.filter(issue => !issue.html_url.includes('/pull/'));
	if (actualIssues.length === 0) return;

	const latestIssue = actualIssues[0];

	if (!watchedRepo.lastIssueId || watchedRepo.lastIssueId < latestIssue.id) {
		const newIssues = actualIssues.filter(issue => !watchedRepo.lastIssueId || issue.id > watchedRepo.lastIssueId);

		for (const issue of newIssues.reverse()) {
			// Check for issue opened
			if (watchedRepo.watchedEvents.includes(GitHubEvent.ISSUES_OPENED) && issue.state === 'open') {
				const message = createIssueMessage(issue, watchedRepo.repo, 'opened');
				await sendDiscordMessage(watchedRepo.channelId, message, env);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

			// Check for issue closed
			if (watchedRepo.watchedEvents.includes(GitHubEvent.ISSUES_CLOSED) && issue.state === 'closed') {
				const message = createIssueMessage(issue, watchedRepo.repo, 'closed');
				await sendDiscordMessage(watchedRepo.channelId, message, env);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		watchedRepo.lastIssueId = latestIssue.id;
		console.log(`Checked ${newIssues.length} issue updates for ${watchedRepo.repo}`);
	}
}

async function checkReleases(watchedRepo: WatchedRepo, env: Env) {
	const releases = await getLatestReleases(watchedRepo.repo, env);
	if (releases.length === 0) return;

	const latestRelease = releases[0];

	if (!watchedRepo.lastReleaseId || watchedRepo.lastReleaseId < latestRelease.id) {
		const newReleases = releases.filter(release => !watchedRepo.lastReleaseId || release.id > watchedRepo.lastReleaseId);

		for (const release of newReleases.reverse()) {
			// Skip draft releases
			if (!release.draft) {
				const message = createReleaseMessage(release, watchedRepo.repo);
				await sendDiscordMessage(watchedRepo.channelId, message, env);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		watchedRepo.lastReleaseId = latestRelease.id;
		console.log(`Checked ${newReleases.length} release updates for ${watchedRepo.repo}`);
	}
}

const server = {
	verifyDiscordRequest,
	fetch: router.fetch,
	scheduled,
};

export default server;