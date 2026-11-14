import GLib from '@girs/glib-2.0'

/** The `GLib.Variant` scalar kinds the Control/action plane marshals to. */
export type VariantKind = 's' | 'b' | 'i' | 'u' | 'd'

/**
 * Decide which `GLib.Variant` scalar kind to build for an action
 * parameter/state: the action's declared variant type string when it's a
 * known scalar, otherwise inferred from the JS runtime type (string → `s`,
 * boolean → `b`, integer → `i`, non-integer number → `d`). Throws when
 * neither a known declared type nor an inferable JS type applies.
 *
 * Pure (no GLib) so the marshalling decision — the bit with the
 * whole-number-vs-double edge and the unsupported-type throw — is
 * unit-testable on both the gjs and node targets. {@link buildVariant} is
 * the thin GLib-constructing wrapper around it.
 */
export function variantKindFor(declaredType: string | null, value: unknown): VariantKind {
  switch (declaredType) {
    case 's':
    case 'b':
    case 'i':
    case 'u':
    case 'd':
      return declaredType
  }
  if (typeof value === 'string') return 's'
  if (typeof value === 'boolean') return 'b'
  if (typeof value === 'number') return Number.isInteger(value) ? 'i' : 'd'
  throw new Error(`Cannot build a GLib.Variant from ${typeof value}`)
}

/**
 * Member kinds of a declared TUPLE type — `'(ss)'` → `['s', 's']` — or
 * `null` when `declaredType` is not a tuple.
 *
 * An action that takes two things takes a tuple: GAction has one
 * parameter, so `win.focus-placement(mapId, placementId)` is `(ss)`.
 * Until this existed the Control plane could not activate such an action
 * at all — {@link variantKindFor} saw an unknown declared type, fell back
 * to inferring from the JS value, and an array is neither string, boolean
 * nor number, so it threw. The action was reachable from a keyboard and
 * from nothing else: not from `scripts/smoke/drive.py`, not from the MCP
 * bridge, not from a `pixelrpg://` link. Deep links are exactly what the
 * driver exists to exercise (REDESIGN.md § 3.4), so the marshaller has to
 * know the shape the spec asks for.
 *
 * Only tuples of the five marshalled scalars are supported, and an
 * unsupported member throws rather than being skipped — a short tuple
 * would be a type mismatch at `activate_action`, which GTK reports as a
 * warning on stderr and nothing else.
 */
export function tupleKindsFor(declaredType: string | null): VariantKind[] | null {
  const inner = declaredType?.match(/^\((.*)\)$/)?.[1]
  if (inner === undefined) return null
  return [...inner].map((member) => {
    switch (member) {
      case 's':
      case 'b':
      case 'i':
      case 'u':
      case 'd':
        return member
      default:
        throw new Error(`Cannot build a GLib.Variant for tuple member "${member}" of ${declaredType}`)
    }
  })
}

/**
 * Pair each member kind of a declared tuple type with the value it will
 * marshal, or `null` when `declaredType` is not a tuple. Throws when the
 * value is not an array of exactly the tuple's length.
 *
 * Pure for the same reason {@link variantKindFor} is: the arity check is
 * the part that fails on a caller's typo, and a wrong-arity variant is
 * not a loud failure — `Gio.Action.activate` type-checks the parameter
 * and drops the activation with a warning on stderr, so the action
 * simply does not happen.
 */
export function tupleMembersFor(declaredType: string | null, value: unknown): Array<[VariantKind, unknown]> | null {
  const kinds = tupleKindsFor(declaredType)
  if (!kinds) return null
  if (!Array.isArray(value) || value.length !== kinds.length)
    throw new Error(
      `${declaredType} needs an array of ${kinds.length} value(s), got ${JSON.stringify(value) ?? typeof value}`,
    )
  return kinds.map((kind, index) => [kind, value[index]])
}

/** One marshalled scalar. */
function buildScalar(kind: VariantKind, value: unknown): GLib.Variant {
  switch (kind) {
    case 's':
      return GLib.Variant.new_string(String(value))
    case 'b':
      return GLib.Variant.new_boolean(Boolean(value))
    case 'i':
      return GLib.Variant.new_int32(Number(value))
    case 'u':
      return GLib.Variant.new_uint32(Number(value))
    case 'd':
      return GLib.Variant.new_double(Number(value))
  }
}

/**
 * Build a `GLib.Variant` for an action parameter/state from a plain JS
 * value, using the action's declared type when known and otherwise
 * inferring from the JS runtime type (see {@link variantKindFor}).
 *
 * A declared tuple type takes a JS array of the same length — the JSON
 * `["kokiri-forest", "chest-1"]` for `(ss)`.
 */
export function buildVariant(type: GLib.VariantType | null, value: unknown): GLib.Variant {
  const declared = type?.dup_string() ?? null
  const members = tupleMembersFor(declared, value)
  if (members) return GLib.Variant.new_tuple(members.map(([kind, member]) => buildScalar(kind, member)))
  return buildScalar(variantKindFor(declared, value), value)
}
