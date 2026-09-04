/**
 * The MCP response vocabulary every tool in this bridge answers in. Kept
 * free of `gi://` imports so the error mapping built on top of it
 * (`dbus/dbus-error.ts`) unit-tests under the node target.
 */
export type ToolResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
  isError?: boolean
}

/** A successful tool answer. */
export const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })

/** A failed tool answer — `isError` is what tells the client the call did not apply. */
export const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })
