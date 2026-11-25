import { Imp, Filters, buildView, dlabel, fmt, MON } from './attendance';
export async function exportPdf(c: Imp, F: Filters) {
  const { dates, emps, map } = buildView(c, F);
  if (!dates.length || !emps.length) return alert('Nothing to export for the current filters.');
  const { jsPDF } = await import('jspdf'); const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  const W = 420, M = 10, NAME = 52, CW = 15, PER = Math.max(1, Math.floor((W - 2 * M - NAME) / (CW * 3)));
  const navy: [number, number, number] = [27, 51, 88], lb: [number, number, number] = [220, 230, 241];
  const pages: string[][] = []; for (let i = 0; i < dates.length; i += PER) pages.push(dates.slice(i, i + PER));
  const months = [...new Set(dates.map(d => MON[+d.slice(5, 7) - 1]))].join(' / '), years = [...new Set(dates.map(d => d.slice(0, 4)))].join(' / ');
  const dept = F.d === 'all' ? '' : F.d;
  pages.forEach((pd, pi) => {
    const cs: Record<number, object> = { 0: { cellWidth: NAME, halign: 'left' } };
    pd.forEach((_, i) => { for (let k = 1; k <= 3; k++) cs[i * 3 + k] = { cellWidth: CW }; });
    if (pi > 0) doc.addPage();
    autoTable(doc, {
      startY: 34, margin: { left: M, right: M, top: 34, bottom: 14 }, theme: 'grid', tableWidth: NAME + pd.length * CW * 3, columnStyles: cs,
      head: [[{ content: 'EMPLOYEE NAME', styles: { halign: 'left' } }, ...pd.map(d => ({ content: 'DATE ' + dlabel(d), colSpan: 3 }))], ['', ...pd.flatMap(() => ['Clock In', 'Clock Out', 'Total Hours'])]],
      body: emps.map(e => [e.name, ...pd.flatMap(d => { const r = map[e.id + '|' + d]; return r ? [fmt(r.in) || '-', fmt(r.out) || '-', fmt(r.tot) || '-'] : ['-', '-', '-']; })]),
      styles: { fontSize: 7.5, cellPadding: 1.6, halign: 'center', valign: 'middle', lineColor: [169, 175, 192], lineWidth: 0.2, overflow: 'ellipsize', textColor: [28, 34, 48] },
      headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', halign: 'center' }, alternateRowStyles: { fillColor: [246, 248, 252] },
      didParseCell: h => {
        if (h.section === 'head' && h.row.index === 1) { h.cell.styles.fillColor = lb; h.cell.styles.textColor = navy; h.cell.styles.fontSize = 7; }
        if (h.section === 'body' && h.column.index === 0) h.cell.styles.halign = 'left';
      },
      didDrawPage: () => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...navy); doc.text('MONTHLY EMPLOYEE TIME CARD', M, 16);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
        doc.text(`Month: ${months}    Year: ${years}${dept ? '    Department: ' + dept : ''}    Generated: ${new Date().toLocaleDateString()}    Source: ${c.name}`, M, 23);
        doc.text(`Dates ${dlabel(pd[0])} – ${dlabel(pd[pd.length - 1])} (${pi + 1}/${pages.length} column groups). "-" = no attendance recorded.`, M, 28);
      },
    });
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(9); doc.setTextColor(90); doc.text(`Page ${i} of ${n}`, W / 2, 288, { align: 'center' }); }
  doc.save(`Monthly_Time_Card_${dates[0]}_${dates[dates.length - 1]}.pdf`);
}
