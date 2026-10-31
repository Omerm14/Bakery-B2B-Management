// SVG → PNG for the images sent to Telegram (weekly report, bot summaries).
// resvg runs as WebAssembly; fonts come from Google Fonts (Assistant for
// Hebrew text, Spline Sans Mono for numbers) and are loaded once per worker.
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2'

const WASM_URL = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm'
// Without a browser user agent Google Fonts serves complete TTF files (all
// scripts in one file), which is what resvg can load.
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Spline+Sans+Mono:wght@700'

let ready: Promise<Uint8Array[]> | null = null
function loadAssets(): Promise<Uint8Array[]> {
  ready ??= (async () => {
    await initWasm(fetch(WASM_URL))
    const css = await (await fetch(FONTS_CSS)).text()
    const urls = [...css.matchAll(/url\((https:[^)]+\.ttf)\)/g)].map(m => m[1])
    if (urls.length === 0) throw new Error('no fonts found in Google Fonts CSS')
    return Promise.all(urls.map(async u => new Uint8Array(await (await fetch(u)).arrayBuffer())))
  })()
  // A failed load (network blip) is retried on the next call.
  ready.catch(() => { ready = null })
  return ready
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  const fonts = await loadAssets()
  return new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { fontBuffers: fonts, defaultFontFamily: 'Assistant', loadSystemFonts: false },
  }).render().asPng()
}
