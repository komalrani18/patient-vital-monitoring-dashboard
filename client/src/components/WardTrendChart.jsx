import { memo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// Recharts draws SVG, so these are plain hex values rather than CSS variables. They mirror the
// @theme tokens in index.css.
const COLOR = {
  spo2: '#0b7a85', // pulse
  critical: '#c8102e', // red is reserved for critical alerts
  axis: '#476259',
  axisLine: '#bcd2ca',
  grid: '#dcebe5',
};

// Built once, reused for every tick and tooltip.
const dayTick = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hourTick = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});
const dayFull = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'UTC' });
const hourFull = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/**
 * Average SpO₂ (line, left axis) over critical-alert counts (bars, right axis).
 *
 * `data` is the payload of GET /api/analytics/ward-trends: one row per day or hour, already
 * averaged and counted by MongoDB. The chart therefore draws at most a few hundred points
 * (30 days = 30 daily or 720 hourly buckets), never the million readings behind them.
 */
function WardTrendChart({ data, interval = 'day' }) {
  const tick = interval === 'hour' ? hourTick : dayTick;
  const full = interval === 'hour' ? hourFull : dayFull;

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={COLOR.grid} vertical={false} />

        <XAxis
          dataKey="bucket"
          tickFormatter={(value) => tick.format(new Date(value))}
          minTickGap={32} // skip labels instead of overlapping them on dense hourly data
          tick={{ fill: COLOR.axis, fontSize: 12 }}
          stroke={COLOR.axisLine}
        />

        {/* Two Y axes, because SpO₂ (~90-100%) and alert counts (0-n) share no scale. */}
        <YAxis
          yAxisId="spo2"
          // A 0-100 axis would flatten the line into a straight band near the top. Zoom to the
          // data, snapping the floor to an even number so ticks land on round values (96, 98, 100).
          domain={([min]) => [Math.max(0, Math.floor(min / 2) * 2 - 2), 100]}
          tickFormatter={(v) => `${v}%`}
          width={46}
          tick={{ fill: COLOR.axis, fontSize: 12 }}
          stroke={COLOR.axisLine}
        />
        <YAxis
          yAxisId="alerts"
          orientation="right"
          allowDecimals={false}
          width={36}
          tick={{ fill: COLOR.axis, fontSize: 12 }}
          stroke={COLOR.axisLine}
        />

        <Tooltip
          labelFormatter={(value) => full.format(new Date(value))}
          contentStyle={{ border: `1px solid ${COLOR.axisLine}`, borderRadius: 6, fontSize: 13 }}
        />
        <Legend verticalAlign="top" height={32} iconType="plainline" />

        {/* Bars first, so the SpO₂ line is painted on top of them. */}
        <Bar
          yAxisId="alerts"
          dataKey="criticalCount"
          name="Critical alerts"
          fill={COLOR.critical}
          fillOpacity={0.85}
          maxBarSize={28}
          isAnimationActive={false}
        />
        <Line
          yAxisId="spo2"
          dataKey="avgSpo2"
          name="Average SpO₂"
          unit="%"
          type="monotone"
          stroke={COLOR.spo2}
          strokeWidth={2.5}
          // A dot per point means up to 720 extra SVG elements to create and hit-test. The line
          // alone carries the same information.
          dot={false}
          // Entrance animation re-runs on every ward or date change and is the main CPU cost
          // of redrawing a chart this size. It also keeps the chart still for people who have
          // asked their OS to reduce motion.
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// memo(): while the user edits a date field the parent re-renders constantly; the SVG chart
// only needs to redraw when the data actually changes.
export default memo(WardTrendChart);
