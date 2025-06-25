import { APIInteractionResponse, ApplicationCommandOptionType, InteractionResponseType, PermissionFlagsBits } from "discord-api-types/v10";
import { Command } from ".";

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
            }
        ]
    },

    async execute(interaction, env) {
        const repoOption = interaction.data.options?.find(opt => opt.name === "repository");
        const channelIdOption = interaction.data.options?.find(opt => opt.name === "channel");

        const repoInput = repoOption?.type === ApplicationCommandOptionType.String ? repoOption.value as string : undefined;
        const channelId = channelIdOption?.type === ApplicationCommandOptionType.Channel ? channelIdOption.value as string : undefined;

        if (!repoInput || !channelId) {
            return {
                content: "Please provide both repository and channel!",
                flags: 64
            };
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
                    content: `Repository **${repo}** is already being watched!\nNotifications are sent to <#${existingRepo.channelId}>`,
                    flags: 64
                };
            }

            // Add new repo
            repos.push({
                repo: repo,
                channelId: channelId,
                lastCommitId: null,
                addedBy: interaction.member?.user?.username || 'Unknown',
                addedAt: new Date().toISOString(),
                repoFullName: repoFullName,
                repoDescription: repoDescription
            });

            // Save to KV
            await env.GITHUB_CACHE.put("watched_repos", JSON.stringify(repos));

            return {
                content: `✅ **Successfully added repository to watch list!**\n\n` +
                    `📁 **Repository:** ${repoFullName}\n` +
                    `📝 **Description:** ${repoDescription || 'No description'}\n` +
                    `📢 **Notifications:** <#${channelId}>\n` +
                    `🔗 **URL:** https://github.com/${repo}`
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