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
// dir: document direction -- follows the staff app's current language toggle.
export function buildPackingListHtml({ htmlTitle, h2, subheading, sections, dir = 'rtl' }) {
  const isSingle = sections.length === 1 && !sections[0].heading

  if (isSingle) {
    const rows = rowsHtml(sections[0].items, '8px 12px')
    return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8">
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

  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8">
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
// dir/labels: follow the staff app's current language toggle.
export function buildProductionListHtml({ htmlTitle, h2, subheading, sections, dir = 'rtl', labels = {} }) {
  const L = { item: 'פריט', byCustomer: 'לפי לקוח', totalQty: 'כמות כוללת', ...labels }
  const start = dir === 'rtl' ? 'right' : 'left'
  const end = dir === 'rtl' ? 'left' : 'right'
  const body = sections.map((s, i) => `
    <div style="${i < sections.length - 1 ? 'page-break-after:always;break-after:page;' : ''}">
      <h3 style="margin:0 0 4px;font-size:18px">${escapeHtml(s.heading)}</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:${start};padding:6px 10px;border-bottom:2px solid #333">${escapeHtml(L.item)}</th>
          <th style="text-align:${start};padding:6px 10px;border-bottom:2px solid #333">${escapeHtml(L.byCustomer)}</th>
          <th style="text-align:${end};padding:6px 10px;border-bottom:2px solid #333">${escapeHtml(L.totalQty)}</th>
        </tr></thead>
        <tbody>${productionRowsHtml(s.items)}</tbody>
      </table>
    </div>`).join('')

  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8">
    <title>${escapeHtml(htmlTitle)}</title>
    <style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;margin:0}h2{margin:0 0 16px}p{color:#666;font-size:14px;margin:0 0 20px}</style>
    </head><body>
    <h2>${escapeHtml(h2)}</h2><p>${escapeHtml(subheading)}</p>
    ${body}
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`
}

// sections: [{ heading, items: [{ name, unit, category, days: {dayKey: qty}, total }] }]
// dayLabels: [{ key, short_en }] in display order (Sun..Sat) -- despite the
// field name, callers pass whichever language's short label is currently active.
// dir/labels: follow the staff app's current language toggle.
export function buildWeeklyProductionHtml({ htmlTitle, h1, subheading, dayLabels, sections, dir = 'ltr', labels = {} }) {
  const L = { item: 'Item', category: 'Category', unit: 'Unit', total: 'Total', ...labels }
  const start = dir === 'rtl' ? 'right' : 'left'
  const dayHeaders = dayLabels.map(d =>
    `<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333">${escapeHtml(d.short_en)}</th>`
  ).join('')

  const body = sections.map(s => {
    const rows = s.items.map(i => {
      const dayCells = dayLabels.map(d => {
        const qty = i.days[d.key]
        return `<td style="text-align:center;padding:6px 8px;border-bottom:1px solid #eee">${qty ? (qty % 1 === 0 ? qty : qty.toFixed(1)) : '—'}</td>`
      }).join('')
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(i.name)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#555">${escapeHtml(i.category)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#555">${escapeHtml(i.unit)}</td>
        ${dayCells}
        <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #eee;font-weight:700">${i.total % 1 === 0 ? i.total : i.total.toFixed(1)}</td>
      </tr>`
    }).join('')
    return `<div style="page-break-inside:avoid;margin-bottom:24px">
      <h3 style="margin:0 0 6px;font-size:16px">${escapeHtml(s.heading)}</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:${start};padding:6px 10px;border-bottom:2px solid #333">${escapeHtml(L.item)}</th>
          <th style="text-align:${start};padding:6px 10px;border-bottom:2px solid #333">${escapeHtml(L.category)}</th>
          <th style="text-align:${start};padding:6px 10px;border-bottom:2px solid #333">${escapeHtml(L.unit)}</th>
          ${dayHeaders}
          <th style="text-align:center;padding:6px 8px;border-bottom:2px solid #333">${escapeHtml(L.total)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')

  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8">
    <title>${escapeHtml(htmlTitle)}</title>
    <style>@page{size:A4 landscape;margin:14mm}body{font-family:Arial,sans-serif;margin:0}h1{margin:0 0 4px;font-size:20px}p{color:#666;font-size:13px;margin:0 0 18px}</style>
    </head><body>
    <h1>${escapeHtml(h1)}</h1><p>${escapeHtml(subheading)}</p>
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
