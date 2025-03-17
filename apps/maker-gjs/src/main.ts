import '@girs/gjs/dom'
import '@girs/gjs'
import system from 'system'

import { Application } from './application.ts'
export function main(argv: string[]) {
  const application = new Application()
  return application.runAsync(argv)
}

const exit_code = await main(
  [imports.system.programInvocationName].concat(ARGV),
)
log('exit_code: ' + exit_code)
system.exit(exit_code)
