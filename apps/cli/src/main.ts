#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

// Import all commands
import { convertCommand } from './commands/convert.js'

yargs(hideBin(process.argv))
    .scriptName('pixelrpg')
    .usage('$0 <cmd> [args]')
    // Add commands
    .command(convertCommand)
    // Global configs
    .strict()
    .demandCommand(1, 'You need at least one command before moving on')
    .help()
    .alias('h', 'help')
    .version()
    .parse() 