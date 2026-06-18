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
 * Build a `GLib.Variant` for an action parameter/state from a plain JS
 * value, using the action's declared type when known and otherwise
 * inferring from the JS runtime type (see {@link variantKindFor}).
 */
export function buildVariant(type: GLib.VariantType | null, value: unknown): GLib.Variant {
  switch (variantKindFor(type?.dup_string() ?? null, value)) {
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
