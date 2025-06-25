import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord-api-types/v10";
import { Command } from ".";
import { GitHubEvent, EVENT_DESCRIPTIONS } from "./add-repo";

const updateEventsCommand: Command = {
    data: {
        name: "update-events",
        description: "Update watched events for a GitHub repository",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(),
        options: [
            {
                name: "repository",
                description: "GitHub repository to update (format: owner/repo)",
                type: ApplicationCommandOptionType.String,
                required: true
            },
            {
                name: "events",
                description: "Events to watch (comma-separated: commits,pr_opened,pr_closed,pr_merged,issues_opened,issues_closed,releases,push)",
                type: ApplicationCommandOptionType.String,
                required: true
            }
        ]
    },

    async execute(interaction, env) {
        const repoOption = interaction.data.options?.find(opt => opt.name === "repository");
        const eventsOption = interaction.data.options?.find(opt => opt.name === "events");

        const repo = repoOption?.type === ApplicationCommandOptionType.String ? repoOption.value as string : undefined;
        const eventsInput = eventsOption?.type === ApplicationCommandOptionType.String ? eventsOption.value as string : undefined;

        if (!repo || !eventsInput) {
            return {
                content: "Please provide both repository and events!",
                flags: 64
            };
        }

        // Parse and validate events
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

        if (validEvents.length === 0) {
            return {
                content: "Please provide at least one valid event to watch!",
                flags: 64
            };
        }

        try {
            // Get existing repos
            const existingRepos = await env.GITHUB_CACHE.get("watched_repos");
            let repos = existingRepos ? JSON.parse(existingRepos) : [];

            // Find the repo to update
            const repoIndex = repos.findIndex((r: { repo: string }) => r.repo === repo);

            if (repoIndex === -1) {
                return {
                    content: `Repository **${repo}** is not in the watch list! Use \`/add-repo\` to add it first.`,
                    flags: 64
                };
            }

            // Update the watched events
            const oldEvents = repos[repoIndex].watchedEvents || [GitHubEvent.COMMITS];
            repos[repoIndex].watchedEvents = validEvents;

            // Save updated list
            await env.GITHUB_CACHE.put("watched_repos", JSON.stringify(repos));

            const oldEventsList = oldEvents.map((event: GitHubEvent) => EVENT_DESCRIPTIONS[event] || `\`${event}\``).join(', ');
            const newEventsList = validEvents.map(event => EVENT_DESCRIPTIONS[event]).join(', ');

            return {
                content: `✅ **Successfully updated watched events for ${repo}!**\n\n` +
                    `**Previous events:** ${oldEventsList}\n` +
                    `**New events:** ${newEventsList}\n\n` +
                    `📢 Notifications will continue to be sent to <#${repos[repoIndex].channelId}>`
            };
        } catch (error) {
            console.error("Error updating repo events:", error);
            return {
                content: "An error occurred while updating the repository events.",
                flags: 64
            };
        }
    }
};

export default updateEventsCommand;