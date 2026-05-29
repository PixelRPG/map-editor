/**
 * Parser for `avahi-browse -p` output. Lives in a separate module
 * from {@link LanBrowser} so the line-oriented format stays unit-
 * testable without spawning an actual subprocess.
 *
 * The `-p` (parseable) format emits one line per event:
 *
 *   `+;<iface>;<proto>;<name>;<type>;<domain>`             — appeared
 *   `=;<iface>;<proto>;<name>;<type>;<domain>;<host>;<addr>;<port>;<txt>` — resolved
 *   `-;<iface>;<proto>;<name>;<type>;<domain>`             — withdrawn
 *
 * The TXT column at the tail is a quote-delimited list of
 * `"key=value"` tokens; empty TXT is reported as the empty string.
 * We only surface the `=` (resolved) records — the `+` / `-`
 * discoveries without resolution data are not useful to the UI.
 */

/**
 * A LAN-published service the maker can join. Shape matches the
 * `_pixelrpg._tcp.local` TXT-record schema documented in
 * `docs/concepts/collaboration-and-multiplayer.md` § 6.
 */
export interface DiscoveredService {
  name: string
  host: string
  address: string
  port: number
  txt: Record<string, string>
}

export type LanDiscoveryEvent =
  | { kind: 'resolved'; service: DiscoveredService }
  | { kind: 'gone'; serviceName: string }

/**
 * Convert one line of `avahi-browse -p` output into a structured
 * event. Returns `null` for unrecognised / partial lines so the
 * caller can ignore them.
 */
export function parseAvahiBrowseLine(line: string): LanDiscoveryEvent | null {
  if (!line) return null
  const tag = line[0]
  if (tag !== '=' && tag !== '-') return null

  const fields = line.split(';')

  if (tag === '-') {
    // Format: -;<iface>;<proto>;<name>;<type>;<domain>
    const name = fields[3]
    if (!name) return null
    return { kind: 'gone', serviceName: name }
  }

  // tag === '='
  // Format: =;<iface>;<proto>;<name>;<type>;<domain>;<host>;<addr>;<port>;<txt>
  if (fields.length < 10) return null
  const [, , , name, , , host, address, portStr] = fields
  if (!name || !host || !address || !portStr) return null
  const port = Number.parseInt(portStr, 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) return null
  // TXT column carries the rest, including any `;` that snuck into
  // a TXT value (rare but legal). Join from field 9 onward.
  const txtField = fields.slice(9).join(';')
  return {
    kind: 'resolved',
    service: { name, host, address, port, txt: parseTxtField(txtField) },
  }
}

/**
 * Avahi serialises TXT records as `"key=val" "key2=val2"` separated
 * by spaces. Split on the quoted tokens; tolerate empty / missing
 * keys.
 */
function parseTxtField(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  const tokenRe = /"([^"]*)"/g
  let match: RegExpExecArray | null = tokenRe.exec(raw)
  while (match !== null) {
    const token = match[1] ?? ''
    const eq = token.indexOf('=')
    if (eq > 0) {
      const key = token.slice(0, eq)
      const value = token.slice(eq + 1)
      if (key) result[key] = value
    }
    match = tokenRe.exec(raw)
  }
  return result
}
