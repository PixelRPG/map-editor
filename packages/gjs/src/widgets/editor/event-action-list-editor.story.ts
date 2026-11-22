import GObject from '@girs/gobject-2.0'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import type { ActionData, ComponentData } from '@pixelrpg/engine'
import { EventActionListEditor } from './event-action-list-editor'

const SAMPLE_ACTIONS: Record<string, ActionData[]> = {
  chest: [
    { id: 'give-item-1', type: 'give-item', itemId: 'potion', qty: 2 },
    { id: 'set-flag-1', type: 'set-flag', flag: 'chest-opened', value: true },
    { id: 'play-sfx-1', type: 'play-sfx', sound: 'chime' },
  ],
  sign: [{ id: 'show-text-1', type: 'show-text', text: 'Kokiri Village — no Deku allowed.', speaker: 'Sign' }],
  door: [{ id: 'teleport-1', type: 'teleport', targetMapId: 'cave', targetTileX: 4, targetTileY: 9, facing: 'down' }],
  ask: [
    {
      id: 'ask-1',
      type: 'ask',
      prompt: 'Want to rest?',
      options: [
        {
          id: 'ask-1-opt-1',
          label: 'Yes',
          actions: [{ id: 'set-flag-1', type: 'set-flag', flag: 'rested', value: true }],
        },
        { id: 'ask-1-opt-2', label: 'No', actions: [] },
      ],
      cancelOptionId: 'ask-1-opt-2',
    },
  ],
  empty: [],
}

/** Showcase for the friendly per-action event editor. */
export class EventActionListEditorStory extends StoryWidget {
  private _editor: EventActionListEditor | null = null

  static {
    GObject.registerClass({ GTypeName: 'EventActionListEditorStory' }, EventActionListEditorStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { sample: 'chest' },
      meta: EventActionListEditorStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Event Action List Editor',
      description:
        'Friendly editor for an entity’s ordered actions list (the event body). Each action is an expander row with inline fields, reordered with up/down and removed with the trash button; "Add action" appends a default of the chosen type. Emits the whole { type:"actions", actions } ComponentData as JSON on every change — the drop-in for the raw JSON field in the Objects detail.',
      component: EventActionListEditor.$gtype,
      controls: [
        {
          name: 'sample',
          label: 'Sample event',
          type: ControlType.SELECT,
          options: [
            { value: 'chest', label: 'Chest (give-item + set-flag + play-sfx)' },
            { value: 'sign', label: 'Sign (show-text)' },
            { value: 'door', label: 'Door (teleport)' },
            { value: 'ask', label: 'Question (ask with two answers)' },
            { value: 'empty', label: 'Empty (no actions)' },
          ],
        },
      ],
    }
  }

  initialize(): void {
    this._editor = new EventActionListEditor()
    this._editor.setRefOptions({
      maps: [
        { value: 'cave', label: 'Cave' },
        { value: 'overworld', label: 'Overworld' },
      ],
    })
    this._editor.setRemovable(true)
    this._applySample()
    this.addContent(this._editor)
  }

  updateArgs(_args: StoryArgs): void {
    this._applySample()
  }

  private _applySample(): void {
    if (!this._editor) return
    const key = typeof this.args.sample === 'string' ? this.args.sample : 'chest'
    const actions = SAMPLE_ACTIONS[key] ?? SAMPLE_ACTIONS.chest
    this._editor.setData({ type: 'actions', actions } satisfies ComponentData)
  }
}

GObject.type_ensure(EventActionListEditorStory.$gtype)

export const EventActionListEditorStories: StoryModule = { stories: [EventActionListEditorStory] }
