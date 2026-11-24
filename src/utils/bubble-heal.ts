/**
 * bubble-heal.ts — repairs a card-mod / UIX race with Bubble Card on the
 * dashboard (found in the 1.0.0 review, measured 2026-11-23).
 *
 * On some page loads the style engine attaches its element to a Bubble card
 * before Bubble has created its shadow root, so the element lands in the
 * card's light DOM, where its styles can't reach Bubble's parts: the card
 * shows unstyled, and a later save in the card editor (which only updates
 * that element) changes nothing on the dashboard until the page is reloaded.
 * Measured with Bubble Card 3.4.3 on Home Assistant 2026.11.0 with card-mod
 * 4.2.1 (about 1 load in 10 to 1 in 3 on a busy dashboard, with and without
 * the Studio) and with UIX 9.0.0, and on 2026.2.3 with card-mod 4.2.1; not
 * seen with card-mod 3.4.5 on 2025.9.4, which attaches differently.
 *
 * The repair moves the engine's own element into the card's shadow root —
 * where the engine puts it on every other load — and touches nothing else:
 * no other card type, no card without that misplaced element, nothing inside
 * the card editor dialog (its preview cards are the editor's own). It does
 * nothing at all when Bubble Card isn't installed.
 */

/** The element each engine attaches to a card. */
const ENGINE_TAGS = new Set(['CARD-MOD', 'UIX-NODE']);
/** Subtrees left alone: the card editor dialog and its preview. */
const SKIP_TAGS = new Set(['HUI-DIALOG-EDIT-CARD', 'HUI-DIALOG-EDIT-SECTION', 'CMS-PANEL']);

/**
 * Moves a misplaced engine element of every Bubble card under `root` into
 * the card's shadow root. Returns how many it moved.
 */
export function healBubbleCards(root: ParentNode = document): number {
  let moved = 0;
  const stack: ParentNode[] = [root];
  for (let node = stack.pop(); node; node = stack.pop()) {
    for (const el of Array.from(node.children)) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.localName === 'bubble-card' && el.shadowRoot) {
        for (const child of Array.from(el.children)) {
          if (ENGINE_TAGS.has(child.tagName)) {
            el.shadowRoot.appendChild(child);
            moved++;
          }
        }
      }
      stack.push(el);
      if (el.shadowRoot) stack.push(el.shadowRoot);
    }
  }
  return moved;
}

/** Delays (ms) at which the dashboard is checked after a page load, a
 *  navigation or the card editor closing: cards render over a few seconds. */
const AFTER_LOAD = [1500, 4000, 8000, 15000];
const AFTER_CHANGE = [500, 2000, 5000];

let started = false;

/**
 * Starts the checks. Called once from the entry point; idempotent. The
 * dashboard is checked a few times after the page loads, after each
 * navigation (`location-changed`) and after a dialog closes (a save in the
 * card editor) — never continuously.
 */
export function startBubbleHeal(win: Window = window): void {
  if (started) return;
  started = true;
  const run = () => {
    // Nothing to do (and nothing walked) without Bubble Card.
    if (!win.customElements.get('bubble-card')) return;
    try {
      const n = healBubbleCards(win.document);
      if (n) console.info(`[Card Style Studio] Re-attached the style of ${n} Bubble card(s) that loaded before their style engine.`);
    } catch {
      /* a check must never break the dashboard */
    }
  };
  const schedule = (delays: number[]) => delays.forEach((ms) => win.setTimeout(run, ms));
  schedule(AFTER_LOAD);
  win.addEventListener('location-changed', () => schedule(AFTER_CHANGE));
  win.addEventListener('dialog-closed', () => schedule(AFTER_CHANGE));
}
