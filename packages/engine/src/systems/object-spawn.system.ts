import { Actor, Color, type Entity, Rectangle, type Scene, System, SystemType, vec, type World } from 'excalibur'
import {
  CollisionComponent,
  CustomDataComponent,
  ItemComponent,
  NpcComponent,
  PlacementIdComponent,
  SpawnPointComponent,
  SpriteRefComponent,
  TeleportComponent,
  TileTransformComponent,
  TriggerComponent,
} from '../components/index.ts'
import { TIER_Z } from '../components/tilemap-tier.component.ts'
import type { MapResource } from '../resource/MapResource.ts'
import { isLayerVisible } from '../services/layer-visibility.ts'
import { DEFAULT_LAYER_TIER } from '../types/data/LayerData.ts'
import type {
  ItemProperties,
  NpcProperties,
  ObjectDefinition,
  ObjectPlacement,
  SpawnPointProperties,
  TeleportProperties,
} from '../types/data/index.ts'

/**
 * Outline marker colours per object kind for sprite-less
 * placements. Picked to be visually distinct without clashing
 * with typical RPG tile palettes — light, saturated tones
 * against the natural greens / browns of a tilemap. Updates
 * to the kind set should add an entry here too; the `custom`
 * entry is the documented fallback for unknown kinds.
 */
const KIND_MARKER_COLORS: Record<ObjectDefinition['kind'], string> = {
  teleport: '#66ccff',
  item: '#ffcc33',
  npc: '#66cc66',
  'spawn-point': '#cc66ff',
  event: '#66ffcc',
  custom: '#ff9966',
}

/**
 * Walks `MapData.objectPlacements` on first scene activate and
 * constructs one Excalibur entity per placement, composed from
 * components determined by the placement's resolved
 * {@link ObjectDefinition}.
 *
 * Library reference resolution: a placement's `defId` is looked up
 * against the project's `objectLibrary`; `overrides` (when present)
 * shallow-merge on top of the resolved entry. An `inline` placement
 * carries its own definition.
 *
 * Visible objects (definition with a `sprite`) spawn as
 * `Actor` instances with the sprite attached as their primary
 * graphic; invisible ones (spawn points, collider zones,
 * spriteless events) spawn as plain `Entity`s. Either way, the
 * data-only components (`TileTransform`, `Trigger`, kind-specific
 * properties, `Collision` when blocking) are attached so the
 * downstream systems (trigger / teleport / pickup) can query them
 * by component type regardless of entity class.
 *
 * Runs **once** at scene activate. Entities persist for the
 * scene's lifetime — re-spawning is the host's responsibility
 * (typically: switch scene, the engine constructs a fresh
 * `MapScene` and a fresh spawn system).
 */
export class ObjectSpawnSystem extends System {
  public readonly systemType = SystemType.Update
  private hasRun = false

  constructor(
    private readonly mapResource: MapResource,
    private readonly objectLibrary: readonly ObjectDefinition[] = [],
  ) {
    super()
  }

  public initialize(_world: World, scene: Scene): void {
    if (super.initialize) super.initialize(_world, scene)
    if (this.hasRun) return
    this.hasRun = true
    this.spawnAll(scene)
  }

  public update(_elapsed: number): void {
    // No per-frame work — entities live on the scene from initialize() onwards.
  }

  private spawnAll(scene: Scene): void {
    const mapData = this.mapResource.mapData
    if (!mapData?.objectPlacements?.length) return

    for (const placement of mapData.objectPlacements) {
      const def = this.resolveDefinition(placement)
      if (!def) continue
      const entity = this.buildEntity(placement, def, scene)
      scene.add(entity)
    }
  }

  /**
   * Merge a placement's library reference / inline declaration with
   * any per-instance overrides. Library lookup is a linear scan —
   * cheap (libraries are tens of entries, not thousands) and avoids
   * stale Map state if the library is mutated by the editor.
   */
  private resolveDefinition(placement: ObjectPlacement): ObjectDefinition | null {
    let base: ObjectDefinition | null = null
    if (placement.inline) {
      base = placement.inline
    } else if (placement.defId) {
      base = this.objectLibrary.find((d) => d.id === placement.defId) ?? null
    }
    if (!base) return null
    const overrides = placement.overrides ?? {}
    return {
      ...base,
      ...overrides,
      // Manual spread for nested fields we want shallow-merged at one
      // level (sprite + trigger replace whole; properties replaces whole).
      sprite: overrides.sprite ?? base.sprite,
      trigger: overrides.trigger ?? base.trigger,
      properties: overrides.properties ?? base.properties,
      blocking: overrides.blocking !== undefined ? overrides.blocking : base.blocking,
    }
  }

  private buildEntity(placement: ObjectPlacement, def: ObjectDefinition, _scene: Scene): Entity {
    const mapData = this.mapResource.mapData
    const tileWidth = mapData?.tileWidth ?? 16
    const tileHeight = mapData?.tileHeight ?? 16

    // Every placement is an `Actor` now — sprite-less ones (functional
    // markers, sprite-less teleports / events / spawn points) get a
    // coloured outline marker so they're discoverable on the map.
    // Pre-refactor they were bare `Entity`s with no graphics, which
    // made them invisible in the editor and impossible to locate
    // without inspecting JSON.
    const actor = new Actor({
      name: `${def.kind}:${placement.id}`,
      x: placement.tileX * tileWidth + tileWidth / 2,
      y: placement.tileY * tileHeight + tileHeight / 2,
      width: tileWidth,
      height: tileHeight,
    })
    const entity: Entity = actor

    actor.addComponent(new TileTransformComponent(placement.tileX, placement.tileY, placement.layerId))
    actor.addComponent(new PlacementIdComponent(placement.id))

    if (def.sprite) {
      actor.addComponent(new SpriteRefComponent(def.sprite.spriteSetId, def.sprite.spriteId, def.sprite.animationId))
      this.attachSpriteGraphic(actor, def.sprite.spriteSetId, def.sprite.spriteId, def.sprite.animationId)
    } else {
      this.attachOutlineMarker(actor, def.kind, tileWidth, tileHeight)
    }

    // Z is driven by the layer's tier — placement actors render at
    // the same render depth as their tier's tilemap, so e.g.
    // decoration actors on the 'hero' tier interleave with the
    // hero-tier tilemap rather than overdrawing the entire map.
    const layer = mapData?.layers.find((l) => l.id === placement.layerId)
    actor.z = TIER_Z[layer?.tier ?? DEFAULT_LAYER_TIER]
    // Respect the layer's visibility flag at spawn. Runtime
    // toggles re-sync via `Engine.setLayerVisible`.
    if (!isLayerVisible(this.mapResource, placement.layerId)) {
      actor.graphics.visible = false
    }

    if (def.trigger) {
      entity.addComponent(new TriggerComponent(def.trigger.on, def.trigger.once ?? false, def.trigger.scriptId))
    }

    if (def.blocking === true) {
      entity.addComponent(new CollisionComponent())
    }

    // Kind-specific components. Properties is a discriminated union;
    // narrow by kind before reading typed fields.
    switch (def.kind) {
      case 'teleport': {
        const p = def.properties as TeleportProperties | undefined
        if (p?.targetMapId && typeof p.targetTileX === 'number' && typeof p.targetTileY === 'number') {
          entity.addComponent(new TeleportComponent(p.targetMapId, p.targetTileX, p.targetTileY, p.facing))
        }
        break
      }
      case 'item': {
        const p = def.properties as ItemProperties | undefined
        if (p?.itemId) {
          entity.addComponent(new ItemComponent(p.itemId, p.qty ?? 1, p.pickupSound))
        }
        break
      }
      case 'npc': {
        const p = def.properties as NpcProperties | undefined
        entity.addComponent(new NpcComponent(p?.dialogueId, p?.route, p?.facing))
        break
      }
      case 'spawn-point': {
        const p = def.properties as SpawnPointProperties | undefined
        entity.addComponent(new SpawnPointComponent(p?.spawnId ?? 'player', p?.facing))
        break
      }
      case 'event':
      case 'custom':
        // No kind-specific component; the trigger + custom bag carry intent.
        break
    }

    // Custom-data bag rides along with anything that has one.
    const custom = (def.properties as { custom?: Record<string, unknown> } | undefined)?.custom
    if (custom && Object.keys(custom).length > 0) {
      entity.addComponent(new CustomDataComponent({ ...custom }))
    }

    return entity
  }

  /**
   * Resolve the sprite via the `MapResource`'s loaded sprite-set
   * resources and attach it to the actor. Best-effort — missing
   * sprite-set / sprite logs a warning and skips graphics (the
   * entity still spawns, just invisibly). Animation lookup precedes
   * static sprite lookup.
   */
  private attachSpriteGraphic(actor: Actor, spriteSetId: string, spriteId: number, animationId?: string): void {
    const spriteSet = this.mapResource.getSpriteSetResource(spriteSetId)
    if (!spriteSet) return
    const graphic = animationId ? spriteSet.animations[animationId]?.clone() : spriteSet.sprites[spriteId]?.clone()
    if (!graphic) return
    // Center anchor so positioning by tile centre matches the tilemap layout.
    actor.graphics.use(graphic)
    actor.graphics.anchor = vec(0.5, 0.5)
  }

  /**
   * Attach a colour-coded outline rectangle to a sprite-less
   * placement actor. Used for functional markers (boundaries /
   * water triggers / camera anchors) and any other placement
   * whose `ObjectDefinition` doesn't carry a `sprite` ref —
   * without this they spawn invisibly and the user can't
   * discover them on the map.
   *
   * The rectangle covers one tile, stroked in the kind's colour,
   * with a transparent fill so the underlying tilemap stays
   * readable through the marker. Pre-refactor sprite-less
   * placements were bare `Entity`s with no graphics, which made
   * functional layers unusable without inspecting JSON.
   */
  private attachOutlineMarker(actor: Actor, kind: ObjectDefinition['kind'], width: number, height: number): void {
    const colorHex = KIND_MARKER_COLORS[kind] ?? KIND_MARKER_COLORS.custom
    const rect = new Rectangle({
      width,
      height,
      color: Color.Transparent,
      strokeColor: Color.fromHex(colorHex),
      lineWidth: 1,
    })
    actor.graphics.use(rect)
    actor.graphics.anchor = vec(0.5, 0.5)
  }
}
