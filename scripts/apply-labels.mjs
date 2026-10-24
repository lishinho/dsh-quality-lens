#!/usr/bin/env node
/**
 * 合并标注页导出的 labels.jsonl 与 calibration/set.jsonl，
 * 生成可以直接喂给 calibrate.mjs 的 calibration/samples.labeled.jsonl。
 *
 * 用法：
 *   node scripts/apply-labels.mjs --labels calibration/labels.jsonl
 *   node scripts/calibrate.mjs --in calibration/samples.labeled.jsonl
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const setPath = path.resolve(option('set', 'calibration/set.jsonl'))
const labelsPath = path.resolve(option('labels', 'calibration/labels.jsonl'))
const outPath = path.resolve(option('out', 'calibration/samples.labeled.jsonl'))

for (const file of [setPath, labelsPath]) {
  if (!fs.existsSync(file)) {
    console.error(`找不到 ${file}`)
    process.exit(1)
  }
}

const readJsonl = (file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))

const rows = readJsonl(setPath)
const labels = new Map(readJsonl(labelsPath).map((row) => [Number(row.id), row]))
const merged = []
const missing = []

for (const row of rows) {
  const label = labels.get(Number(row.id))
  const humanScore = label && Number.isFinite(Number(label.humanScore)) ? Number(label.humanScore) : null
  if (humanScore === null || humanScore < 0 || humanScore > 100) {
    missing.push(row.id)
    continue
  }
  merged.push({
    question: row.question,
    answer: row.answer,
    humanScore: Math.round(humanScore),
    note: label.note ?? '',
    source: row.source ?? 'session',
    autoScore: row.autoScore ?? null,
    draftScore: row.draftScore ?? null,
  })
}

fs.writeFileSync(outPath, `${merged.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8')
console.log(`标注完成：${merged.length}/${rows.length}`)
if (missing.length > 0) console.log(`未评分（已跳过）：${missing.join(', ')}`)
console.log(`输出：${outPath}`)
console.log('下一步：node scripts/calibrate.mjs --in calibration/samples.labeled.jsonl')
