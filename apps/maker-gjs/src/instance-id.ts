/**
 * Coerce a free-form PIXELRPG_INSTANCE label into a valid app-id
 * segment (letter-led, alphanumeric). CONTRACT with the MCP bridge:
 * `apps/mcp-bridge/src/index.ts` `sanitizeLabel` is a byte-identical
 * copy (the bridge is deliberately dependency-free, so it cannot
 * import this) — both sides derive the per-instance D-Bus name from
 * it, and a drift means the bridge dials a bus name the app never
 * owns. `instance-id.spec.ts` pins representative label→segment pairs;
 * change BOTH copies + the spec together.
 */
export function sanitizeInstanceId(label: string): string {
  const cleaned = label.toLowerCase().replace(/[^a-z0-9]/g, '')
  return /^[a-z]/.test(cleaned) ? cleaned : `i${cleaned || '0'}`
}
