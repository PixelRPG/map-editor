import { Component } from 'excalibur'

/**
 * Reference to a user script attached to an entity — the seam for the
 * future built-in code editor (concept Phase E). The script representation
 * + a `ScriptSystem` that runs it are not specified yet; for now this is a
 * pure data marker that round-trips through save/load and the registry,
 * so a definition can already carry a `{ type:'script', scriptId }`
 * component without any runtime effect.
 */
export class ScriptRefComponent extends Component {
  constructor(
    public scriptId: string,
    public params?: Record<string, unknown>,
  ) {
    super()
  }
}
