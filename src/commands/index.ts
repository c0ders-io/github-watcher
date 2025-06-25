import ping from "./ping";
import { APIApplicationCommandOptionBase, APIUserApplicationCommandGuildInteraction, ApplicationCommandOptionType } from "discord-api-types/v10"


export interface data extends Omit<APIApplicationCommandOptionBase<ApplicationCommandOptionType>, 'type'> {
    type?: ApplicationCommandOptionType
}

export interface Command {
    data: data,
    execute: (interaction: APIUserApplicationCommandGuildInteraction) => void
}

export default [
    ping
]