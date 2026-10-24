#!/usr/bin/env node
/**
 * 把 lib/scoring.js 内联进原型模板，生成可以双击打开的 prototype/index.html。
 * 原型不联网：评分跑真实的本地引擎，Jev 与分享下载均为演示。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const scoring = fs.readFileSync(path.join(here, '..', 'lib', 'scoring.js'), 'utf8')
  .replace(/^export\s+/gm, '')
const template = fs.readFileSync(path.join(here, 'template.html'), 'utf8')
const marker = '/*__SCORING__*/'
if (!template.includes(marker)) throw new Error('template marker missing')
const qr = fs.readFileSync(path.join(here, '..', 'assets', 'qr-mp.png')).toString('base64')
const html = template
  .replace(marker, scoring)
  .replace(/src="\.\.\/assets\/qr-mp\.png"/g, `src="data:image/png;base64,${qr}"`)
fs.writeFileSync(path.join(here, 'index.html'), html, 'utf8')
console.log(`已生成 ${path.join(here, 'index.html')}（${(html.length / 1024).toFixed(0)} KB）`)
