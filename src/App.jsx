import { useState } from 'react';
import IncidentLog from './components/IncidentLog.jsx';
import WardTrendChart from './components/WardTrendChart.jsx';
import { fetchIncidents, fetchWardTrends } from './api.js';
import { useApi } from './useApi.js';

const WARDS = ['ICU', 'Cardiac-Care', 'General', 'Post-Op'].map((w) => ({ value: w, label: w }));
const GROUPINGS = [
  { value: 'day', label: 'Daily' },
  { value: 'hour', label: 'Hourly' },
];

const DAY_MS = 86_400_000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// A network failure means the API isn't running; validation errors from the API are already
// written in plain language, so those pass through unchanged.
const friendlyError = (message) =>
  /failed to fetch|networkerror|load failed/i.test(message)
    ? 'Cannot reach the API. Start it with "npm run dev" in the server folder.'
    : message;

// Radio inputs (visually hidden) give us native arrow-key navigation and screen-reader
// semantics for free, while the labels are styled as one segmented control.
function Segmented({ legend, name, options, value, onChange }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-semibold text-ink-soft">{legend}</legend>
      <div className="inline-flex flex-wrap rounded-md border border-rule bg-panel p-0.5">
        {options.map((option) => (
          <label key={option.value} className="relative">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="block cursor-pointer rounded px-3 py-1.5 text-sm font-semibold text-ink-soft peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pulse">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DateField({ label, ...props }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-ink-soft">{label}</span>
      <input
        type="date"
        className="rounded-md border border-rule bg-panel px-2.5 py-1.5 text-sm tabular-nums"
        {...props}
      />
    </label>
  );
}

// Says where the numbers came from, so the effect of the Redis cache is visible on screen:
// the first request for a ward and range is computed by MongoDB, repeats come from Redis.
function QueryBadge({ meta }) {
  if (!meta) return null;
  const source = {
    HIT: 'From cache',
    MISS: 'From database',
    BYPASS: 'From database (cache offline)',
  }[meta.cache];
  return (
    <p
      className={`rounded-full px-3 py-1 text-sm font-semibold ${
        meta.cache === 'HIT' ? 'bg-pulse text-white' : 'bg-scrub text-ink'
      }`}
    >
      {source}, {meta.durationMs} ms
    </p>
  );
}

// Amber, not red: red is reserved for critical patient alerts.
function Notice({ title, children }) {
  return (
    <div role="alert" className="m-4 rounded-md border border-caution bg-caution-wash px-4 py-3 text-caution-ink">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

function Panel({ title, aside, children }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-rule bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [ward, setWard] = useState('ICU');
  const [grouping, setGrouping] = useState('day');
  const [dates, setDates] = useState(() => ({
    startDate: isoDay(Date.now() - 29 * DAY_MS),
    endDate: isoDay(Date.now()),
  }));
  const [reloadKey, setReloadKey] = useState(0);

  // Two independent requests: the chart doesn't wait for the incident list, or the reverse.
  // Changing the grouping only refetches the trends, because the incident log ignores it.
  const trends = useApi(fetchWardTrends, { ward, ...dates, interval: grouping }, reloadKey);
  const incidents = useApi(fetchIncidents, { ward, ...dates, limit: 5000 }, reloadKey);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ward vitals</h1>
          <p className="mt-1 text-ink-soft">Oxygen saturation trends and critical alerts, by ward.</p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((n) => n + 1)}
          className="rounded-md border border-ink px-4 py-2 text-sm font-semibold hover:bg-ink hover:text-white"
        >
          Refresh data
        </button>
      </header>

      <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4 border-y border-rule py-4">
        <Segmented legend="Ward" name="ward" options={WARDS} value={ward} onChange={setWard} />
        <DateField
          label="From"
          value={dates.startDate}
          max={dates.endDate}
          onChange={(e) => e.target.value && setDates((d) => ({ ...d, startDate: e.target.value }))}
        />
        <DateField
          label="To"
          value={dates.endDate}
          min={dates.startDate}
          max={isoDay(Date.now())}
          onChange={(e) => e.target.value && setDates((d) => ({ ...d, endDate: e.target.value }))}
        />
        <Segmented legend="Group by" name="grouping" options={GROUPINGS} value={grouping} onChange={setGrouping} />
      </div>

      <Panel title="Average SpO₂ and critical alerts" aside={<QueryBadge meta={trends.meta} />}>
        {trends.status === 'error' ? (
          <Notice title="The trend chart could not be loaded.">
            {friendlyError(trends.error)}
          </Notice>
        ) : trends.data === null ? (
          <p className="px-4 py-10 text-ink-soft">Loading trends…</p>
        ) : trends.data.length === 0 ? (
          <p className="px-4 py-10 text-ink-soft">
            No readings for this ward and date range. Run <code>npm run seed</code> in the server folder, or choose
            other dates.
          </p>
        ) : (
          <div aria-busy={trends.status === 'loading'} className={`p-4 ${trends.status === 'loading' ? 'opacity-60' : ''}`}>
            <WardTrendChart data={trends.data} interval={trends.meta.interval} />
          </div>
        )}
      </Panel>

      <Panel title="Incident log">
        {incidents.status === 'error' ? (
          <Notice title="The incident log could not be loaded.">{friendlyError(incidents.error)}</Notice>
        ) : incidents.data === null ? (
          <p className="px-4 py-10 text-ink-soft">Loading incidents…</p>
        ) : (
          <IncidentLog
            incidents={incidents.data}
            busy={incidents.status === 'loading'}
            truncated={incidents.meta?.truncated}
          />
        )}
      </Panel>
    </div>
  );
}
