/**
 * Display formatting shared by the pages. The API sends money in dollars,
 * hours as numbers, dates as YYYY-MM-DD and timestamps as ISO strings.
 */

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const longDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** @param {number} value dollars → "$1,980" */
export const formatMoney = (value) => money.format(value ?? 0);

/** @param {number} value hours → "6.5 h" */
export const formatHours = (value) => `${number.format(value ?? 0)} h`;

/** @param {number} value → "1,413" */
export const formatNumber = (value) => number.format(value ?? 0);

/** Two-digit count as in the mockups: 2 → "02". */
export const formatCount = (value) => String(value ?? 0).padStart(2, '0');

/** Today as YYYY-MM-DD in the browser's own time zone (the UTC date can already be tomorrow). */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse a YYYY-MM-DD date as a local calendar day (no time-zone shift). */
function parseDay(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "20 Oct", or "—" when there is no date. */
export const formatDay = (value) => (value ? dayMonth.format(parseDay(value)) : '—');

/** "5 Jan 2027" */
export const formatDate = (value) => (value ? dayMonthYear.format(parseDay(value)) : '—');

/** "Tuesday, 13 October" for today. */
export const formatToday = () => longDay.format(new Date());

/** Whole days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDay(value) - today) / 86_400_000);
}

/** "Today 19:32", "Yesterday" or "11 Oct" for an ISO timestamp. */
export function formatWhen(iso) {
  const when = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - new Date(when).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return `Today ${clock.format(when)}`;
  if (days === 1) return 'Yesterday';
  return dayMonth.format(when);
}

/** "Sam Rivera" → "SR" */
export const initialsOf = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
