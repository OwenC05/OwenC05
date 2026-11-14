import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Input is the response from GitHub's contributionCalendar GraphQL query.
const response = JSON.parse(readFileSync(0, 'utf8'));
const calendar = response.data?.user?.contributionsCollection?.contributionCalendar;
if (response.errors?.length || !Array.isArray(calendar?.weeks) || !calendar.weeks.length) {
  throw new Error('GitHub did not return a contribution calendar; existing artwork is unchanged.');
}

let previousDate = '';
const weeks = calendar.weeks.slice(-26).map((week) => {
  if (!Array.isArray(week.contributionDays) || !week.contributionDays.length) {
    throw new Error('A contribution week has no days.');
  }
  const days = week.contributionDays.map(({ date, contributionCount }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date || date <= previousDate ||
        !Number.isSafeInteger(contributionCount) || contributionCount < 0) {
      throw new Error('Invalid or unordered contribution data.');
    }
    previousDate = date;
    return { date, count: contributionCount };
  });
  if (days.length > 7) throw new Error('A contribution week exceeds seven days.');
  return { start: days[0].date, end: days.at(-1).date, count: days.reduce((sum, day) => sum + day.count, 0) };
});

const total = weeks.reduce((sum, week) => sum + week.count, 0);
const formatDate = (date) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(`${date}T00:00:00Z`));
const range = `${formatDate(weeks[0].start)} – ${formatDate(weeks.at(-1).end)}`;
const ceiling = Math.max(4, Math.ceil(Math.max(...weeks.map((week) => week.count)) / 4) * 4);
const left = 60, right = 868, top = 88, bottom = 178;
const points = weeks.map((week, index) => [
  left + index * (right - left) / Math.max(1, weeks.length - 1),
  bottom - week.count / ceiling * (bottom - top),
]);
const pointList = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const area = `M ${left},${bottom} L ${pointList.replaceAll(' ', ' L ')} L ${points.at(-1)[0]},${bottom} Z`;
const themes = {
  light: { background: '#f6f8fa', border: '#d1d9e0', text: '#1f2328', muted: '#59636e', line: '#0969da', accent: '#0891b2', grid: '#d8dee4' },
  dark: { background: '#0d1117', border: '#30363d', text: '#e6edf3', muted: '#9da7b3', line: '#70a5fd', accent: '#22d3ee', grid: '#30363d' },
};

mkdirSync('assets', { recursive: true });
for (const [theme, color] of Object.entries(themes)) {
  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = bottom - index / 4 * (bottom - top);
    return `<path d="M${left},${y}H${right}" stroke="${color.grid}" stroke-dasharray="3 5"/><text x="46" y="${y + 4}" text-anchor="end" fill="${color.muted}" font-size="11">${ceiling * index / 4}</text>`;
  }).join('\n');
  const labels = weeks.map((week, index) => {
    if (index !== 0 && week.start.slice(0, 7) === weeks[index - 1].start.slice(0, 7)) return '';
    const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(`${week.start}T00:00:00Z`));
    return `<text x="${points[index][0]}" y="198" text-anchor="middle" fill="${color.muted}" font-size="11">${month}</text>`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="238" viewBox="0 0 900 238" role="img" aria-labelledby="title description">
<title id="title">Owen's contribution rhythm</title>
<desc id="description">${total.toLocaleString('en-GB')} GitHub contributions across ${weeks.length} calendar weeks, ${range}. Weekly totals; the latest week may be incomplete.</desc>
<defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color.accent}" stop-opacity="0.35"/><stop offset="1" stop-color="${color.line}" stop-opacity="0.02"/></linearGradient></defs>
<rect x="0.5" y="0.5" width="899" height="237" rx="14" fill="${color.background}" stroke="${color.border}"/>
<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">
<text x="30" y="34" fill="${color.text}" font-size="18" font-weight="600">Contribution rhythm</text>
<text x="30" y="58" fill="${color.muted}" font-size="12">${total.toLocaleString('en-GB')} contributions · ${range}</text>
${grid}
<path d="${area}" fill="url(#fill)"/>
<polyline points="${pointList}" fill="none" stroke="${color.line}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${points.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="3" fill="${color.accent}"><title>Week ${weeks[index].start} to ${weeks[index].end}: ${weeks[index].count} contributions</title></circle>`).join('\n')}
${labels}
<text x="30" y="221" fill="${color.muted}" font-size="10">Weekly totals · Latest week may be incomplete · Source: GitHub contribution calendar</text>
</g>
</svg>
`;
  writeFileSync(`assets/activity-${theme}.svg`, svg);
}
console.log(`Generated light/dark activity charts: ${total} contributions, ${weeks.length} weeks, ${range}.`);
