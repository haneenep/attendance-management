'use client';
import { useEffect, useState, DragEvent } from 'react';
import Papa from 'papaparse';
import { Imp, Filters, REQ, MON, clean, fmt, dlabel, processRows, buildView } from '@/lib/attendance';
import { exportPdf } from '@/lib/pdf';

type View = 'dash' | 'import' | 'report' | 'emps' | 'hist';
const NAV: [View, string][] = [['dash', 'Dashboard'], ['import', 'Import CSV'], ['report', 'Time Card'], ['emps', 'Employees'], ['hist', 'History']];
const F0: Filters = { m: 'all', y: 'all', d: 'all', q: '' };
const KEY = 'att_imports';

export default function Page() {
  const [imports, setImports] = useState<Imp[]>([]);
  const [curId, setCurId] = useState<string | null>(null);
  const [view, setView] = useState<View>('dash');
  const [pending, setPending] = useState<Imp | null>(null);
  const [f, setF] = useState<Filters>(F0);
  const [ready, setReady] = useState(false);

  useEffect(() => { try { const l = JSON.parse(localStorage.getItem(KEY) || '[]'); setImports(l); setCurId(l[0]?.id ?? null); } catch {} setReady(true); }, []);
  const persist = (l: Imp[]) => { setImports(l); try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { alert('Storage unavailable; data kept for this session only.'); } };
  const cur = imports.find(i => i.id === curId) ?? null;
  const open = (id: string) => { setCurId(id); setF(F0); setView('report'); };
  const confirm_ = () => { if (!pending) return; persist([pending, ...imports.filter(i => i.sig !== pending.sig)]); setCurId(pending.id); setPending(null); setF(F0); setView('report'); };
  const del = (id: string) => { if (!window.confirm('Delete this import?')) return; const l = imports.filter(i => i.id !== id); persist(l); if (curId === id) setCurId(l[0]?.id ?? null); };
  if (!ready) return null;

  return (<>
    <header><h1>ATTENDANCE MANAGEMENT</h1>
      <nav>{NAV.map(([k, t]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{t}</button>)}</nav></header>
    <main>
      {view === 'dash' && <Dashboard imports={imports} cur={cur} go={setView} />}
      {view === 'import' && <ImportView pending={pending} setPending={setPending} imports={imports} confirm={confirm_} />}
      {view === 'report' && <Report cur={cur} f={f} setF={setF} go={setView} />}
      {view === 'emps' && <Employees imports={imports} cur={cur} />}
      {view === 'hist' && <History imports={imports} open={open} del={del} />}
    </main></>);
}

function UploadTable({ list, actions }: { list: Imp[]; actions?: { open: (id: string) => void; del: (id: string) => void; info: (id: string) => void } }) {
  if (!list.length) return <p style={{ color: 'var(--mu)' }}>No uploads yet.</p>;
  return <div style={{ overflow: 'auto' }}><table className="l"><thead><tr><th>File</th><th>Uploaded</th><th>Employees</th><th>Records</th><th>Status</th>{actions && <th />}</tr></thead><tbody>
    {list.map(i => { const w = i.stats.invalid || i.stats.dup; return <tr key={i.id}><td>{i.name}</td><td>{new Date(i.at).toLocaleString()}</td><td>{i.emps.length}</td><td>{i.recs.length}</td>
      <td><span className={'tag ' + (w ? 'wn' : 'ok')}>{w ? 'Imported with warnings' : 'Imported'}</span></td>
      {actions && <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm sec" onClick={() => actions.open(i.id)}>Open</button> <button className="btn sm sec" onClick={() => exportPdf(i, F0)}>PDF</button> <button className="btn sm sec" onClick={() => actions.info(i.id)}>Details</button> <button className="btn sm sec" onClick={() => actions.del(i.id)}>Delete</button></td>}</tr>; })}</tbody></table></div>;
}

function Dashboard({ imports, cur, go }: { imports: Imp[]; cur: Imp | null; go: (v: View) => void }) {
  const ids = new Set(imports.flatMap(i => i.emps.map(e => e.id)));
  const has = (r: { in: number | null; out: number | null; tot: number | null }) => r.in != null || r.out != null || r.tot != null;
  const present = cur ? new Set(cur.recs.filter(has).map(r => r.id)).size : 0;
  const missing = cur ? cur.emps.filter(e => cur.recs.some(r => r.id === e.id && (r.in == null) !== (r.out == null))).length : 0;
  const period = cur?.dates.length ? `${dlabel(cur.dates[0])} – ${dlabel(cur.dates[cur.dates.length - 1])} ${cur.dates[cur.dates.length - 1].slice(0, 4)}` : '—';
  const cards: [string, string | number][] = [['Total Employees', ids.size], ['Attendance Records', cur?.recs.length ?? 0], ['Employees Present', present], ['Missing Attendance', missing], ['Selected Period', period]];
  return <>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0 }}>Dashboard</h2><button className="btn" onClick={() => go('import')}>Import Attendance CSV</button></div>
    <div className="cards">{cards.map(([a, b]) => <div className="card" key={a}><b style={a === 'Selected Period' ? { fontSize: 15, padding: '6px 0' } : {}}>{b}</b><span>{a}</span></div>)}</div>
    <div className="panel"><h2>Recent uploads</h2><UploadTable list={imports.slice(0, 5)} /></div></>;
}

function ImportView({ pending, setPending, imports, confirm }: { pending: Imp | null; setPending: (p: Imp | null) => void; imports: Imp[]; confirm: () => void }) {
  const [msg, setMsg] = useState(''); const [hov, setHov] = useState(false);
  const load = (file?: File) => {
    if (!file) return; setMsg('');
    if (!/\.csv$/i.test(file.name)) return setMsg('Only CSV files are accepted.');
    Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: true, transformHeader: h => clean(h).replace(/^\ufeff/, ''),
      complete: r => {
        const miss = REQ.filter(c => !(r.meta.fields || []).includes(c));
        if (miss.length) return setMsg('Missing required column(s): ' + miss.join(', '));
        if (!r.data.length) return setMsg('The file contains no data rows.');
        setPending(processRows(r.data, file.name));
      }, error: e => setMsg('Could not read file: ' + e.message) });
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setHov(false); load(e.dataTransfer.files[0]); };
  const dupFile = pending && imports.find(i => i.sig === pending.sig);
  const s = pending?.stats;
  return <div className="panel"><h2>Import Attendance CSV</h2>
    <div className={'drop' + (hov ? ' hov' : '')} onDragOver={e => { e.preventDefault(); setHov(true); }} onDragLeave={() => setHov(false)} onDrop={drop}>
      <p><b>Drag &amp; drop a CSV file here</b></p><p>or</p>
      <label className="btn" style={{ display: 'inline-block', color: '#fff', cursor: 'pointer' }}>Browse files<input type="file" accept=".csv,text/csv" hidden onChange={e => load(e.target.files?.[0])} /></label>
      <p style={{ fontSize: 12 }}>Required columns: {REQ.join(', ')}</p></div>
    {msg && <div className="msg bad">{msg}</div>}
    {pending && s && <>
      <h2 style={{ marginTop: 16 }}>Preview — {pending.name}</h2>
      {dupFile && <div className="msg wn tag" style={{ display: 'block' }}>This exact file was already imported ({new Date(dupFile.at).toLocaleString()}). Confirming replaces that import instead of duplicating it.</div>}
      <div className="stats">{([['Employees', pending.emps.length], ['Date range', pending.dates.length ? `${dlabel(pending.dates[0])} → ${dlabel(pending.dates[pending.dates.length - 1])}` : '—'], ['Total rows', s.total], ['Valid (with data)', s.valid], ['Missing Clock In', s.noIn], ['Missing Clock Out', s.noOut], ['Invalid', s.invalid], ['Duplicates', s.dup]] as [string, string | number][]).map(([a, b]) => <div key={a}><b style={{ fontSize: a === 'Date range' ? 13 : 18 }}>{b}</b>{a}</div>)}</div>
      <p style={{ color: 'var(--mu)', fontSize: 12 }}>Rows with no clock data are kept as blank days, never as zero hours.</p>
      {pending.issues.length > 0 && <details open><summary>{pending.issues.length} issue(s) for review</summary><ul style={{ maxHeight: 160, overflow: 'auto', fontSize: 12 }}>{pending.issues.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
      <details><summary>Detected employees</summary><div style={{ fontSize: 12, columns: 2 }}>{pending.emps.map(e => <div key={e.id}>{e.id} — {e.name} ({e.dept})</div>)}</div></details>
      <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={confirm}>Confirm import</button><button className="btn sec" onClick={() => setPending(null)}>Cancel</button></div></>}
  </div>;
}

function Report({ cur, f, setF, go }: { cur: Imp | null; f: Filters; setF: (f: Filters) => void; go: (v: View) => void }) {
  if (!cur) return <div className="panel">No report yet. <a href="#" onClick={e => { e.preventDefault(); go('import'); }}>Import a CSV</a>.</div>;
  const ms = [...new Set(cur.dates.map(d => +d.slice(5, 7)))], ys = [...new Set(cur.dates.map(d => d.slice(0, 4)))], ds = [...new Set(cur.emps.map(e => e.dept))].sort();
  const { dates, emps, map } = buildView(cur, f);
  return <>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 style={{ margin: 0 }}>Monthly Employee Time Card <span style={{ fontWeight: 400, color: 'var(--mu)', fontSize: 12 }}>· {cur.name}</span></h2>
      <button className="btn" onClick={() => exportPdf(cur, f)}>Export Monthly Attendance PDF</button></div>
    <div className="panel"><div className="row">
      <label>Month<select value={f.m} onChange={e => setF({ ...f, m: e.target.value })}><option value="all">Full period</option>{ms.map(m => <option key={m} value={m}>{MON[m - 1]}</option>)}</select></label>
      <label>Year<select value={f.y} onChange={e => setF({ ...f, y: e.target.value })}><option value="all">All</option>{ys.map(y => <option key={y}>{y}</option>)}</select></label>
      <label>Department<select value={f.d} onChange={e => setF({ ...f, d: e.target.value })}><option value="all">All departments</option>{ds.map(d => <option key={d}>{d}</option>)}</select></label>
      <label>Search name or ID<input type="text" value={f.q} placeholder="Search…" onChange={e => setF({ ...f, q: e.target.value })} /></label></div>
      {!emps.length || !dates.length ? <p style={{ color: 'var(--mu)' }}>No data for the selected filters.</p> : <>
        <div className="wrap"><table className="tc"><thead>
          <tr><th className="nm">EMPLOYEE NAME</th>{dates.map(d => <th key={d} colSpan={3}>DATE {dlabel(d)}</th>)}</tr>
          <tr><th className="nm" />{dates.map(d => <FragHead key={d} />)}</tr></thead>
          <tbody>{emps.map(e => <tr key={e.id}><td className="nm" title={`${e.id} · ${e.dept}`}>{e.name}</td>
            {dates.map(d => { const r = map[e.id + '|' + d]; const c = r?.dup ? 'dup' : undefined; const t = r?.dup ? 'Duplicate flagged: ' + (r.dupInfo || []).join('; ') : undefined;
              return r ? <TdGroup key={d} v={[fmt(r.in), fmt(r.out), fmt(r.tot)]} c={c} t={t} /> : <TdGroup key={d} v={['', '', '']} />; })}</tr>)}</tbody></table></div>
        <p style={{ fontSize: 12, color: 'var(--mu)' }}>{emps.length} employees × {dates.length} dates. "-" = no attendance recorded (not zero hours). Orange outline = duplicate flagged.</p></>}
    </div></>;
}
const FragHead = () => <><th>Clock In</th><th>Clock Out</th><th>Total Hours</th></>;
const TdGroup = ({ v, c, t }: { v: string[]; c?: string; t?: string }) => <>{v.map((x, i) => <td key={i} className={c} title={t}>{x || '-'}</td>)}</>;

function Employees({ imports, cur }: { imports: Imp[]; cur: Imp | null }) {
  const m: Record<string, { id: string; name: string; dept: string; n: number; min: number }> = {};
  imports.forEach(i => i.emps.forEach(e => (m[e.id] ??= { ...e, n: 0, min: 0 })));
  cur?.recs.forEach(r => { if (m[r.id] && (r.in != null || r.out != null || r.tot != null)) { m[r.id].n++; m[r.id].min += r.tot || 0; } });
  const l = Object.values(m).sort((a, b) => a.name.localeCompare(b.name));
  return <div className="panel"><h2>Employees <span style={{ fontWeight: 400, color: 'var(--mu)' }}>(totals for the open report)</span></h2><div style={{ overflow: 'auto' }}><table className="l"><thead><tr><th>Employee ID</th><th>Name</th><th>Department</th><th>Attendance Records</th><th>Total Working Hours</th></tr></thead>
    <tbody>{l.map(e => <tr key={e.id}><td>{e.id}</td><td>{e.name}</td><td>{e.dept}</td><td>{e.n}</td><td>{Math.floor(e.min / 60)}:{String(e.min % 60).padStart(2, '0')}</td></tr>)}</tbody></table></div></div>;
}

function History({ imports, open, del }: { imports: Imp[]; open: (id: string) => void; del: (id: string) => void }) {
  const [q, setQ] = useState(''); const [det, setDet] = useState<Imp | null>(null);
  const t = q.toLowerCase().trim();
  const list = imports.filter(i => !t || i.name.toLowerCase().includes(t) || i.dates.some(d => `${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`.toLowerCase().includes(t) || d.includes(t)));
  return <div className="panel"><h2>Attendance History</h2>
    <div className="row"><label>Search by month/year (e.g. Oct 2026)<input type="text" value={q} onChange={e => setQ(e.target.value)} /></label></div>
    <UploadTable list={list} actions={{ open, del, info: id => setDet(imports.find(i => i.id === id) ?? null) }} />
    {det && <><h2 style={{ marginTop: 16 }}>Import details — {det.name}</h2>
      <div className="stats">{([['Rows', det.stats.total], ['Valid', det.stats.valid], ['No Clock In', det.stats.noIn], ['No Clock Out', det.stats.noOut], ['Invalid', det.stats.invalid], ['Duplicates', det.stats.dup]] as [string, number][]).map(([a, b]) => <div key={a}><b>{b}</b>{a}</div>)}</div>
      <ul style={{ fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{det.issues.length ? det.issues.map((x, i) => <li key={i}>{x}</li>) : <li>No issues.</li>}</ul></>}
  </div>;
}
