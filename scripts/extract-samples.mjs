#!/usr/bin/env node
/**
 * 从本机 DSH 会话记录里抽取「问题 → 回答」样本，用于校准评分规则。
 *
 * 只读本机 `$DSH_HOME/sessions`，只在本地写 JSONL；不联网、不上传。
 * 抽出来的文件默认在 `calibration/`，已加入 .gitignore，不会被提交。
 *
 * 用法：
 *   node scripts/extract-samples.mjs                 # 输出 calibration/samples.jsonl
 *   node scripts/extract-samples.mjs --limit 40      # 最多 40 条（默认 30）
 *   node scripts/extract-samples.mjs --min-chars 120 # 回答最短长度（默认 80）
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { zstdDecompressSync } from 'node:zlib'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const dshHome = process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
  ? process.env.DSH_HOME
  : path.join(os.homedir(), '.dsh')
const sessionsRoot = path.join(dshHome, 'sessions')
const outPath = path.resolve(option('out', 'calibration/samples.jsonl'))
const limit = Math.max(1, Number(option('limit', 30)) || 30)
const minChars = Math.max(1, Number(option('min-chars', 80)) || 80)

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Decode a dsh session log: one zstd frame per event, or a plain JSONL file. */
function decodeSessionFile(file) {
  const raw = fs.readFileSync(file)
  if (!raw.subarray(0, 4).equals(MAGIC)) return raw.toString('utf8')
  const starts = []
  for (let i = 0; i + 3 < raw.length; i += 1) {
    if (raw[i] === 0x28 && raw[i + 1] === 0xb5 && raw[i + 2] === 0x2f && raw[i + 3] === 0xfd) starts.push(i)
  }
  // A single frame: decompress as one buffer.
  if (starts.length === 1) {
    try {
      return zstdDecompressSync(raw).toString('utf8')
    } catch {
      return ''
    }
  }
  let text = ''
  for (let i = 0; i < starts.length; i += 1) {
    const chunk = raw.subarray(starts[i], i + 1 < starts.length ? starts[i + 1] : raw.length)
    try {
      text += zstdDecompressSync(chunk).toString('utf8')
    } catch {
      // Skip a frame we cannot decode; the rest of the session is still useful.
    }
  }
  return text
}

function walk(dir) {
  const out = []
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name === 'session.v4.jsonl.zstd' || /^session\..*\.jsonl$/.test(entry.name)) out.push(full)
  }
  return out
}

function blocksToText(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

const files = walk(sessionsRoot)
if (files.length === 0) {
  console.error(`没有找到会话记录：${sessionsRoot}`)
  process.exit(1)
}

const samples = []
const seen = new Set()
for (const file of files) {
  const text = decodeSessionFile(file)
  if (!text) continue
  let question = ''
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type === 'user/message') {
      const message = event.data?.message ?? event.data
      const source = message?.source?.kind
      if (typeof source === 'string' && source !== 'user') continue
      const value = blocksToText(message?.content)
      if (value) question = value
      continue
    }
    if (event.type !== 'assistant/message') continue
    const message = event.data?.message
    const answer = blocksToText(message?.content)
    if (!question || !answer || answer.length < minChars) continue
    const hash = crypto.createHash('sha256').update(`${question}\u0000${answer}`).digest('hex')
    if (seen.has(hash)) continue
    seen.add(hash)
    samples.push({
      question,
      answer,
      model: message?.model ?? null,
      at: event.time ? new Date(event.time).toISOString() : null,
      source: 'dsh-session',
      humanScore: null,
    })
  }
}

samples.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
const picked = samples.slice(0, limit)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, `${picked.map((sample) => JSON.stringify(sample)).join('\n')}\n`, 'utf8')

console.log(`扫描会话文件：${files.length}`)
console.log(`找到可用问答：${samples.length}，写出：${picked.length}`)
console.log(`输出：${outPath}`)
console.log('下一步：给每行补 humanScore（0-100），再运行 node scripts/calibrate.mjs')
console.log('隐私：文件只在本机；已加入 .gitignore，不会上传或被提交。')
