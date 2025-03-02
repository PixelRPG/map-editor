import type { Arguments } from 'yargs'
import type { Command } from '../types/command.ts'
import { convertTiledToPixelRPG } from '../actions/convert.ts'

interface ConvertArgs extends Arguments {
    input: string
    output: string | null
}

export const convertCommand: Command<ConvertArgs> = {
    command: 'convert <input> [output]',
    describe: 'Convert Tiled map/tileset files to PixelRPG format',
    builder: (yargs) => {
        return yargs
            .positional('input', {
                describe: 'Input file path (.tmx or .tsx)',
                type: 'string',
                demandOption: true
            })
            .positional('output', {
                describe: 'Output file path (.json)',
                type: 'string',
                default: null
            })
    },
    handler: async (argv) => {
        await convertTiledToPixelRPG(argv.input, argv.output)
    }
} 