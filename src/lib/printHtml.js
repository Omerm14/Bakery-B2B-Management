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

export function openAndPrint(html) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  return true
}
