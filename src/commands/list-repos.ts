import { Command } from ".";


const listCommand: Command = {
    data: {
        name: "list-repos",
        description: "List all watched GitHub repositories"
    },

    async execute(interaction, env) {
        try {
            const existingRepos = await env.GITHUB_CACHE.get("watched_repos");
            const repos = existingRepos ? JSON.parse(existingRepos) : [];

            if (repos.length === 0) {
                return {
                    content: "No repositories are currently being watched."
                };
            }

            let content = "📋 **Watched Repositories:**\n\n";
            repos.forEach((repo: { repo: any; channelId: any; addedBy: any; }, index: number) => {
                content += `${index + 1}. **${repo.repo}**\n`;
                content += `   └ Channel: <#${repo.channelId}>\n`;
                content += `   └ Added by: ${repo.addedBy}\n\n`;
            });

            return { content };
        } catch (error) {
            console.error("Error listing repos:", error);
            return {
                content: "An error occurred while fetching the repository list.",
                flags: 64
            };
        }
    }
};