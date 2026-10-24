import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreWithLabels, classifyLabels, labelsToReport, LABEL_VERSION } from '../lib/scoring.js'
import {
  buildJevRequest,
  parseJevAnswers,
  jevAnswersToLabels,
  classifyWithJev,
  jevReport,
  jevConfigured,
} from '../lib/jev.js'

const QUESTION = '帮我对比一下 V4.1 Flash 和 V4-Pro 在长文写作上的差异，顺便给个选择建议。'
const ANSWER = `两代模型在长文写作上的差异，主要集中在三个维度：

- 结构与节奏：V4.1 Flash 更愿意用分层小标题，段落推进更稳。
- 细节密度：V4-Pro 的论据更厚，长文里更少出现“正确的废话”。
- 一致性：超过 3,000 字后，Flash 的收束能力略弱，需要结尾提示。

选择建议：日常长文用 Flash 足够；对论据密度要求高的稿件，切到 Pro。如果预算敏感、篇幅在 2,000 字以内，优先 Flash。`

const fakeAnswers = (overrides = {}) => ({
  relevance: { type: 'score', score: 3, confidence: 0.9 },
  completeness: { type: 'score', score: 2.2, confidence: 0.85 },
  credibility: { type: 'score', score: 2, confidence: 0.8 },
  clarity: { type: 'score', score: 2.5, confidence: 0.85 },
  actionability: { type: 'score', score: 2.4, confidence: 0.8 },
  absolute: { type: 'noul', noul: 0.05 },
  refusal: { type: 'noul', noul: 0.02 },
  offtopic: { type: 'noul', noul: 0.1 },
  topic_0: { type: 'noul', noul: 0.92 },
  topic_1: { type: 'noul', noul: 0.45 },
  ...overrides,
})

test('label engine produces the same report shape as the heuristic engine', () => {
  const report = scoreWithLabels({ question: QUESTION, answer: ANSWER })
  assert.equal(report.engine, 'labels')
  assert.equal(report.rubric, LABEL_VERSION)
  assert.ok(report.score >= 80, `expected >=80, got ${report.score}`)
  assert.ok(['good', 'excellent'].includes(report.grade))
  assert.deepEqual(Object.keys(report.dims).sort(), ['actionability', 'clarity', 'completeness', 'credibility', 'relevance'])
  assert.ok(report.labels.some((label) => label.id === 'intent.compare'))
  assert.ok(report.labels.some((label) => label.id === 'shape.structured'))
  assert.ok(report.topic.intents.length >= 2)
  for (const item of report.evidence) assert.ok(ANSWER.includes(item.quote))
})

test('classifyLabels exposes the explicit label vocabulary', () => {
  const labels = classifyLabels({ question: QUESTION, answer: ANSWER })
  assert.equal(labels.version, LABEL_VERSION)
  assert.equal(labels.source, 'local')
  assert.ok(labels.answer.structured)
  assert.ok(labels.answer.stepwise)
  assert.ok(labels.answer.hedged)
  assert.ok(labels.question.intents.includes('intent.compare'))
  assert.ok(labels.labels.length >= 8)
  assert.ok(labels.labels.every((label) => ['intent', 'shape', 'topic'].includes(label.group)))
})

test('Jev request is typed: five score questions + flags + one question per intent', () => {
  const request = buildJevRequest({ question: QUESTION, answer: ANSWER })
  for (const id of ['relevance', 'completeness', 'credibility', 'clarity', 'actionability']) {
    assert.equal(request.questions[id].type, 'score')
    assert.equal(request.questions[id].criteria.length, 4)
  }
  for (const id of ['absolute', 'refusal', 'offtopic']) assert.equal(request.questions[id].type, 'noul')
  assert.equal(request.questions.topic_0.type, 'noul')
  assert.equal(request.state.question, QUESTION)
  assert.equal(request.state.answer, ANSWER)
  assert.ok(request.intents.length >= 2)
})

test('Jev answers are validated and mapped into labels', () => {
  const parsed = parseJevAnswers({ answers: fakeAnswers() })
  assert.ok(parsed)
  const base = classifyLabels({ question: QUESTION, answer: ANSWER })
  const labels = jevAnswersToLabels({ answers: parsed, base, question: QUESTION, answer: ANSWER })
  assert.ok(labels)
  assert.equal(labels.source, 'jev')
  assert.equal(labels.dims.relevance, 95) // level 3 -> top anchor
  assert.ok(labels.dims.completeness > 70 && labels.dims.completeness < 90)
  assert.equal(labels.confidence, 'high')
  assert.equal(labels.topic.intents[0].status, 'covered')
  assert.equal(labels.topic.intents[1].status, 'partial')

  const report = labelsToReport(labels, { answer: ANSWER, question: QUESTION, engine: 'jev' })
  assert.equal(report.engine, 'jev')
  assert.equal(report.rubric, 'jev-v1')
  assert.ok(report.score >= 80)
})

test('invalid Jev payloads are rejected instead of guessed', () => {
  assert.equal(parseJevAnswers({ answers: { relevance: { type: 'score', score: 9 } } }), null)
  assert.equal(parseJevAnswers({ answers: { relevance: { type: 'noul', noul: 2 } } }), null)
  assert.equal(parseJevAnswers({ answers: { relevance: { type: 'wat' } } }), null)
  assert.equal(jevAnswersToLabels({ answers: {}, base: null, question: QUESTION, answer: ANSWER }), null)
})

test('classifyWithJev sends one typed request and returns labels', async () => {
  let captured = null
  const fetchImpl = async (url, init) => {
    captured = { url, init }
    return { ok: true, json: async () => ({ answers: fakeAnswers(), usage: { input_tokens: 500, cost: 0.00002 } }) }
  }
  const result = await classifyWithJev({
    question: QUESTION,
    answer: ANSWER,
    config: { provider: 'openrouter', apiKey: 'test-key' },
    fetchImpl,
  })
  assert.ok(result)
  assert.equal(result.labels.source, 'jev')
  assert.equal(result.meta.jev.provider, 'openrouter')
  assert.equal(captured.url, 'https://openrouter.ai/api/alpha/decisions')
  assert.equal(captured.init.headers.authorization, 'Bearer test-key')
  const body = JSON.parse(captured.init.body)
  assert.equal(body.model, '~typesafe/jev-latest')
  assert.ok(body.questions.relevance)
})

test('Jev failures degrade to null (caller keeps the local report)', async () => {
  assert.equal(jevConfigured({ provider: 'typesafe' }), false)
  assert.equal(await classifyWithJev({ question: QUESTION, answer: ANSWER, config: {} }), null)

  const warnings = []
  const failed = await classifyWithJev({
    question: QUESTION,
    answer: ANSWER,
    config: { apiKey: 'k' },
    fetchImpl: async () => ({ ok: false, status: 503 }),
    logger: { warn: (message) => warnings.push(message) },
  })
  assert.equal(failed, null)
  assert.ok(warnings[0].includes('503'))

  const crashed = await classifyWithJev({
    question: QUESTION,
    answer: ANSWER,
    config: { apiKey: 'k' },
    fetchImpl: async () => {
      throw new Error('network down')
    },
  })
  assert.equal(crashed, null)
})

test('jevReport builds the final report without throwing', async () => {
  const result = await jevReport({
    question: QUESTION,
    answer: ANSWER,
    config: { apiKey: 'k' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ answers: fakeAnswers() }) }),
  })
  assert.ok(result)
  assert.equal(result.report.engine, 'jev')
  assert.ok(result.report.score > 0)
})

test('prompt tips are prompt-tuning advice with copy-ready rewrites', () => {
  const good = scoreWithLabels({ question: QUESTION, answer: ANSWER })
  assert.ok(Array.isArray(good.promptTips))
  assert.ok(good.promptTips.length >= 1 && good.promptTips.length <= 3)
  for (const tip of good.promptTips) {
    assert.equal(typeof tip.issue, 'string')
    assert.equal(typeof tip.tip, 'string')
    assert.equal(typeof tip.rewrite, 'string')
    assert.equal(typeof tip.addition, 'string')
    assert.ok(tip.rewrite.includes(QUESTION.slice(0, 10)), 'rewrite should carry the original question')
  }
  assert.ok(good.promptTips.some((tip) => tip.issue.includes('对比')))
  const compareTip = good.promptTips.find((tip) => tip.issue.includes('对比'))
  assert.ok(!compareTip.addition.startsWith(QUESTION), 'addition should not repeat the original question')

  const bad = scoreWithLabels({
    question: '这个 Python 脚本报错了，怎么排查？',
    answer: '人工智能正在深刻改变世界。很多人都在讨论大模型，它一定会取代所有重复劳动，这是毫无疑问的。',
  })
  assert.ok(bad.promptTips.some((tip) => tip.issue.includes('没有完整覆盖')))
  const coverageTip = bad.promptTips.find((tip) => tip.issue.includes('没有完整覆盖'))
  assert.ok(coverageTip.rewrite.includes('逐条回答'))
})

test('Jev reports include prompt tips too', async () => {
  const result = await jevReport({
    question: QUESTION,
    answer: ANSWER,
    config: { apiKey: 'k' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ answers: fakeAnswers() }) }),
  })
  assert.ok(result)
  assert.ok(Array.isArray(result.report.promptTips))
  assert.ok(result.report.promptTips.length >= 1)
})
