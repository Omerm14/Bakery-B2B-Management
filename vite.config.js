import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Two HTML entries sharing the same React app/router: index.html (staff
// app + marketing landing) and portal.html (customer portal), so each can
// carry its own <title>/OG tags for link previews — vercel.json routes
// /portal/* to portal.html, everything else to index.html.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        portal: resolve(__dirname, 'portal.html'),
      },
    },
  },
})
