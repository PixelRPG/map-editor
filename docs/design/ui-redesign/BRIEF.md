# UI redesign brief — PixelRPG Maker (2026-11-13)

Handoff for the designer. Repo state: `main` @ `68c667cc` (GNOME 51 runtime, gjsify 0.54).

**Revision 2 (2026-11-14):** the `oot2d-2014` and `minimalist-starter` examples were removed
(oot2d rendered wrongly). The only bundled example is now `games/zelda-like`
("Kokiri Forest": 3 maps — Kokiri Forest 176×148, Link's Tree House, a cozy variant — 16 px
tiles, teleports between them). `games/blank-starter` remains as the New Project seed. All
baseline screenshots were recaptured on it.

## What the product is

PixelRPG Maker (`apps/maker-gjs`, app id `org.pixelrpg.maker`) is a GTK4 / libadwaita
tile-based RPG maker for GNOME — "inspired by RPG Maker, designed to be more modern".
A user builds a top-down 2D adventure: paints maps from tilesets, places characters and
things on them, wires teleports between maps, and plays the result inside the editor.
Excalibur.js runs in-process (no WebView); the map canvas is a live game engine.

## Goals and ideas (what the project has decided so far)

1. **For a child first, without capping the expert.** The UI vocabulary is "chosen for the
   child" (`docs/concepts/README.md` § UI words): World, Map, Library, Characters, Things,
   Graphics, Game. A *Simple view* / *Full view* switch (`app.full-view`, GSettings `ui-tier`)
   hides expert settings; "Show N more settings" rows disclose them in place. The keyboard
   (V B G E I O tools, `+ - Ctrl+0` zoom, shortcuts dialog) is the expert's fast path.
2. **Map-first canvas.** Chrome over the map is measured and minimised (desktop 6.5 % of
   pixels, phone ~4.5 %). Floating OSD pills, not header bars, on canvas views; nothing may
   turn paintable map into a window-drag region. Undo is reachable at every width;
   the armed tool is always nameable (brush badge: tool · tile · layer).
3. **One app from phone to desktop.** libadwaita breakpoints, three tiers
   (phone ≈360–400 px, tablet ≈768, desktop ≥1280). Sidebars collapse to drawers; on phone
   the scene editor docks a bottom bar + `Adw.BottomSheet` (Brush page) under the canvas.
   Full rules: `docs/concepts/responsive-chrome.md`.
4. **Edit while playing (Mario-Maker style).** Editor / Live Run / Full Run modes
   (`docs/concepts/runtime-modes.md`). Play FAB; during a run the chrome steps back and the
   context pill becomes Stop · Restart.
5. **Together by default.** Live pair-editing over WebRTC (LAN discovery, cursors, presence
   colours) and an in-process AI collaborator that appears as just another participant
   (roster chip, pause). Presence is first-class UI, not a debug feature.
6. **Content model = composition.** Things are entity definitions with `components[]` and
   registry-generated inspectors; switchable *game systems* (combat, inventory, …) decide
   which components exist (`docs/concepts/game-systems.md`, `entity-and-appearance-model.md`).
   The inspector UI is therefore generated, and the design must work for arbitrary component
   forms, not a fixed set.
7. **Real product, GNOME-native.** Flathub quality, gettext (en + de), GNOME HIG, Blueprint +
   libadwaita widgets only, Adwaita CSS variables. Exported games target browser and later
   consoles.

## Information architecture today

- **Welcome**: template cards with live map previews + recents (Open Recent in primary menu).
- Rail with three rows:
  - **World**: the *atlas* (every map as a card on a pannable surface) → double-click opens
    the **map editor** ("‹ World" goes back). Map editor: left sidebar = library drawer,
    right = inspector with tabs Tiles · Layers · Objects · Props; tools Select, Paint, Fill,
    Erase, Pick, Object; Play.
  - **Library**: chips Characters · Things · Graphics (Graphics only in Full view);
    gallery → detail (Character detail: animated preview with direction pad, stat cards,
    "Place on map", properties).
  - **Game**: project name, tile settings, game rules / systems.

## Known gaps and wishes (from `TODO.md` and the screenshot notes)

- Phone: bottom sheet has only the Brush page — a "Selected" page (properties of the tapped
  placement) is designed but missing; the right inspector on phone is a near-full-width
  overlay leaving an 80 px map sliver (see `baseline/phone/08-*`).
- No pinch-to-zoom / two-finger pan on touch; zoom on phone is menu-only.
- Live Run on phone is watch-only: no virtual joystick + action button.
- Atlas is not truly zoomable, opens at 200 %; teleport connections ARE drawn as dashed
  arcs with name labels (see `baseline/desktop/02-*`) but labels overlap and cluster;
  "New map" is a placeholder.
- Library: sparse master-detail on desktop; Things empty state undesigned; ownership between
  Things / Characters / Graphics / Game still blurry; tileset thumbnails unreadable at card size.
- No layer rename/duplicate/delete UI; per-tile collision is a single "Solid" switch;
  animation timeline editor is minimal.
- No starter tileset collection in the brush sheet ("so a child can start without importing").
- Game view is one long column of preference groups.

## Ignore in the screenshots

The purple avatar chip in the map editor is the automation joining as AI collaborator.
The "Loading project…" toast on phone Library is a capture artifact.

## Screenshots (`zelda-like` sample, Kokiri Forest map)

`baseline/{desktop 1280×800, tablet 768×1024, phone 400×880}/`:
01 welcome · 02 world atlas · 03 library characters · 04 library things ·
05 library graphics (Full view) · 06 game · 07 map editor · 08 inspector toggled ·
09 library drawer toggled · 10 map editor Full view · 11 playing.
Older baselines + the chrome before/after series: `docs/screenshots/`.

## The ask

Redesign — improve AND complete — the UI as a modern adaptive mobile/desktop app in
libadwaita, borrowing proven iOS and Android patterns where Adwaita has an equivalent
(bottom sheets with detents, bottom navigation on phone, FAB, contextual action bars,
swipe-back, long-press menus, pinch/pan, edge-to-edge canvas, haptic-style feedback via
motion), minimalist and refined. Phone must be genuinely usable with thumbs, one-handed
where possible — not a squeezed desktop.
