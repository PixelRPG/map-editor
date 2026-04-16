# @pixelrpg/story-gjs

Storybook-style framework for GTK widgets. Provides a registry, story-widget base class, and control-types so widget consumers can register interactive stories that render in a host application like [`@pixelrpg/storybook-gjs`](../../apps/storybook-gjs).

Originally built for PixelRPG, but designed to be reusable for other GTK/GJS projects in the future.

## Exports

- `StoryWidget` — abstract base (`Adw.Bin` subclass) for individual story implementations
- `StoryModule` — groups stories and registers them with the registry
- `StoryRegistry` / `registry` — central registry instance, queried by the storybook host
- `StoryRegistryService` — service wrapper used by host applications
- `ControlType` — enum for control kinds (`number`, `string`, `boolean`, `select`)
- types under `types/` (`StoryMeta`, control types) and helpers under `utils/`

## Usage

A widget defines a story by extending `StoryWidget` and registering it via a `StoryModule`:

```typescript
import { StoryWidget, StoryMeta, StoryModule, ControlType } from '@pixelrpg/story-gjs'

class MyButtonStory extends StoryWidget {
  static getMetadata(): StoryMeta {
    return {
      title: 'UI/Button',
      component: MyButton.$gtype,
      controls: {
        label: { type: ControlType.String, default: 'Click me' },
        size:  { type: ControlType.Number, default: 100, min: 50, max: 200 },
      },
    }
  }
}

GObject.type_ensure(MyButtonStory.$gtype)

export const buttonStories = new StoryModule([MyButtonStory])
```

The host application collects modules via `registry` and renders them. See [`apps/storybook-gjs`](../../apps/storybook-gjs) for a working example.

## Build

```bash
yarn workspace @pixelrpg/story-gjs run build
yarn workspace @pixelrpg/story-gjs run check
```
