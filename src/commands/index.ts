import ping from "./ping";
import addRepo from "./add-repo";
import { APIApplicationCommand, APIChatInputApplicationCommandInteraction, ApplicationCommandOptionType } from "discord-api-types/v10"


type PartialWithRequired<T, K extends keyof T> = Pick<T, K> & Partial<T>;

export type PartialWithRequiredAPIApplicationCommand = PartialWithRequired<APIApplicationCommand, 'name'>;
export interface Command {
    data: PartialWithRequiredAPIApplicationCommand,
    execute: (interaction: APIChatInputApplicationCommandInteraction, env: Env) => void
}

export default [
    ping,
    addRepo
]