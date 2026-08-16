/**
 * config-echo.ts — the "own echo" guard shared by cms-panel and
 * cms-child-card-section.
 *
 * Both components emit config-changed events upward and then receive the
 * updated config back down as a property. Rebuilding editor state from that
 * reflected echo mid-edit would wipe in-progress UI state, so each keeps
 * the JSON of the last config it emitted and skips the rebuild when the
 * incoming config matches it.
 *
 * The subtle part (the bug this class fixes): the stored baseline must
 * advance whenever a DIFFERENT, external config arrives and the state IS
 * rebuilt from it. With a never-advancing baseline, this sequence went
 * wrong: emit A → external change to B (rebuilt, but baseline still A) →
 * external revert to exactly A → guard falsely matched the stale baseline
 * and skipped the rebuild, leaving stale B-derived editor state on a card
 * whose config is A. Once rebuilt from an incoming config, that config IS
 * the new "last known" baseline, so shouldRebuild() records it.
 */
export class ConfigEchoGuard {
  private _lastJson: string | null = null;

  /** Record the config JSON this component just emitted — the reflected
   *  echo of exactly this JSON must not trigger a rebuild. */
  noteEmitted(json: string): void {
    this._lastJson = json;
  }

  /** Config went away entirely — forget the baseline. */
  reset(): void {
    this._lastJson = null;
  }

  /**
   * Called with each incoming config's JSON. Returns false for our own
   * echo (JSON identical to the last known baseline). Returns true when
   * the editor state must be rebuilt — and advances the baseline to the
   * incoming JSON, so a later revert to a previously-emitted config is
   * correctly treated as a fresh external change, not mistaken for an echo.
   */
  shouldRebuild(incomingJson: string): boolean {
    if (incomingJson === this._lastJson) return false;
    this._lastJson = incomingJson;
    return true;
  }
}
