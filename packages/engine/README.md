# @pixelrpg/engine

The PixelRPG engine. Wraps Excalibur.js to provide tile-based map rendering, an ECS-based editor, and a JSON map format. Runs in GJS (hosted as a GTK widget by [`@pixelrpg/gjs`](../gjs)) and in the browser (via [`@pixelrpg/game-browser`](../../apps/game-browser)).

## Exports

- `Engine` — wraps `ex.Engine`, owns the active scene and project resource
- `components/` — Excalibur Components (e.g. `MapEditorComponent` owns selection/hover/sprite-refs)
- `systems/` — Excalibur Systems (input, tile interaction)
- `scenes/` — Excalibur Scenes (`MapScene` for editing)
- `resource/` — Excalibur Resources (`GameProjectResource`, `MapResource`, `SpriteSetResource`)
- `format/` — JSON format types and validators (`MapData`, `SpriteSetData`, project shape)
- `services/` — orchestration helpers
- `types/` — shared types and event maps (`EngineStatus`, `EngineEvent`, `EngineEventMap`)
- `utils/`

## Usage

```typescript
import { Engine } from '@pixelrpg/engine'

const canvas = /* HTMLCanvasElement, e.g. from a GTK widget or DOM */
const engine = new Engine(canvas)

await engine.loadProject('/path/to/project.json')
await engine.loadMap('overworld')
await engine.start()

engine.events.on('statusChanged', (status) => console.log(status))
```

In GJS, the canvas comes from the GTK Engine widget in [`@pixelrpg/gjs`](../gjs). In the browser, the canvas is a regular `<canvas>` — see [`@pixelrpg/game-browser`](../../apps/game-browser).

## Build

```bash
yarn workspace @pixelrpg/engine run build
yarn workspace @pixelrpg/engine run check
```
