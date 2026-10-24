// Смета в Excel (.xlsx) без библиотек — общая для Hub ADERVIS и страницы КП.
// d — документ сметы: { two, subtotals, groups[{name, rows[{name, base, full}], sum}],
// k: { base, full }, options[{name, why, price}], terms[], date }; meta: { title, client }.
(() => {
// ---- Excel без библиотек: книга .xlsx — это zip из нескольких XML.
// Сжатие не нужно: Excel открывает и несжатый архив.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const x of bytes) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function zipStore(files, type) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    // подпись, версия, флаг «имена в UTF-8», без сжатия, дата 1 января 1980
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, x) => n + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
}

function xlsx(d, meta) {
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const last = d.two ? 'D' : 'C', rows = [], merges = [];
  let r = 0;
  const str = (col, v, st) => `<c r="${col}${r}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  const n = (col, v, st) => v === null ? str(col, 'не входит', 9) : `<c r="${col}${r}" s="${st}"><v>${v}</v></c>`;
  const row = (cells, ht) => { r++; rows.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells()}</row>`); };
  const wide = (v, st, ht) => { row(() => str('A', v, st), ht); merges.push(`A${r}:${last}${r}`); };
  wide(`Смета: ${meta.title}`, 1, 26);
  wide(`Для: ${meta.client || ''}`, 0);
  wide(`ADERVIS · adervis.ru · ${d.date}`, 9);
  row(() => '');
  row(() => str('A', '№', 3) + str('B', 'Работа', 3) + (d.two ? str('C', 'Базовый', 3) + str('D', 'Полный', 3) : str('C', 'Стоимость', 3)));
  const first = r + 1;
  let no = 0;
  const subs = [];
  for (const g of d.groups) {
    wide(g.name, 4);
    const from = r + 1;
    for (const it of g.rows) row(() => str('A', String(++no), 5) + str('B', it.name, 5) + (d.two ? n('C', it.base, 6) + n('D', it.full, 6) : n('C', it.full, 6)));
    if (d.subtotals) {
      const to = r, f = (col, v) => `<c r="${col}${r}" s="10"><f>SUM(${col}${from}:${col}${to})</f><v>${v}</v></c>`;
      row(() => str('A', '', 2) + str('B', `Итого «${g.name}»`, 2) + (d.two ? f('C', g.sum.base) + f('D', g.sum.full) : f('C', g.sum.full)));
      subs.push(r);
    }
  }
  const lastRow = r;
  const sum = (col, v) => `<c r="${col}${r}" s="8"><f>${subs.length ? subs.map(x => col + x).join('+') : `SUM(${col}${first}:${col}${lastRow})`}</f><v>${v}</v></c>`;
  row(() => str('A', '', 7) + str('B', 'Итого', 7) + (d.two ? sum('C', d.k.base) + sum('D', d.k.full) : sum('C', d.k.full)));
  if (d.options.length) {
    row(() => '');
    row(() => str('A', '', 4) + str('B', 'Дополнительно, по желанию', 4) + (d.two ? str('C', '', 4) : '') + str(last, '', 4));
    for (const o of d.options) row(() => str('A', '', 5) + str('B', o.name + (o.why ? `. ${o.why}` : ''), 5) + n(last, o.price, 6));
  }
  row(() => '');
  row(() => str('B', 'Условия', 2));
  for (const t of d.terms) row(() => str('B', t, 5));
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="2" width="72" customWidth="1"/><col min="3" max="4" width="16" customWidth="1"/></cols>
<sheetData>${rows.join('')}</sheetData>
<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>
<pageMargins left="0.6" right="0.6" top="0.7" bottom="0.7" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="portrait" fitToHeight="0"/>
</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0\\ &quot;₽&quot;"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF6B6B6B"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF2F3F6"/></patternFill></fill></fills>
<borders count="3"><border/><border><bottom style="thin"><color rgb="FFB8BCC6"/></bottom></border><border><top style="medium"><color rgb="FF1B1E24"/></top></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="11">
<xf/>
<xf fontId="2" applyFont="1"/>
<xf fontId="1" applyFont="1"/>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf fontId="1" fillId="2" applyFont="1" applyFill="1"/>
<xf applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf fontId="1" borderId="2" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="1" borderId="2" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf fontId="3" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="164" fontId="1" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  const ns = 'http://schemas.openxmlformats.org';
  return zipStore([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="Смета" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/styles.xml', data: styles }
  ], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
  window.Smeta = { xlsx };
})();
