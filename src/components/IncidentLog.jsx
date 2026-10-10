import { memo, useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

/**
 * Raw incident log, virtualized.
 *
 * WHY NOT A <table>: 5,000 rows x 9 elements each is tens of thousands of DOM nodes. Mounting
 * them blocks the main thread for seconds, every re-render diffs all of them, and scrolling
 * makes the browser lay out and paint the lot. Here, only the rows intersecting the viewport
 * (plus a few extra) exist in the DOM. They sit inside a spacer that is as tall as the FULL
 * list, so the scrollbar still behaves as though every row were there. Memory and render cost
 * stay flat whether the list holds 5,000 rows or 500,000.
 */

// Every row is the same height, so the virtualizer finds any row's position with plain
// arithmetic (index x height). Variable heights would force it to measure rows in the DOM.
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 40;

// Extra rows rendered above and below the viewport so fast scrolling never shows a blank gap.
const OVERSCAN = 8;

// Header and rows share one grid template so their columns line up without a real <table>.
const GRID =
  'grid grid-cols-[11rem_5rem_6.5rem_5.5rem_5.5rem_6.5rem_minmax(6rem,1fr)] items-center gap-x-3 px-4';

// Creating an Intl.DateTimeFormat is slow, and Date#toLocaleString() creates a new one on every
// call. Build it once at module level and reuse it for every row.
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
});

const estimateRowSize = () => ROW_HEIGHT;

// memo(): scrolling re-renders the list whenever the visible window moves by a row. Because
// Row only receives primitives plus an incident object that never changes identity, React
// skips every row that was already on screen and mounts just the one or two that entered.
const Row = memo(function Row({ incident, index, top }) {
  const critical = incident.alertLevel === 'CRITICAL';

  return (
    <div
      role="row"
      aria-rowindex={index + 2} // row 1 is the header
      className={`${GRID} absolute top-0 left-0 w-full border-b border-b-rule border-l-4 text-sm tabular-nums ${
        critical
          ? 'border-l-critical bg-critical-wash text-critical-ink'
          : 'border-l-caution bg-panel text-ink'
      }`}
      // transform (not `top`) moves the row: it runs on the compositor, so scrolling never
      // triggers layout for the rest of the page.
      style={{ height: ROW_HEIGHT, transform: `translateY(${top}px)` }}
    >
      {/* Formatting happens here, for the ~25 visible rows only, rather than up front for all 5,000. */}
      <div role="cell">{timeFormat.format(new Date(incident.timestamp))}</div>
      <div role="cell" className="font-semibold">
        {incident.bedId}
      </div>
      <div role="cell">{incident.patientId}</div>
      <div role="cell" className="text-right">
        {incident.heartRate}
      </div>
      <div role="cell" className="text-right">
        {incident.spo2}
      </div>
      <div role="cell" className="text-right">
        {incident.bloodPressure}
      </div>
      <div role="cell">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            critical ? 'bg-critical text-white' : 'bg-caution-wash text-caution-ink'
          }`}
        >
          {critical ? 'Critical' : 'Warning'}
        </span>
      </div>
    </div>
  );
});

function IncidentLog({ incidents, busy = false, truncated = false }) {
  const scrollRef = useRef(null);

  // Stable identity: the virtualizer rebuilds its whole measurement table whenever this
  // function changes, which would otherwise mean re-walking 5,000 entries on every render.
  // Keying rows by incident id (not array index) also lets React reuse DOM nodes correctly
  // when the list is replaced.
  const getItemKey = useCallback((index) => incidents[index].id, [incidents]);

  const virtualizer = useVirtualizer({
    count: incidents.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowSize,
    overscan: OVERSCAN,
    scrollMargin: HEADER_HEIGHT, // the sticky header sits above the first row
    getItemKey,
  });

  // New data (e.g. a different ward) should start at the newest incident, not mid-list.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [incidents]);

  const visibleRows = virtualizer.getVirtualItems();

  if (incidents.length === 0) {
    return (
      <p className="px-4 py-10 text-ink-soft">
        No warnings or critical alerts for this ward in the selected dates. Try a wider date range.
      </p>
    );
  }

  return (
    <div aria-busy={busy} className={busy ? 'opacity-60' : undefined}>
      <p className="px-4 py-3 text-sm text-ink-soft">
        {incidents.length.toLocaleString()} alerts loaded. Only {visibleRows.length} rows are in the page at
        once; the rest are drawn as you scroll.
        {truncated && ' These are the newest alerts: narrow the date range to see older ones.'}
      </p>

      <div
        ref={scrollRef}
        role="table"
        aria-label="Raw incident log"
        aria-rowcount={incidents.length + 1}
        tabIndex={0} // keyboard users can scroll the list with the arrow keys
        className="h-[28rem] w-full overflow-auto border-t border-t-rule"
        // Tells the browser this box can't affect layout outside itself, so a scroll never
        // triggers a re-layout of the rest of the page.
        style={{ contain: 'strict' }}
      >
        <div className="min-w-[53rem]">
          <div
            role="row"
            aria-rowindex={1}
            className={`${GRID} sticky top-0 z-10 border-b border-b-rule border-l-4 border-l-transparent bg-scrub text-sm font-semibold text-ink-soft`}
            style={{ height: HEADER_HEIGHT }}
          >
            <div role="columnheader">Time (UTC)</div>
            <div role="columnheader">Bed</div>
            <div role="columnheader">Patient</div>
            <div role="columnheader" className="text-right">
              HR (bpm)
            </div>
            <div role="columnheader" className="text-right">
              SpO₂ (%)
            </div>
            <div role="columnheader" className="text-right">
              BP (mmHg)
            </div>
            <div role="columnheader">Level</div>
          </div>

          {/* The spacer: full-list height, so the scrollbar is the right size. */}
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {visibleRows.map((item) => (
              <Row
                key={item.key}
                incident={incidents[item.index]}
                index={item.index}
                top={item.start - HEADER_HEIGHT}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// memo(): typing in a date field re-renders the whole app; the log only re-renders when its
// own props change.
export default memo(IncidentLog);
