export function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function rowsHtml(items, padding) {
  return items.map(i =>
    `<tr><td style="padding:${padding};border-bottom:1px solid #eee">☐ ${escapeHtml(i.name_he)}</td>` +
    `<td style="padding:${padding};border-bottom:1px solid #eee;text-align:left">${escapeHtml(i.quantity)} ${escapeHtml(i.unit)}</td></tr>`
  ).join('')
}

// sections: [{ heading?, items: [{name_he, quantity, unit}] }]
// A single section with no heading renders as the original single-client layout
// (h2 + subheading + one table); multiple sections (or a heading) render as the
// original multi-client layout (repeated h3 + table blocks separated by <hr>).
export function buildPackingListHtml({ htmlTitle, h2, subheading, sections }) {
  const isSingle = sections.length === 1 && !sections[0].heading

  if (isSingle) {
    const rows = rowsHtml(sections[0].items, '8px 12px')
    return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>${escapeHtml(htmlTitle)}</title>
      <style>body{font-family:Arial,sans-serif;margin:30px}h2{margin-bottom:4px}p{color:#666;font-size:14px;margin:0 0 16px}table{width:100%;border-collapse:collapse}td{font-size:15px}</style>
      </head><body>
      <h2>${escapeHtml(h2)}</h2><p>${escapeHtml(subheading)}</p>
      <table>${rows}</table>
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`
  }

  const body = sections.map(s => `<div style="page-break-inside:avoid;margin-bottom:28px">
        <h3 style="margin:0 0 4px">${escapeHtml(s.heading)}</h3>
        <table style="width:100%;border-collapse:collapse">${rowsHtml(s.items, '6px 10px')}</table>
      </div>`).join('<hr style="margin:24px 0">')

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
      <title>${escapeHtml(htmlTitle)}</title>
      <style>body{font-family:Arial,sans-serif;margin:30px}h2{margin-bottom:16px}h3{font-size:16px}</style>
      </head><body>
      <h2>${escapeHtml(h2)}</h2>
      ${body}
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`
}

function productionRowsHtml(items) {
  return items.map(i =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(i.name_he)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#555">${escapeHtml(i.customerBreakdown)}</td>` +
    `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:left;font-weight:700">${escapeHtml(i.total_qty)} ${escapeHtml(i.unit)}</td></tr>`
  ).join('')
}

// sections: [{ heading, items: [{name_he, customerBreakdown, total_qty, unit}] }]
// One <div> per section, each forced onto its own printed page except the last.
export function buildProductionListHtml({ htmlTitle, h2, subheading, sections }) {
  const body = sections.map((s, i) => `
    <div style="${i < sections.length - 1 ? 'page-break-after:always;break-after:page;' : ''}">
      <h3 style="margin:0 0 4px;font-size:18px">${escapeHtml(s.heading)}</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #333">פריט</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:2px solid #333">לפי לקוח</th>
          <th style="text-align:left;padding:6px 10px;border-bottom:2px solid #333">כמות כוללת</th>
        </tr></thead>
        <tbody>${productionRowsHtml(s.items)}</tbody>
      </table>
    </div>`).join('')

  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
    <title>${escapeHtml(htmlTitle)}</title>
    <style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;margin:0}h2{margin:0 0 16px}p{color:#666;font-size:14px;margin:0 0 20px}</style>
    </head><body>
    <h2>${escapeHtml(h2)}</h2><p>${escapeHtml(subheading)}</p>
    ${body}
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`
}

export function openAndPrint(html) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}
