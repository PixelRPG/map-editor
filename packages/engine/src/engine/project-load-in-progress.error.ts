/**
 * A project load was requested while another one was still running.
 *
 * Two overlapping `excalibur.start()` calls on one Excalibur engine
 * deadlock — the second overwrites `Engine._loader` while the first is
 * mid-`load()`, and neither `Loader.load()` ever reaches its `afterload`
 * event. No map gets loaded, nothing throws, and every caller waits
 * forever. Refusing the second call turns that into an error a host can
 * report, which is why this exists rather than a silent no-op.
 *
 * Hosts should not need to catch it: serialise bring-up instead (the
 * maker's `EngineController` queues `ensureForMap`). Seeing this thrown
 * means two code paths are loading projects concurrently.
 */
export class ProjectLoadInProgressError extends Error {
  constructor(readonly projectPath: string) {
    super(`Cannot load "${projectPath}": another project load is still in progress`)
    this.name = 'ProjectLoadInProgressError'
  }
}
