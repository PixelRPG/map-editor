import type { CommandModule, ArgumentsCamelCase, Arguments } from 'yargs'

export interface Command<T extends Arguments = Arguments> extends CommandModule<{}, T> {
    command: string
    describe: string
    handler: (args: ArgumentsCamelCase<T>) => Promise<void> | void
} 