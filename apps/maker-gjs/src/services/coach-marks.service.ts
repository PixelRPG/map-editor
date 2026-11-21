import type Gio from '@girs/gio-2.0'
import type { CoachStore } from '@pixelrpg/gjs'

/**
 * Which first-run tips this person has already been shown (GSettings key
 * `coach-marks-seen`, a list of step ids). A fact about the person, not the
 * project: it follows them to every game and is never shared. Falls back to
 * an in-memory list when the schema is unavailable, so every launch of an
 * unpackaged build shows the tips again (with a warning). Same shape as
 * `EditorDefaultsService`.
 */
export class CoachMarksService implements CoachStore {
  private settings: Gio.Settings | null = null
  private fallback: string[] = []

  /** Call once from Application startup with the app's shared `Gio.Settings`. */
  init(settings: Gio.Settings | null): void {
    this.settings = settings
    if (!settings) {
      console.warn('[CoachMarksService] GSettings schema not found — tips will not persist')
    }
  }

  private get seen(): string[] {
    return this.settings ? this.settings.get_strv('coach-marks-seen') : this.fallback
  }

  isSeen(id: string): boolean {
    return this.seen.includes(id)
  }

  markSeen(id: string): void {
    if (this.isSeen(id)) return
    this.write([...this.seen, id])
  }

  /** "Show tips again". */
  reset(): void {
    this.write([])
  }

  private write(ids: string[]): void {
    if (this.settings) this.settings.set_strv('coach-marks-seen', ids)
    else this.fallback = ids
  }
}
