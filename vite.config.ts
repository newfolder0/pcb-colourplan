import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// App version (from package.json) reported with opt-in telemetry events.
const appVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).version as string

// jsPDF lazily pulls in html2canvas/canvg for its raster + .html() paths, which
// we never use (PDFs are produced via svg2pdf.js's vector path). Alias them to
// an empty module so ~200 KB of dead code - and its attack surface - stays out
// of the bundle.
const emptyModule = fileURLToPath(new URL('./scripts/empty-module.js', import.meta.url))

// Content-Security-Policy injected into the *built* index.html only.
//
// We inject at build time (not statically in index.html) because a strict CSP
// would block Vite's dev-server HMR (inline scripts + ws connection). The built
// bundle is what gets served by Caddy AND by any static host (GitHub Pages,
// Netlify, S3), so this carries the "a design file can never be exfiltrated"
// guarantee everywhere the app is actually deployed - not just behind Caddy.
// The Caddyfile still sends the authoritative CSP header (plus frame-ancestors,
// which is ignored in a <meta> and so omitted here).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React inline styles + Vite-injected CSS
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function cspMeta(): Plugin {
  return {
    name: 'inject-csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), cspMeta()],
  resolve: {
    alias: {
      html2canvas: emptyModule,
      canvg: emptyModule,
    },
  },
  server: {
    // Bind the dev server to IPv4 loopback only: reachable at http://localhost:5173
    // and http://127.0.0.1:5173, but NOT exposed on the LAN. (The default
    // "localhost" bound IPv6-only here, which some browsers couldn't reach.)
    // The hardened deployment is the Caddy/Docker static build, not this server.
    host: '127.0.0.1',
  },
})
