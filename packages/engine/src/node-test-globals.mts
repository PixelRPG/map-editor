// The `window` global that excalibur's module-init polyfill requires, and only
// that. Import it as the FIRST import of a package's `test.mts`.
//
// WHY a module of its own: excalibur's `polyfill()` runs while its own module
// body evaluates and ASSIGNS to the bare identifier `window` when it finds none
// (`excalibur/build/esm/excalibur.development.js`, top of file):
//
//     if (typeof window === "undefined") { window = { audioContext() {} } }
//
// An ES module body is always strict, so assigning to an undeclared identifier
// is a `ReferenceError` and the whole bundle dies at load with `ReferenceError:
// window is not defined` before a single spec runs. Node has no `window`, so the
// branch is taken. It never was on GJS: `gjs/global.cpp` defines `window` on
// every global as a non-configurable alias of it.
//
// This cannot be written into `test.mts` itself. ESM evaluates the body of every
// imported module BEFORE the importing module's body, so a shim written there
// lands after excalibur's body in the bundle and never runs in time — which is
// exactly what the inline shim this replaces did, silently, for as long as it
// was there. Being the entry's first import is what puts this module's body
// first in the emitted module order.
//
// UPSTREAM: excalibur should not assign to an undeclared `window`; that branch
// cannot work in any strict-mode host. Tracked in PixelRPG/map-editor#300.
const target = globalThis as { window?: unknown }
if (target.window === undefined) {
  target.window = globalThis
}
