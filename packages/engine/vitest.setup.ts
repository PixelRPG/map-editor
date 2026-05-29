// Excalibur's `polyfill()` runs on import and tries to assign to
// `window.audioContext`. Under Node (the test runtime) `window` is
// undefined, so the module-init throws before the test file even
// loads. Provide a minimal globalThis.window so the polyfill no-ops
// cleanly. Engine code under test never touches window directly —
// this only exists to keep the import side-effect safe.
const target = globalThis as { window?: unknown }
if (typeof target.window === 'undefined') {
  target.window = globalThis
}
