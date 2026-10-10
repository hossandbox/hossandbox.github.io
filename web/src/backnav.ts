/**
 * The phone's Back button (re-check M11). The app is one page, so without this Back left the app
 * entirely: from any tab, and even with a slide-up panel open, where every driver expects Back to close
 * the panel. On an Android home-screen install that closed the app.
 *
 * The app keeps its own entries on top of the page's history entry, mirroring what is open:
 *   - one entry while a tab other than Now is showing,
 *   - one more inside Plan's own screens (Split Lab, Trip, the load question),
 *   - one more while a panel is open.
 * Back then closes the panel, steps back to Plan, returns to Now, then leaves the app, in that order.
 *
 * Kept free of the DOM so it is tested with a fake history; app.tsx wires it to window.history.
 */

export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
  go(delta: number): void;
}

type Layer = 'tab' | 'sub' | 'sheet';
/** Screens reached from Plan: Back returns to Plan. */
export const PLAN_SCREENS = ['split', 'trip', 'load'];
const MARK = 'hos-sandbox';

export interface BackNav {
  /** Call after anything that can open or close a panel or change the tab. */
  sync(): void;
  /** Call from the window's popstate event. */
  onPop(): void;
}

export function createBackNav(
  h: HistoryLike,
  view: () => { tab: string; sheet: boolean },
  act: { closeSheet: () => void; goTo: (tab: 'now' | 'plan') => void },
): BackNav {
  // Entries left by an earlier page load are not ours to count: start clean on top of them.
  if ((h.state as { app?: string } | null)?.app === MARK) h.replaceState(null, '');
  const layers: Layer[] = [];
  /** History moves we started ourselves; their popstate events are not the driver pressing Back. */
  let ours = 0;

  const wanted = (): Layer[] => {
    const v = view();
    const w: Layer[] = [];
    if (v.tab !== 'now') w.push('tab');
    if (PLAN_SCREENS.includes(v.tab)) w.push('sub');
    if (v.sheet) w.push('sheet');
    return w;
  };

  const sync = () => {
    if (ours > 0) return; // a move of ours is still in flight; onPop syncs again when it lands
    const w = wanted();
    let same = 0;
    while (same < layers.length && same < w.length && layers[same] === w[same]) same++;
    if (layers.length > same) {
      // Something was closed in the app: drop our entries for it, so Back does not land on a ghost.
      const n = layers.length - same;
      layers.length = same;
      ours++;
      h.go(-n);
      return; // pushes (if any) happen after the move lands, never racing it
    }
    for (let i = same; i < w.length; i++) { h.pushState({ app: MARK, layer: w[i] }, ''); layers.push(w[i]); }
  };

  const onPop = () => {
    if (ours > 0) { ours--; sync(); return; }
    // The driver pressed Back: one of our entries is gone. Close whatever it stood for.
    layers.pop();
    const v = view();
    if (v.sheet) act.closeSheet();
    else if (PLAN_SCREENS.includes(v.tab)) act.goTo('plan');
    else if (v.tab !== 'now') act.goTo('now');
    sync();
  };

  return { sync, onPop };
}
