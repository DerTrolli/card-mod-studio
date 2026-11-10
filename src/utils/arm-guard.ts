/**
 * Two-step buttons (first click arms, second confirms) used to disarm on
 * blur only. Safari doesn't focus a button on click, so there it never
 * blurred and a later click on the same button deleted without asking.
 * This disarms independent of focus: on a pointerdown anywhere but the armed
 * button (window, capture — also catches presses outside the component), and
 * after a few seconds.
 */
export const DISARM_MS = 8000; // long enough for keyboard and screen-reader users

export class ArmGuard {
  private _stop?: () => void;

  constructor(private readonly _onDisarm: () => void) {}

  /** Starts watching for `button` (the armed control; unknown → any press disarms). */
  start(button?: EventTarget | null): void {
    this.stop();
    const disarm = () => {
      this.stop();
      this._onDisarm();
    };
    const onDown = (e: Event) => {
      if (button && e.composedPath?.().includes(button)) return;
      disarm();
    };
    const w = typeof window === 'undefined' ? undefined : window; // no window: timeout only
    w?.addEventListener('pointerdown', onDown, true);
    const timer = setTimeout(disarm, DISARM_MS);
    this._stop = () => {
      w?.removeEventListener('pointerdown', onDown, true);
      clearTimeout(timer);
    };
  }

  /** Stops watching (after any disarm or confirm). */
  stop(): void {
    this._stop?.();
    this._stop = undefined;
  }
}
