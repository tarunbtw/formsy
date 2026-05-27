import { build } from 'esbuild'
import { gzipSync } from 'zlib'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const result = await build({
  entryPoints: [join(__dirname, 'src/index.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'FormsySDK',
  target: ['es2017'],
  outfile: join(__dirname, 'dist/formsy.min.js'),
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
})

// Report gzipped size
const raw = readFileSync(join(__dirname, 'dist/formsy.min.js'))
const gzipped = gzipSync(raw)
const kb = (gzipped.length / 1024).toFixed(2)
console.log(`✓ Built dist/formsy.min.js — ${kb}KB gzipped`)

if (gzipped.length > 5 * 1024) {
  console.warn(`⚠ Bundle exceeds 5KB gzipped target (${kb}KB)`)
}
