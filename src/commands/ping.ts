import { Command } from "./index"

const command: Command = {
    data: {
        name: "ping",
        description: "Ping the bot"
    },

    async execute(interaction) {
        return {
            content: "Pong, " + interaction.member!.user.username + "!"
        }
    }
}

export default command