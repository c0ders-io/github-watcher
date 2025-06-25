import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord-api-types/v10";
import { Command } from ".";

const removeCommand: Command = {
    data: {
        name: "remove-repo",
        description: "Remove a GitHub repository from watch list",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
            {
                name: "repository",
                description: "GitHub repository to remove (format: owner/repo)",
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    },

    async execute(interaction, env) {
        const repoOption = interaction.data.options?.find(opt => opt.name === "repository");
        const repo = repoOption?.type === ApplicationCommandOptionType.String ? repoOption.value as string : undefined;

        if (!repo) {
            return {
                content: "Please provide a repository to remove!",
                flags: 64
            };
        }

        try {
            // Get existing repos
            const existingRepos = await env.GITHUB_CACHE.get("watched_repos");
            let repos = existingRepos ? JSON.parse(existingRepos) : [];

            // Find the repo to remove
            const repoToRemove = repos.find((r: { repo: string }) => r.repo === repo);

            if (!repoToRemove) {
                return {
                    content: `Repository **${repo}** is not in the watch list!`,
                    flags: 64
                };
            }

            // Remove repo
            repos = repos.filter((r: { repo: string }) => r.repo !== repo);

            // Save updated list
            await env.GITHUB_CACHE.put("watched_repos", JSON.stringify(repos));

            return {
                content: `✅ Successfully removed **${repo}** from watch list!\n` +
                    `📢 Notifications were being sent to <#${repoToRemove.channelId}>`
            };
        } catch (error) {
            console.error("Error removing repo:", error);
            return {
                content: "An error occurred while removing the repository.",
                flags: 64
            };
        }
    }
};

export default removeCommand;