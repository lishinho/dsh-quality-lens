/**
 * Jev adapter (opt-in, M1-ready).
 *
 * Jev is TypeSafe's non-generative "System One" decision model: one request
 * carries typed questions (`noul` yes/no, `choice`, `score` ordered levels) and
 * returns calibrated answers with per-dimension confidence. We use it as a
 * label producer: the answers are mapped into the same label vocabulary the
 * local engine emits, then `labelsToReport()` turns them into the same report
 * the client renders.
 *
 * Privacy: enabling this sends the question + answer to the configured
 * provider. It is off by default and never runs without an explicit key.
 * Failures degrade to the local engine; nothing here ever throws at the caller.
 */
import { classifyLabels, labelsToReport, redactSecrets } from './scoring.js'

export const JEV_PROVIDERS = {
  typesafe: {
    endpoint: 'https://api.typesafe.ai/v1/systemone',
    model: 'jev-latest',
    keyEnv: 'TYPESAFE_API_KEY',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/alpha/decisions',
    model: '~typesafe/jev-latest',
    keyEnv: 'OPENROUTER_API_KEY',
  },
}

/** Ordered level anchors per dimension; Jev returns a distribution-weighted level. */
const DIM_LEVELS = {
  relevance: { points: [35, 60, 80, 95], labels: ['答非所问或跑题', '只沾到边', '基本对题', '紧扣问题'] },
  completeness: { points: [35, 62, 82, 95], labels: ['漏掉主要内容', '覆盖主要点但缺边角', '基本完整', '完整，并处理了边界情况'] },
  credibility: { points: [35, 62, 82, 95], labels: ['大量断言没有依据', '部分结论有依据', '基本有依据', '关键结论有来源或明确不确定性'] },
  clarity: { points: [40, 65, 82, 94], labels: ['结构混乱难读', '比较散', '清晰可读', '结构清楚，重点突出'] },
  actionability: { points: [40, 65, 82, 94], labels: ['看完不知道做什么', '只有原则没有步骤', '有可执行步骤', '看完可以直接照做'] },
}

const DIM_QUESTIONS = {
  relevance: '结合提供的上下文，这段回答是否直接回应了用户当前真正想解决的问题，而不是答非所问或泛泛而谈？',
  completeness: '这段回答是否覆盖了用户问题里的所有子问题与必要条件？',
  credibility: '这段回答的表述是否有依据：是否有来源、工具证据，或明确说明了不确定性？',
  clarity: '这段回答的结构与表达是否清晰易读？',
  actionability: '用户看完这段回答后，是否能直接照着做？',
}

function scoreQuestion(id, instructions, levels) {
  return {
    id,
    question: { type: 'score', instructions, criteria: levels },
  }
}

function noulQuestion(id, instructions) {
  return { id, question: { type: 'noul', instructions } }
}

/**
 * Build the typed `{ state, questions }` payload for one answer.
 * The five dimensions are `score` questions; safety/quality flags are `noul`
 * questions; each extracted sub-intent gets its own `noul` coverage question.
 * @param {{ question: string, answer: string, labels?: object }} input
 */
export function buildJevRequest(input) {
  const question = redactSecrets(String(input?.question ?? ''))
  const answer = redactSecrets(String(input?.answer ?? ''))
  const context = redactSecrets(String(input?.context ?? ''))
  const contextAnswer = redactSecrets(String(input?.contextAnswer ?? ''))
  const labels = input?.labels ?? classifyLabels({ question, answer, context, contextAnswer })
  const intents = (labels.topic?.intents ?? []).slice(0, 5)

  const questions = {
    relevance: scoreQuestion('relevance', DIM_QUESTIONS.relevance, DIM_LEVELS.relevance.labels).question,
    completeness: scoreQuestion('completeness', DIM_QUESTIONS.completeness, DIM_LEVELS.completeness.labels).question,
    credibility: scoreQuestion('credibility', DIM_QUESTIONS.credibility, DIM_LEVELS.credibility.labels).question,
    clarity: scoreQuestion('clarity', DIM_QUESTIONS.clarity, DIM_LEVELS.clarity.labels).question,
    actionability: scoreQuestion('actionability', DIM_QUESTIONS.actionability, DIM_LEVELS.actionability.labels).question,
    absolute: noulQuestion('absolute', '这段回答是否包含绝对化、没有限定条件的断言（如“一定/必然/永远/所有”）？').question,
    refusal: noulQuestion('refusal', '这段回答是否在拒答、推脱，或只是要求用户补充信息而没有实质回答？').question,
    offtopic: noulQuestion('offtopic', '这段回答是否有明显与用户问题无关的段落？').question,
  }

  intents.forEach((intent, index) => {
    questions[`topic_${index}`] = noulQuestion(
      `topic_${index}`,
      `这段回答是否实质覆盖了用户问题中的这个子意图：「${intent.label}」？只出现关键词不算。`,
    ).question
  })

  return {
    state: { question, answer, ...(context ? { context } : {}), ...(input?.contextAnswer ? { contextAnswer: String(input.contextAnswer).slice(0, 800) } : {}) },
    questions,
    intents: intents.map((intent) => intent.label),
  }
}

function isProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/** Validate provider answers; returns a normalized map or null. */
export function parseJevAnswers(body) {
  const answers = body && typeof body === 'object' && body.answers && typeof body.answers === 'object'
    ? body.answers
    : body
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null
  const out = {}
  for (const [id, raw] of Object.entries(answers)) {
    if (!raw || typeof raw !== 'object') return null
    if (raw.type === 'noul') {
      if (!isProbability(raw.noul)) return null
      out[id] = { type: 'noul', noul: raw.noul }
      continue
    }
    if (raw.type === 'score') {
      if (typeof raw.score !== 'number' || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 3) return null
      out[id] = { type: 'score', score: raw.score, confidence: isProbability(raw.confidence) ? raw.confidence : 0.6 }
      continue
    }
    if (raw.type === 'choice') {
      if (typeof raw.choice !== 'string' || !isProbability(raw.confidence)) return null
      out[id] = { type: 'choice', choice: raw.choice, confidence: raw.confidence }
      continue
    }
    return null
  }
  return out
}

function levelToPoints(score, points) {
  const clamped = Math.max(0, Math.min(points.length - 1, score))
  const low = Math.floor(clamped)
  const high = Math.min(points.length - 1, low + 1)
  const frac = clamped - low
  return points[low] * (1 - frac) + points[high] * frac
}

const threshold = (value) => (value >= 0.6 ? true : value <= 0.4 ? false : undefined)

/**
 * Map parsed Jev answers into the shared label vocabulary.
 * @param {{ answers: object, base: object, question: string, answer: string }} input
 * @returns {object|null} labels (same shape as `classifyLabels`) or null
 */
export function jevAnswersToLabels({ answers, base, question, answer }) {
  if (!answers || typeof answers !== 'object') return null
  const source = base ?? classifyLabels({ question, answer })
  const dims = {}
  const confidences = []
  for (const [dim, spec] of Object.entries(DIM_LEVELS)) {
    const entry = answers[dim]
    if (!entry || entry.type !== 'score') return null
    dims[dim] = Math.round(levelToPoints(entry.score, spec.points))
    confidences.push(entry.confidence)
  }

  const flags = {}
  for (const flag of ['absolute', 'refusal', 'offtopic']) {
    const entry = answers[flag]
    if (entry && entry.type === 'noul') flags[flag] = threshold(entry.noul)
  }

  const intents = (source.topic?.intents ?? []).map((intent, index) => {
    const entry = answers[`topic_${index}`]
    if (!entry || entry.type !== 'noul') return intent
    const coverage = entry.noul
    return {
      ...intent,
      coverage: Number(coverage.toFixed(3)),
      status: coverage >= 0.6 ? 'covered' : coverage >= 0.3 ? 'partial' : 'missing',
    }
  })
  const ratio = intents.length === 0 ? 0 : intents.reduce((sum, intent) => sum + intent.coverage, 0) / intents.length
  const topic = {
    ...source.topic,
    intents,
    ratio,
    covered: intents.filter((intent) => intent.status === 'covered'),
    partial: intents.filter((intent) => intent.status === 'partial'),
    missing: intents.filter((intent) => intent.status === 'missing'),
  }

  const average = confidences.length === 0 ? 0.6 : confidences.reduce((a, b) => a + b, 0) / confidences.length
  const labels = {
    ...source,
    source: 'jev',
    confidence: average >= 0.75 ? 'high' : average >= 0.5 ? 'medium' : 'low',
    dims,
    topic,
    answer: {
      ...source.answer,
      ...(flags.absolute === undefined ? {} : { absolute: flags.absolute }),
      ...(flags.refusal === undefined ? {} : { refusal: flags.refusal }),
      ...(flags.offtopic === undefined ? {} : { offtopic: flags.offtopic }),
    },
    labels: [
      ...(source.labels ?? []),
      ...Object.entries(dims).map(([dim, value]) => ({ group: 'jev', id: `jev.dim.${dim}`, confidence: Number(average.toFixed(2)), value })),
    ],
  }
  return labels
}

function resolveJevConfig(config = {}) {
  const providerKey = config.provider === 'openrouter' ? 'openrouter' : config.provider === 'custom' ? 'custom' : 'typesafe'
  const preset = JEV_PROVIDERS[providerKey]
  const endpoint = config.endpoint || preset?.endpoint
  const model = config.model || preset?.model
  const keyEnv = config.apiKeyEnv || preset?.keyEnv || 'TYPESAFE_API_KEY'
  const key = config.apiKey || process.env[keyEnv]
  return { provider: providerKey, endpoint, model, key, keyEnv }
}

/** Whether the current config can actually call Jev (without revealing the key). */
export function jevConfigured(config = {}) {
  const resolved = resolveJevConfig(config)
  return Boolean(resolved.endpoint && resolved.model && resolved.key)
}

/**
 * Ask Jev for the label set of one answer.
 * @param {{ question: string, answer: string, config?: object, fetchImpl?: typeof fetch, logger?: object }} input
 * @returns {Promise<{ labels: object, meta: object } | null>} null on any failure
 */
export async function classifyWithJev(input) {
  const question = String(input?.question ?? '')
  const answer = String(input?.answer ?? '')
  const context = String(input?.context ?? '')
  const contextAnswer = String(input?.contextAnswer ?? '')
  if (!answer) return null
  const config = input?.config ?? {}
  const resolved = resolveJevConfig(config)
  if (!resolved.endpoint || !resolved.model || !resolved.key) return null

  const base = classifyLabels({ question, answer, context, contextAnswer })
  const payload = buildJevRequest({ question, answer, context, labels: base })
  const fetchImpl = input?.fetchImpl ?? fetch
  const timeoutMs = Math.max(500, Math.min(15000, Number(config.timeoutMs) || 4000))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const response = await fetchImpl(resolved.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${resolved.key}`,
      },
      body: JSON.stringify({
        model: resolved.model,
        state: payload.state,
        questions: payload.questions,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      input?.logger?.warn?.(`[quality-lens] jev http ${response.status}; falling back to local labels`)
      return null
    }
    const body = await response.json()
    const answers = parseJevAnswers(body)
    if (!answers) {
      input?.logger?.warn?.('[quality-lens] jev returned an invalid answer payload; falling back')
      return null
    }
    const labels = jevAnswersToLabels({ answers, base, question, answer })
    if (!labels) return null
    return {
      labels,
      meta: {
        jev: {
          provider: resolved.provider,
          model: resolved.model,
          latencyMs: Date.now() - started,
          inputTokens: body?.usage?.input_tokens ?? null,
          costUsd: body?.usage?.cost ?? null,
        },
      },
    }
  } catch (error) {
    input?.logger?.warn?.(`[quality-lens] jev failed (${error?.message ?? error}); falling back to local labels`)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Convenience: classify + build the final report. Returns null on failure.
 * @param {{ question: string, answer: string, config?: object, fetchImpl?: typeof fetch, logger?: object }} input
 */
export async function jevReport(input) {
  const result = await classifyWithJev(input)
  if (!result) return null
  return {
    report: labelsToReport(result.labels, {
      answer: input.answer,
      question: input.question,
      context: input.context,
      engine: 'jev',
      meta: result.meta,
    }),
    meta: result.meta,
  }
}
