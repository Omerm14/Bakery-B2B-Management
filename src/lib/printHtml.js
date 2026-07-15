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
      </body></html>`
  }

  const body = sections.map(s => `<div style="margin-bottom:28px">
        <h3 style="margin:0 0 4px">${escapeHtml(s.heading)}</h3>
        <table style="width:100%;border-collapse:collapse">${rowsHtml(s.items, '6px 10px')}</table>
      </div>`).join('<hr style="margin:24px 0">')

  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8">
      <title>${escapeHtml(htmlTitle)}</title>
      <style>body{font-family:Arial,sans-serif;margin:30px}h2{margin-bottom:16px}h3{font-size:16px;page-break-after:avoid}tr{page-break-inside:avoid}</style>
      </head><body>
      <h2>${escapeHtml(h2)}</h2>
      ${body}
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
      <h2 style="margin:0 0 4px">${escapeHtml(h2)}</h2><p style="color:#666;font-size:14px;margin:0 0 16px">${escapeHtml(subheading)}</p>
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
    ${body}
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
    `<th style="text-align:center;padding:4px 6px;border-bottom:2px solid #333">${escapeHtml(d.short_en)}</th>`
  ).join('')

  const body = sections.map(s => {
    const rows = s.items.map(i => {
      const dayCells = dayLabels.map(d => {
        const qty = i.days[d.key]
        return `<td style="text-align:center;padding:3px 6px;border-bottom:1px solid #eee">${qty ? (qty % 1 === 0 ? qty : qty.toFixed(1)) : '—'}</td>`
      }).join('')
      return `<tr>
        <td style="padding:3px 8px;border-bottom:1px solid #eee">${escapeHtml(i.name)}</td>
        <td style="padding:3px 8px;border-bottom:1px solid #eee;font-size:9px;color:#555">${escapeHtml(i.category)}</td>
        <td style="padding:3px 8px;border-bottom:1px solid #eee;font-size:9px;color:#555">${escapeHtml(i.unit)}</td>
        ${dayCells}
        <td style="text-align:center;padding:3px 6px;border-bottom:1px solid #eee;font-weight:700">${i.total % 1 === 0 ? i.total : i.total.toFixed(1)}</td>
      </tr>`
    }).join('')
    // page-break-inside/break-inside:avoid on the wrapping div (not just the
    // <table>, which some print engines ignore this on) keeps a category's
    // full row-set together -- the browser pushes the WHOLE section to a
    // fresh page instead of splitting it partway through like before.
    return `<div style="margin-bottom:14px;page-break-inside:avoid;break-inside:avoid">
      <h3 style="margin:0 0 4px;font-size:13px">${escapeHtml(s.heading)}</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:${start};padding:4px 8px;border-bottom:2px solid #333">${escapeHtml(L.item)}</th>
          <th style="text-align:${start};padding:4px 8px;border-bottom:2px solid #333">${escapeHtml(L.category)}</th>
          <th style="text-align:${start};padding:4px 8px;border-bottom:2px solid #333">${escapeHtml(L.unit)}</th>
          ${dayHeaders}
          <th style="text-align:center;padding:4px 6px;border-bottom:2px solid #333">${escapeHtml(L.total)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')

  return `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8">
    <title>${escapeHtml(htmlTitle)}</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;margin:0;font-size:10px}h1{margin:0 0 4px;font-size:16px}p{color:#666;font-size:11px;margin:0 0 12px}h3{page-break-after:avoid}tr{page-break-inside:avoid}thead{display:table-header-group}</style>
    </head><body>
    <h1>${escapeHtml(h1)}</h1><p>${escapeHtml(subheading)}</p>
    ${body}
    </body></html>`
}

// Prints via a hidden iframe injected into the current page instead of
// window.open('', '_blank') + document.write. The app runs as an installed
// PWA (display:"standalone" in the manifest) — in that mode window.open
// frequently hijacks the CURRENT window instead of opening a real new one,
// since a standalone shell has no tab/window chrome to return from. An
// iframe never creates a new browsing context at all, so it's structurally
// incapable of navigating the app away, and isn't subject to popup blockers
// either.
export function printViaIframe(html) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  let cleaned = false
  function cleanup() {
    if (cleaned) return
    cleaned = true
    iframe.remove()
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    win.focus()
    win.print()
    // `afterprint` support is inconsistent (notably older iPad Safari) —
    // the timeout guarantees the hidden iframe never lingers regardless.
    win.addEventListener('afterprint', cleanup)
    setTimeout(cleanup, 60000)
  }

  iframe.srcdoc = html
}
