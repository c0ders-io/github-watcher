import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord-api-types/v10";
import { Command } from ".";


export enum GitHubEvent {
    COMMITS = "commits",
    PR_OPENED = "pr_opened",
    PR_CLOSED = "pr_closed",
    PR_MERGED = "pr_merged",
    ISSUES_OPENED = "issues_opened",
    ISSUES_CLOSED = "issues_closed",
    RELEASES = "releases",
    PUSH = "push"
}

export const EVENT_DESCRIPTIONS = {
    [GitHubEvent.COMMITS]: "📝 New commits",
    [GitHubEvent.PR_OPENED]: "🔀 Pull requests opened",
    [GitHubEvent.PR_CLOSED]: "❌ Pull requests closed",
    [GitHubEvent.PR_MERGED]: "✅ Pull requests merged",
    [GitHubEvent.ISSUES_OPENED]: "🐛 Issues opened",
    [GitHubEvent.ISSUES_CLOSED]: "✔️ Issues closed",
    [GitHubEvent.RELEASES]: "🚀 New releases",
    [GitHubEvent.PUSH]: "⬆️ Code pushed",
};

const command: Command = {
    data: {
        name: "add-repo",
        description: "Add a GitHub repository to watch",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
            {
                name: "repository",
                description: "GitHub repository (format: owner/repo or full GitHub URL)",
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: "channel",
                description: "Channel to send notifications to",
                type: ApplicationCommandOptionType.Channel,
                required: true
            },
            {
                name: "events",
                description: "Events to watch (comma-separated: commits,pr_opened,pr_closed,pr_merged)",
                type: ApplicationCommandOptionType.String,
                required: false,
                
            }
        ]
    },

    async execute(interaction, env) {
        const repoOption = interaction.data.options?.find(opt => opt.name === "repository");
        const channelIdOption = interaction.data.options?.find(opt => opt.name === "channel");
        const eventsOption = interaction.data.options?.find(opt => opt.name === "events");

        const repoInput = repoOption?.type === ApplicationCommandOptionType.String ? repoOption.value as string : undefined;
        const channelId = channelIdOption?.type === ApplicationCommandOptionType.Channel ? channelIdOption.value as string : undefined;
        const eventsInput = eventsOption?.type === ApplicationCommandOptionType.String ? eventsOption.value as string : undefined;

        if (!repoInput || !channelId) {
            return {
                content: "Please provide both repository and channel!",
                flags: 64
            };
        }

        // Parse and validate events
        let watchedEvents: GitHubEvent[] = [GitHubEvent.COMMITS]; // Default to commits

        if (eventsInput) {
            const inputEvents = eventsInput.split(',').map(e => e.trim().toLowerCase());
            const validEvents: GitHubEvent[] = [];
            const invalidEvents: string[] = [];

            for (const event of inputEvents) {
                if (Object.values(GitHubEvent).includes(event as GitHubEvent)) {
                    validEvents.push(event as GitHubEvent);
                } else {
                    invalidEvents.push(event);
                }
            }

            if (invalidEvents.length > 0) {
                const availableEvents = Object.values(GitHubEvent).join(', ');
                return {
                    content: `❌ Invalid event(s): **${invalidEvents.join(', ')}**\n\n` +
                        `Available events: \`${availableEvents}\`\n\n` +
                        `**Event descriptions:**\n` +
                        Object.entries(EVENT_DESCRIPTIONS).map(([key, desc]) => `• \`${key}\` - ${desc}`).join('\n'),
                    flags: 64
                };
            }

            if (validEvents.length > 0) {
                watchedEvents = validEvents;
            }
        }

        // Extract repo from URL or validate direct format
        let repo: string;

        // Check if it's a GitHub URL
        const urlRegex = /^https?:\/\/(www\.)?github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/?.*$/;
        const urlMatch = repoInput.match(urlRegex);

        if (urlMatch) {
            // Extract owner/repo from URL
            repo = `${urlMatch[2]}/${urlMatch[3]}`;
        } else {
            // Check if it's already in owner/repo format
            const repoRegex = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
            if (repoRegex.test(repoInput)) {
                repo = repoInput;
            } else {
                return {
                    content: "Invalid repository format! Use either:\n• `owner/repo` (e.g., `microsoft/vscode`)\n• Full GitHub URL (e.g., `https://github.com/microsoft/vscode`)",
                    flags: 64
                };
            }
        }

        try {
            // Prepare headers for GitHub API request
            const headers: Record<string, string> = {
                'User-Agent': 'Discord-Bot-GitHub-Watcher',
                'Accept': 'application/vnd.github.v3+json'
            };

            // Add GitHub token if available (recommended)
            if (env.GITHUB_TOKEN) {
                headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
            }

            // Check if GitHub repo exists
            const githubResponse = await fetch(`https://api.github.com/repos/${repo}`, {
                headers: headers
            });

            if (!githubResponse.ok) {
                if (githubResponse.status === 404) {
                    return {
                        content: `Repository **${repo}** not found! Please check:\n• Repository name is correct\n• Repository is public\n• You have access to view it`,
                        flags: 64
                    };
                } else if (githubResponse.status === 403) {
                    const rateLimitRemaining = githubResponse.headers.get('X-RateLimit-Remaining');
                    if (rateLimitRemaining === '0') {
                        return {
                            content: `GitHub API rate limit exceeded. Please try again later or add a GitHub token to increase the limit.`,
                            flags: 64
                        };
                    }
                    return {
                        content: `Access forbidden to repository **${repo}**. The repository might be private or you don't have access.`,
                        flags: 64
                    };
                } else {
                    return {
                        content: `Error accessing repository **${repo}** (Status: ${githubResponse.status})`,
                        flags: 64
                    };
                }
            }

            // Get repository info for confirmation
            const repoData = await githubResponse.json() as any;
            const repoFullName = repoData.full_name;
            const repoDescription = repoData.description;

            // Get existing repos
            const existingRepos = await env.GITHUB_CACHE.get("watched_repos");
            let repos = existingRepos ? JSON.parse(existingRepos) : [];

            // Check if repo already exists
            const existingRepo = repos.find((r: any) => r.repo === repo);
            if (existingRepo) {
                return {
                    content: `Repository **${repo}** is already being watched!\nNotifications are sent to <#${existingRepo.channelId}>\nWatched events: ${existingRepo.watchedEvents?.map((e: string) => `\`${e}\``).join(', ') || '`commits`'}`,
                    flags: 64
                };
            }

            // Add new repo
            repos.push({
                repo: repo,
                channelId: channelId,
                lastCommitId: null,
                lastPullRequestId: null,
                lastIssueId: null,
                lastReleaseId: null,
                addedBy: interaction.member?.user?.username || 'Unknown',
                addedAt: new Date().toISOString(),
                repoFullName: repoFullName,
                repoDescription: repoDescription,
                watchedEvents: watchedEvents
            });

            // Save to KV
            await env.GITHUB_CACHE.put("watched_repos", JSON.stringify(repos));

            const eventsList = watchedEvents.map(event => `• ${EVENT_DESCRIPTIONS[event]}`).join('\n');

            return {
                content: `✅ **Successfully added repository to watch list!**\n\n` +
                    `📁 **Repository:** ${repoFullName}\n` +
                    `📝 **Description:** ${repoDescription || 'No description'}\n` +
                    `📢 **Notifications:** <#${channelId}>\n` +
                    `🔗 **URL:** https://github.com/${repo}\n\n` +
                    `**Watching events:**\n${eventsList}`
            };
        } catch (error) {
            console.error("Error adding repo:", error);
            return {
                content: "An error occurred while adding the repository. Please try again later.",
                flags: 64
            };
        }
    }
};

export default command;