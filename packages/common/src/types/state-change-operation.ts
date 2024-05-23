import type { subscribe } from 'valtio/vanilla'

// Get the Op type which is not exported from valtio
export type StateChangeOperation = Parameters<Parameters<typeof subscribe>[1]>[0][0]
