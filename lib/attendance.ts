// Pure attendance-processing logic (no UI).
export type Emp = { id: string; name: string; dept: string };
export type Rec = { id: string; date: string; in: number | null; out: number | null; tot: number | null; dup?: boolean; dupInfo?: string[] };
export type Stats = { total: number; valid: number; noIn: number; noOut: number; invalid: number; dup: number };
export type Imp = { id: string; name: string; at: string; emps: Emp[]; recs: Rec[]; dates: string[]; stats: Stats; issues: string[]; sig: string };
export type Filters = { m: string; y: string; d: string; q: string };
export const REQ = ['Employee ID', 'First Name', 'Department', 'Date', 'Weekday', 'Clock In', 'Clock Out', 'Total Hours'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const clean = (s?: string) => (s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
export const fmt = (m: number | null) => (m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
export const dlabel = (d: string) => `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1].toUpperCase()}`;

export function parseDate(s: string): string | null {
  s = clean(s);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), y: number, mo: number, d: number;
  if (m) { mo = +m[1]; d = +m[2]; y = +m[3]; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
export function parseTime(s?: string): { v?: number | null; bad?: boolean } {
  s = clean(s);
  if (!s) return { v: null };
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m || +m[1] > 47 || +m[2] > 59) return { bad: true };
  return { v: +m[1] * 60 + +m[2] };
}
const signature = (rows: Record<string, string>[]) => {
  let h = 0; const s = rows.map(r => REQ.map(c => clean(r[c])).join('|')).join('\n');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h + ':' + rows.length;
};

export function processRows(rows: Record<string, string>[], name: string): Imp {
  const emps: Record<string, Emp> = {}, recs: Record<string, Rec> = {}, issues: string[] = [];
  const st: Stats = { total: rows.length, valid: 0, noIn: 0, noOut: 0, invalid: 0, dup: 0 };
  rows.forEach((r, i) => {
    const line = i + 2, id = clean(r['Employee ID']), date = parseDate(r['Date']);
    if (!id) { st.invalid++; issues.push(`Line ${line}: missing Employee ID`); return; }
    if (!date) { st.invalid++; issues.push(`Line ${line} (${id}): invalid date "${r['Date']}"`); return; }
    const a = parseTime(r['Clock In']), b = parseTime(r['Clock Out']);
    if (a.bad || b.bad) { st.invalid++; issues.push(`Line ${line} (${id}, ${date}): malformed time "${r['Clock In']}" / "${r['Clock Out']}"`); return; }
    emps[id] ??= { id, name: clean(r['First Name']), dept: clean(r['Department']) };
    const k = id + '|' + date;
    if (recs[k]) {
      st.dup++; recs[k].dup = true;
      recs[k].dupInfo = [...(recs[k].dupInfo || []), [clean(r['Clock In']), clean(r['Clock Out']), clean(r['Total Hours'])].join(' / ')];
      issues.push(`Line ${line} (${id}, ${date}): duplicate of an earlier record, kept first, flagged for review`); return;
    }
    let tot: number | null = null; const th = clean(r['Total Hours']);
    if (th) { const t = parseTime(th); if (t.bad) issues.push(`Line ${line} (${id}, ${date}): invalid Total Hours "${th}"`); else tot = t.v ?? null; }
    if (tot == null && a.v != null && b.v != null) tot = b.v >= a.v ? b.v - a.v : b.v + 1440 - a.v; // overnight
    if (!(a.v == null && b.v == null && tot == null)) st.valid++;
    if (a.v == null && (b.v != null || tot != null)) st.noIn++;
    if (b.v == null && (a.v != null || tot != null)) st.noOut++;
    recs[k] = { id, date, in: a.v ?? null, out: b.v ?? null, tot };
  });
  const dates = [...new Set(Object.values(recs).map(r => r.date))].sort();
  return { id: Date.now() + '', name, at: new Date().toISOString(), emps: Object.values(emps), recs: Object.values(recs), dates, stats: st, issues, sig: signature(rows) };
}

export function buildView(imp: Imp, f: Filters) {
  const dates = imp.dates.filter(d => (f.m === 'all' || +d.slice(5, 7) === +f.m) && (f.y === 'all' || d.slice(0, 4) === f.y));
  const q = f.q.toLowerCase();
  const emps = imp.emps.filter(e => (f.d === 'all' || e.dept === f.d) && (!q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  const map: Record<string, Rec> = {}; imp.recs.forEach(r => (map[r.id + '|' + r.date] = r));
  return { dates, emps, map };
}
