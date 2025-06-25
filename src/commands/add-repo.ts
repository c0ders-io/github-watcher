
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
                description: "GitHub repository (format: owner/repo)",
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

        const repo = repoOption?.type === ApplicationCommandOptionType.String ? repoOption.value as string : undefined;
        const channelId = channelIdOption?.type === ApplicationCommandOptionType.Channel ? channelIdOption.value as string : undefined;

        if (!repo || !channelId) {
            return {
                content: "Please provide both repository and channel!",
                flags: 64 
            };
        }

        // Validate repo format
        const repoRegex = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
        if (!repoRegex.test(repo)) {
            return {
                content: "Invalid repository format! Use: owner/repo",
                flags: 64
            };
        }

        try {
            // Check if GitHub repo exists
            const githubResponse = await fetch(`https://api.github.com/repos/${repo}`);
            if (!githubResponse.ok) {
                return {
                    content: "Repository not found or is private!",
                    flags: 64
                };
            }

            // Get existing repos
            const existingRepos = await env.GITHUB_CACHE.get("watched_repos");
            let repos = existingRepos ? JSON.parse(existingRepos) : [];

            // Check if repo already exists
            const existingRepo = repos.find((r: any) => r.repo === repo);
            if (existingRepo) {
                return {
                    content: `Repository ${repo} is already being watched!`,
                    flags: 64
                };
            }

            // Add new repo
            repos.push({
                repo: repo,
                channelId: channelId,
                lastCommitId: null,
                addedBy: interaction.member?.user.username,
                addedAt: new Date().toISOString()
            });

            // Save to KV
            await env.GITHUB_CACHE.put("watched_repos", JSON.stringify(repos));

            return {
                content: `✅ Successfully added **${repo}** to watch list!\nNotifications will be sent to <#${channelId}>`
            };
        } catch (error) {
            console.error("Error adding repo:", error);
            return {
                content: "An error occurred while adding the repository.",
                flags: 64
            };
        }
    }
};

export default command;
