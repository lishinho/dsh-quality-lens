#!/usr/bin/env node
/**
 * 校准脚本：把本地评分结果和你的人工打分对比。
 *
 * 输入：JSONL，每行 { question, answer, humanScore? }（humanScore 0-100）
 * 输出：样本数、MAE、RMSE、Spearman、档位一致率、偏差最大的 5 条。
 *
 * 用法：
 *   node scripts/calibrate.mjs                       # 默认 calibration/samples.jsonl
 *   node scripts/calibrate.mjs --engine heuristic    # 对比旧规则
 *   node scripts/calibrate.mjs --in x.jsonl --out calibration/report.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { scoreAnswer, scoreWithLabels } from '../lib/scoring.js'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const input = path.resolve(option('in', 'calibration/samples.jsonl'))
const output = option('out', '')
const engine = option('engine', 'labels')

if (!fs.existsSync(input)) {
  console.error(`找不到输入文件：${input}`)
  console.error('先运行：node scripts/extract-samples.mjs')
  process.exit(1)
}

const rows = fs
  .readFileSync(input, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line, index) => {
    try {
      return { ...JSON.parse(line), index }
    } catch {
      console.warn(`跳过第 ${index + 1} 行：不是合法 JSON`)
      return null
    }
  })
  .filter(Boolean)

const score = (row) => {
  const report = engine === 'heuristic'
    ? scoreAnswer({ question: row.question ?? '', answer: row.answer ?? '' })
    : scoreWithLabels({ question: row.question ?? '', answer: row.answer ?? '' })
  return report
}

const results = rows.map((row) => {
  const report = score(row)
  return {
    index: row.index,
    question: String(row.question ?? ''),
    score: report.score,
    grade: report.grade,
    humanScore: typeof row.humanScore === 'number' ? row.humanScore : null,
    diff: typeof row.humanScore === 'number' ? report.score - row.humanScore : null,
    report,
  }
})

const labeled = results.filter((row) => row.humanScore !== null)
const mean = (values) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length)
const round = (value) => Math.round(value * 10) / 10

const report = {
  engine,
  samples: results.length,
  labeled: labeled.length,
  meanScore: round(mean(results.map((row) => row.score))),
  distribution: {
    excellent: results.filter((row) => row.grade === 'excellent').length,
    good: results.filter((row) => row.grade === 'good').length,
    fair: results.filter((row) => row.grade === 'fair').length,
    poor: results.filter((row) => row.grade === 'poor').length,
  },
}

if (labeled.length > 0) {
  const diffs = labeled.map((row) => row.diff)
  report.mae = round(mean(diffs.map(Math.abs)))
  report.rmse = round(Math.sqrt(mean(diffs.map((d) => d * d))))
  report.bias = round(mean(diffs))
  report.bandAgreement = round(
    (100 * labeled.filter((row) => {
      const humanGrade = row.humanScore >= 90 ? 'excellent' : row.humanScore >= 75 ? 'good' : row.humanScore >= 60 ? 'fair' : 'poor'
      return humanGrade === row.grade
    }).length) / labeled.length,
  )
  // Spearman rank correlation (ties broken by index).
  const rank = (values) => {
    const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
    const ranks = new Array(values.length)
    sorted.forEach((item, position) => {
      ranks[item.index] = position
    })
    return ranks
  }
  const rankA = rank(labeled.map((row) => row.score))
  const rankB = rank(labeled.map((row) => row.humanScore))
  const n = labeled.length
  const d2 = rankA.reduce((sum, value, index) => sum + (value - rankB[index]) ** 2, 0)
  report.spearman = round(1 - (6 * d2) / (n * (n * n - 1)))
  report.largestMisses = [...labeled]
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 5)
    .map((row) => ({
      question: `${row.question.slice(0, 50)}${row.question.length > 50 ? '…' : ''}`,
      auto: row.score,
      human: row.humanScore,
      diff: row.diff,
    }))
}

console.log(`引擎：${engine} · 样本：${results.length} · 已标注：${labeled.length}`)
console.log(`自动分均值：${report.meanScore} · 分布：${JSON.stringify(report.distribution)}`)
if (labeled.length === 0) {
  console.log('\n还没有人工分。给 samples.jsonl 的每行补一个 0-100 的 humanScore 再运行。')
  console.log('建议：1-5 星映射为 30/50/70/85/95；至少标 20 条，覆盖代码/写作/对比/闲聊。')
} else {
  console.log(`MAE：${report.mae} · RMSE：${report.rmse} · 偏差：${report.bias > 0 ? '+' : ''}${report.bias} · Spearman：${report.spearman} · 档位一致率：${report.bandAgreement}%`)
  console.log('\n偏差最大的 5 条：')
  for (const miss of report.largestMisses) {
    console.log(`  自动 ${miss.auto} / 人工 ${miss.human}（${miss.diff > 0 ? '+' : ''}${miss.diff}） ${miss.question}`)
  }
  if (report.mae <= 8) console.log('\n结论：MAE ≤ 8，可以发布；继续用真实样本扩充。')
  else console.log('\n结论：MAE > 8，先调规则或看看偏差最大的样本类型。')
}

if (output) {
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
  fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n报告已写入：${path.resolve(output)}`)
}
