# @pixelrpg/gjs

GTK4/libadwaita widgets for the PixelRPG map editor. Hosts the [`@pixelrpg/engine`](../engine) inside a GTK widget alongside the editor's UI panels (tileset selector, layers, tools).

Also provides a Gdk-side preview pipeline (`Sprite`, `SpriteSheet`, `ImageTexture`) for rendering sprites in plain GTK widgets via the Gsk snapshot API — distinct from Excalibur's canvas pipeline, both coexist.

## Exports

- `widgets/engine` — GTK widget that hosts the engine's `<canvas>` and forwards GTK pointer events
- `widgets/map-editor` — `MapEditorPanel`, `LayerSelector`, `TilesetSelector`
- `widgets/sprite` — `SpriteWidget`, `SpriteSheetWidget` (Gdk-rendered)
- `sprite/` — preview-pipeline primitives: `Sprite`, `SpriteSheet`, `ImageTexture`
- `stories.ts` — Storybook story registrations for the above (consumed by `@pixelrpg/storybook-gjs`)

## Usage

```typescript
import { Engine, MapEditorPanel } from '@pixelrpg/gjs'

const window = new Adw.ApplicationWindow({ application })
const engine = new Engine()
const editor = new MapEditorPanel({ engine })
window.set_content(editor)
```

CSS: import `@pixelrpg/gjs/index.css` from your application's stylesheet. Lowering of CSS Nesting (`&:hover`) for the GTK CSS parser is handled by gjsify's CSS plugin at build time.

## Build

```bash
yarn workspace @pixelrpg/gjs run build
yarn workspace @pixelrpg/gjs run check
```

## Related

- [`@pixelrpg/engine`](../engine) — the engine being hosted
- [`@pixelrpg/story-gjs`](../story-gjs) — Storybook framework used by this package's `.story.ts` files
