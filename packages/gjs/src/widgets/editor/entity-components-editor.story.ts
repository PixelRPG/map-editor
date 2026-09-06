import GObject from '@girs/gobject-2.0'
import type { EntityDefinition } from '@pixelrpg/engine'
import { ControlType, type StoryArgs, type StoryMeta, type StoryModule, StoryWidget } from '@gjsify/storybook'
import { EntityComponentsEditor } from './entity-components-editor'

const SAMPLE_ENTITIES: Record<string, EntityDefinition> = {
  npc: {
    id: 'guard',
    name: 'Town Guard',
    components: [
      { type: 'visual', spriteSetId: 'people', spriteId: 0, animationId: 'idle-down' },
      { type: 'movement', tilesPerSec: 3 },
      { type: 'dialogue', dialogueId: 'guard-intro' },
      { type: 'trigger', on: 'action-button' },
    ],
    editorData: { template: 'npc' },
  },
  teleport: {
    id: 'cave-door',
    name: 'Cave Entrance',
    components: [
      { type: 'trigger', on: 'walk-onto' },
      { type: 'teleport', targetMapId: 'cave', targetTileX: 4, targetTileY: 9, facing: 'down', label: 'Cave' },
    ],
    editorData: { template: 'teleport' },
  },
  item: {
    id: 'apple',
    name: 'Apple',
    components: [
      { type: 'visual', spriteSetId: 'overworld', spriteId: 4 },
      { type: 'item', itemId: 'apple', qty: 1 },
      { type: 'trigger', on: 'walk-onto' },
    ],
    editorData: { template: 'item' },
  },
  // Hidden content for the Simple-view row: a script (1) + custom data
  // (1) + `trigger.once` (1) → "Show 3 more settings".
  door: {
    id: 'locked-door',
    name: 'Locked Door',
    components: [
      { type: 'visual', spriteSetId: 'overworld', spriteId: 9 },
      { type: 'collision' },
      { type: 'trigger', on: 'action-button', once: true },
      { type: 'actions', actions: [{ id: 'a-text', type: 'show-text', text: 'Locked.' }] },
      { type: 'script', scriptId: 'door-check' },
      { type: 'custom-data', data: { key: 'brass' } },
    ],
    editorData: { template: 'door' },
  },
}

/** Showcase for the generated all-components editor. */
export class EntityComponentsEditorStory extends StoryWidget {
  private _editor: EntityComponentsEditor | null = null

  static {
    GObject.registerClass({ GTypeName: 'EntityComponentsEditorStory' }, EntityComponentsEditorStory)
  }

  constructor() {
    super({
      story: 'Default',
      args: { sample: 'npc', fullView: true },
      meta: EntityComponentsEditorStory.getMetadata(),
    })
  }

  static getMetadata(): StoryMeta {
    return {
      title: 'Editor/Entity Components Editor',
      description:
        'The components editor: one generated ComponentInspector per component (rows derived from the field DSL) + an "Add component" menu. Simple view filters to the basic subset and counts the rest into a "Show N more settings" row. Emits the whole EntityDefinition as JSON on every edit.',
      component: EntityComponentsEditor.$gtype,
      controls: [
        {
          name: 'sample',
          label: 'Sample entity',
          type: ControlType.SELECT,
          options: [
            { value: 'npc', label: 'NPC (visual + movement + dialogue + trigger)' },
            { value: 'teleport', label: 'Teleport (trigger + teleport)' },
            { value: 'item', label: 'Item (visual + item + trigger)' },
            { value: 'door', label: 'Locked door (script + custom data + once → 3 hidden)' },
          ],
        },
        {
          name: 'fullView',
          label: 'Full view',
          type: ControlType.BOOLEAN,
        },
      ],
    }
  }

  initialize(): void {
    this._editor = new EntityComponentsEditor()
    this._editor.setRefOptions({
      maps: [
        { value: 'cave', label: 'Cave' },
        { value: 'overworld', label: 'Overworld' },
      ],
      appearances: [
        { value: 'people', label: 'People' },
        { value: 'overworld', label: 'Overworld' },
      ],
    })
    this._applySample()
    this.addContent(this._editor)
  }

  updateArgs(_args: StoryArgs): void {
    this._applySample()
  }

  private _applySample(): void {
    if (!this._editor) return
    const key = typeof this.args.sample === 'string' ? this.args.sample : 'npc'
    this._editor.fullView = this.args.fullView !== false
    this._editor.setEntity(SAMPLE_ENTITIES[key] ?? SAMPLE_ENTITIES.npc)
  }
}

GObject.type_ensure(EntityComponentsEditorStory.$gtype)

export const EntityComponentsEditorStories: StoryModule = { stories: [EntityComponentsEditorStory] }
