import { z } from 'zod'

/** The `instance` input every tool carries: which editor process to address. */
export const instanceArg = {
  instance: z.string().optional().describe('Editor instance label; omit for the default app'),
}
