#!/bin/sh
# Point @gjsify/event-bridge at a local gjsify checkout.
#
# Touch input on the canvas needs gjsify #1591 ("a finger is a pointer
# too"), which is NOT in the published 0.48.0 — that tarball ships no
# touch code at all, so a finger can press and release but never drag,
# and the map cannot be panned. Until a release carries it, link the
# package from source.
#
# Re-run this after every `gjsify install`: the installer restores the
# registry copy and silently drops the links.
#
# Both locations must be linked. `gjsify install` hoists most packages
# to the root but leaves `packages/gjs` its own nested copy, and that
# nested one is what `@pixelrpg/gjs` resolves — link only the root and
# the build still picks up the touch-less copy.
set -eu

GJSIFY_SRC="${GJSIFY_SRC:-$HOME/Projects/werkstatt/gjsify/gjsify}"
PKG="$GJSIFY_SRC/packages/framework/event-bridge"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

[ -d "$PKG" ] || { echo "no gjsify checkout at $GJSIFY_SRC (set GJSIFY_SRC)" >&2; exit 1; }
[ -f "$PKG/lib/esm/touch-pointers.js" ] || {
  echo "build it first: (cd $GJSIFY_SRC && gjsify workspace @gjsify/event-bridge build)" >&2; exit 1; }

for dir in "$REPO/node_modules/@gjsify" "$REPO/packages/gjs/node_modules/@gjsify"; do
  [ -d "$dir" ] || continue
  # Keep the registry copy the first time, so unlinking is a plain `mv` back.
  if [ -e "$dir/event-bridge" ] && [ ! -L "$dir/event-bridge" ] && [ ! -e "$dir/event-bridge.npm-0.48.0" ]; then
    mv "$dir/event-bridge" "$dir/event-bridge.npm-0.48.0"
  fi
  rm -rf "$dir/event-bridge"
  # COPY, don't symlink. A symlink makes Node resolve the package's own
  # imports from the gjsify checkout, so `@gjsify/dom-events` comes from
  # there too — and that copy pulls `dom-exception`, which this project
  # does not have. The build then dies in
  # `gjsify-unresolved-workspace-import`. Copying keeps resolution inside
  # this repo, where dom-events 0.48.0 already carries every field the
  # touch translator uses.
  mkdir -p "$dir/event-bridge"
  cp -R "$PKG/lib" "$dir/event-bridge/lib"
  cp "$PKG/package.json" "$dir/event-bridge/package.json"
  echo "copied $PKG -> $dir/event-bridge"
done

echo "now rebuild: gjsify workspace @pixelrpg/gjs build && gjsify workspace @pixelrpg/maker-gjs build"
