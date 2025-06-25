import ping from "./ping";
import addRepo from "./add-repo";
import listRepos from "./list-repos";
import removeRepo from "./remove-repo";
import updateEvents from "./update-events";
import { APIApplicationCommand, APIChatInputApplicationCommandInteraction, ApplicationCommandOptionType } from "discord-api-types/v10"


type PartialWithRequired<T, K extends keyof T> = Pick<T, K> & Partial<T>;

export type PartialWithRequiredAPIApplicationCommand = PartialWithRequired<APIApplicationCommand, 'name'>;
export interface Command {
    data: PartialWithRequiredAPIApplicationCommand,
    execute: (interaction: APIChatInputApplicationCommandInteraction, env: Env) => void
}

export default [
    ping,
    addRepo,
    listRepos,
    removeRepo,
    updateEvents
]