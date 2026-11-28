/**
 * Session-only "Pick your ELD" offline help flow rendered inside the Refresh from ELD screenshot
 * sheets (QuickStartSheet and DriftSheet). Never persists the driver's choice to storage and never
 * links outside the app.
 */
import { useState } from 'preact/hooks';
import {
  ELD_GUIDES,
  DISCONTINUED_NOTE,
  filterEldGuides,
  matchesDiscontinuedEld,
  type EldGuide,
} from './eldguides.ts';

export function EldGuideFlow({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<EldGuide | null>(null);

  if (picked) {
    return (
      <div class="eld-guide-detail" data-eld-guide-detail={picked.id} data-eld-guide-kind={picked.kind}>
        <div class="eld-guide-detail-head">
          <button
            type="button"
            class="link eld-guide-back"
            data-eld-guide-back-list="1"
            data-first
            onClick={() => setPicked(null)}
          >
            ← All ELDs
          </button>
          <span class="muted small">{picked.app}</span>
        </div>
        <h3 class="eld-guide-title">{picked.name}</h3>
        {picked.notice && (
          <p
            class="warnbox small"
            role="note"
            data-eld-guide-notice="1"
            data-eld-no-phone-graph={picked.noPhoneGraph ? '1' : undefined}
          >
            {picked.notice}
          </p>
        )}
        <div class="eld-guide-screen-note" data-eld-which-screen="1" data-eld-split={picked.splitScreen ? '1' : undefined}>
          <b>Which screen to screenshot</b>
          <p class="small" style="margin:4px 0 0">{picked.whichScreen}</p>
        </div>
        <ol class="eld-guide-steps" data-eld-guide-steps="1">
          {picked.steps.map((step, idx) => (
            <li key={idx}>{step}</li>
          ))}
        </ol>
        <p class="small eld-guide-day" data-eld-switch-day="1">
          <b>Change the day:</b> {picked.switchDay}
        </p>
        {picked.caveat && (
          <p class="muted small" data-eld-guide-caveat="1">{picked.caveat}</p>
        )}
        <div class="row">
          <button type="button" class="primary wide" data-eld-guide-return="1" onClick={onDone}>
            Back to screenshot
          </button>
        </div>
      </div>
    );
  }

  const list = filterEldGuides(query);
  const showDiscontinued = matchesDiscontinuedEld(query);

  return (
    <div class="eld-guide-picker" data-eld-guide-picker="1">
      <p class="small" style="margin:0 0 8px">
        Pick your ELD for step-by-step taps to the screen Clock 14 reads (your four countdown clocks: Drive, Shift, Break, Cycle). Everything works offline.
      </p>
      <input
        type="search"
        class="eld-guide-search"
        data-eld-guide-search="1"
        data-first
        aria-label="Search your ELD"
        placeholder="Search your ELD (e.g., Samsara, Motive, Geotab…)"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      {showDiscontinued && (
        <p class="warnbox small" role="note" data-eld-discontinued="1">{DISCONTINUED_NOTE}</p>
      )}
      <div class="eld-guide-list" role="list" data-eld-guide-list="1" data-eld-total={String(ELD_GUIDES.length)}>
        {list.map((g) => (
          <button
            key={g.id}
            type="button"
            class={`rowbtn eld-guide-row${g.kind === 'generic' ? ' is-generic' : ''}`}
            data-eld-item={g.id}
            data-eld-kind={g.kind}
            onClick={() => setPicked(g)}
          >
            <span>
              <b>{g.name}</b>
              <br />
              <span class="muted small">{g.app}</span>
            </span>
            <span class="eld-guide-chev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <p class="muted small" style="margin:8px 0 6px">
        ELD on a dash-mounted cab tablet? Use your carrier’s phone app if you have one, snap a straight-on photo of the screen, or type your 4 clocks manually.
      </p>
      <div class="row">
        <button type="button" class="ghost wide" data-eld-guide-return="1" onClick={onDone}>
          Back to screenshot
        </button>
      </div>
    </div>
  );
}
