import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { type CharacterAnimation, type CharacterDefinition, REQUIRED_ROLES } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'

import Template from './animation-list.blp'

/** Maximum number of inline frame thumbnails shown in a row's suffix slot. */
const ROW_THUMBNAIL_CAP = 6
const ROW_THUMBNAIL_SIZE = 24

/**
 * Rendered list of a character's {@link CharacterAnimation}s. Each row
 * shows the animation id (e.g. `walk-down`), a frame-count + duration
 * suffix, and a status icon — checkmark for required-and-filled, alert
 * for required-and-empty, star for custom.
 *
 * Activating a row emits `animation-selected::<id>`. Adding a new
 * custom animation emits `add-animation-requested`. The host handles
 * the actual mutation; this widget is presentational.
 */
export class AnimationList extends Adw.Bin {
  declare _list: Gtk.ListBox
  declare _add_button: Gtk.Button

  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _rowsById = new Map<string, Adw.ActionRow>()
  private _activeId: string | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgAnimationList',
        Template,
        InternalChildren: ['list', 'add_button'],
        Signals: {
          'animation-selected': { param_types: [GObject.TYPE_STRING] },
          'add-animation-requested': {},
          // Per-row edit affordance — fires the animation id; cast
          // view opens `AddAnimationDialog` in edit mode against it.
          'edit-animation-requested': { param_types: [GObject.TYPE_STRING] },
          // Per-row delete affordance — fires the animation id. Only
          // custom animations carry it (required roles can't be
          // removed); the cast view forwards it to the controller.
          'delete-animation-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      AnimationList,
    )
  }

  constructor() {
    super()
    this._add_button.connect('clicked', () => {
      this.emit('add-animation-requested')
    })
  }

  setCharacter(character: CharacterDefinition | null, spriteSet: GdkSpriteSetResource | null = null): void {
    this._character = character
    this._spriteSet = spriteSet
    this._rebuild()
    this._applyActiveHighlight()
  }

  /** Refresh after the host mutated the underlying character (frames, duration changed). */
  refresh(): void {
    this._rebuild()
    this._applyActiveHighlight()
  }

  /**
   * Highlight the row matching `animId` with the `accent` CSS class
   * — same affordance the character gallery uses for the active
   * character. Pass `null` to clear. Idempotent: a re-call with the
   * already-active id is a no-op, so the cast-view's
   * `list-selected → preview-notify → list-highlight` round trip
   * doesn't churn the CSS classes.
   *
   * Does NOT emit `animation-selected` — only user activation does,
   * so callers driving the list from outside (preview state-change
   * notifications) can't loop back through the host's selection
   * handler.
   */
  setActiveAnimation(animId: string | null): void {
    if (this._activeId === animId) return
    this._activeId = animId
    this._applyActiveHighlight()
  }

  private _applyActiveHighlight(): void {
    for (const [id, row] of this._rowsById) {
      if (id === this._activeId) row.add_css_class('accent')
      else row.remove_css_class('accent')
    }
  }

  private _rebuild(): void {
    // Rows live in a plain `Gtk.ListBox` (`.boxed-list`) so the
    // surrounding ScrolledWindow scrolls ONLY the rows — the header
    // above + the "Add custom animation…" button below stay fixed.
    for (const row of this._rowsById.values()) {
      this._list.remove(row)
    }
    this._rowsById.clear()

    if (!this._character) return

    // Animations are owned by the SHEET now (shared across characters
    // using it); fall back to the deprecated per-character list.
    const anims = this._spriteSet?.data?.characterAnimations ?? this._character.animations ?? []

    // Required roles first (sorted by canonical order), then custom anims
    // alphabetically.
    const present = new Map(anims.map((a) => [a.id, a]))
    const requiredOrdered = REQUIRED_ROLES.map((role) => ({
      role,
      anim: present.get(role) ?? null,
    }))
    const customAnims = anims
      .filter((a) => !REQUIRED_ROLES.includes(a.id as (typeof REQUIRED_ROLES)[number]))
      .sort((a, b) => a.id.localeCompare(b.id))

    for (const { role, anim } of requiredOrdered) {
      const row = this._buildRow(role, anim, /* isCustom */ false)
      this._list.append(row)
      this._rowsById.set(role, row)
    }
    for (const anim of customAnims) {
      const row = this._buildRow(anim.id, anim, /* isCustom */ true)
      this._list.append(row)
      this._rowsById.set(anim.id, row)
    }
  }

  private _buildRow(id: string, anim: CharacterAnimation | null, isCustom: boolean): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: id,
      activatable: true,
    })

    let iconName: string
    let iconClass: string
    if (anim && anim.frames.length > 0) {
      iconName = isCustom ? 'starred-symbolic' : 'object-select-symbolic'
      iconClass = isCustom ? 'accent' : 'success'
    } else {
      iconName = 'dialog-warning-symbolic'
      iconClass = 'warning'
    }

    const prefix = new Gtk.Image({ iconName, pixelSize: 16 })
    prefix.add_css_class(iconClass)
    row.add_prefix(prefix)

    if (anim) {
      const subtitle =
        anim.frames.length === 0
          ? _('No frames')
          : `${anim.frames.length} ${anim.frames.length === 1 ? _('frame') : _('frames')} · ${anim.durationMs} ms`
      row.set_subtitle(subtitle)
    } else {
      row.set_subtitle(_('Not configured'))
    }

    // Frame thumbnails as the row suffix. Up to ROW_THUMBNAIL_CAP
    // sprite mini-pictures rendered with the aspect-preserving
    // paintable mode so even tall character sprites (16×32) keep
    // proportions inside the small square cells. Anything past the
    // cap collapses to a single "+N" badge so a long custom
    // animation doesn't overflow the row's natural width. No-op
    // when no sprite-set is wired yet — the previous chevron-free
    // row stays clean.
    if (anim && anim.frames.length > 0 && this._spriteSet) {
      row.add_suffix(this._buildThumbnailStrip(anim))
    }

    // Per-row edit affordance. Only shown when the row has a
    // configured animation — empty required-role rows are
    // "configure for the first time" territory that needs a
    // different entry point and isn't built yet. Pencil icon +
    // tooltip make it discoverable without taking a label slot.
    if (anim) {
      const editButton = new Gtk.Button({
        iconName: 'document-edit-symbolic',
        tooltipText: _('Edit animation'),
        cssClasses: ['flat', 'circular'],
        valign: Gtk.Align.CENTER,
      })
      editButton.connect('clicked', () => {
        this.emit('edit-animation-requested', id)
      })
      row.add_suffix(editButton)
    }

    // Custom animations get a trash affordance — the eight required
    // roles are part of the character contract and can't be removed
    // (their row stays delete-free; an empty required role is
    // "configure", not "delete"). Pairs with the pencil edit button.
    if (isCustom) {
      const deleteButton = new Gtk.Button({
        iconName: 'user-trash-symbolic',
        tooltipText: _('Delete animation'),
        cssClasses: ['flat', 'circular'],
        valign: Gtk.Align.CENTER,
      })
      deleteButton.connect('clicked', () => {
        this.emit('delete-animation-requested', id)
      })
      row.add_suffix(deleteButton)
    }

    row.connect('activated', () => {
      this.emit('animation-selected', id)
    })

    return row
  }

  /**
   * Build the suffix strip: an inline `Gtk.Box` carrying up to
   * `ROW_THUMBNAIL_CAP` sprite previews of the animation's frames.
   * When the animation has more frames than the cap, the last cell
   * becomes a `+N` label so the strip's natural width is bounded.
   */
  private _buildThumbnailStrip(anim: CharacterAnimation): Gtk.Box {
    const strip = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 4,
      valign: Gtk.Align.CENTER,
    })
    const visible = Math.min(anim.frames.length, ROW_THUMBNAIL_CAP)
    for (let i = 0; i < visible; i++) {
      const spriteId = anim.frames[i]
      const sprite = this._spriteSet?.getSprite(spriteId) ?? null
      const paintable = sprite?.createPaintable({ keepAspectRatio: true }) ?? null
      const picture = new Gtk.Picture({
        contentFit: Gtk.ContentFit.CONTAIN,
        canShrink: true,
        widthRequest: ROW_THUMBNAIL_SIZE,
        heightRequest: ROW_THUMBNAIL_SIZE,
      })
      picture.set_paintable(paintable)
      strip.append(picture)
    }
    if (anim.frames.length > ROW_THUMBNAIL_CAP) {
      const overflow = new Gtk.Label({
        label: `+${anim.frames.length - ROW_THUMBNAIL_CAP}`,
      })
      overflow.add_css_class('caption')
      overflow.add_css_class('dim-label')
      strip.append(overflow)
    }
    return strip
  }
}

GObject.type_ensure(AnimationList.$gtype)
