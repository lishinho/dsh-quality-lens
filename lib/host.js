/**
 * 质量雷达 / Quality Lens — host half.
 *
 * Observational only: it listens for committed assistant messages, scores them
 * with the deterministic local rubric in `scoring.js`, stores the report under
 * `$DSH_HOME/quality-lens/`, and exposes it to the browser half over same-origin
 * JSON routes. It never edits the answer, never steers the agent, and never
 * makes a network request.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scoreAnswer, scoreWithLabels, labelsToReport, isSubstantiveQuestion, RUBRIC_VERSION } from './scoring.js'
import { classifyWithJev, jevConfigured } from './jev.js'

export const name = 'dsh-quality-lens'

/** The route surface needs the host webserver; storage is plain node:fs. */
export const inject = ['webServer']

const DEFAULTS = {
  enabled: true,
  /** 'labels' (default, local), 'heuristic' (v1 rules), or 'jev' (opt-in decision model). */
  engine: 'labels',
  /** Jev config: provider 'typesafe' | 'openrouter' | 'custom'. Never enabled without a key. */
  jev: { provider: 'typesafe', endpoint: '', model: '', apiKey: '', apiKeyEnv: '', timeoutMs: 4000 },
  /** Replies shorter than this are not scored (tool receipts, one-liners). */
  minReplyChars: 80,
  /** Local reports older than this are pruned on load. */
  retentionDays: 90,
  /** Upper bound for the in-memory map and the on-disk feed. */
  maxReports: 2000,
}

const API_PREFIX = '/api/dsh-quality-lens'

const writeJson = (res, status, body) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

const readJsonBody = (req, limit = 8 * 1024) =>
  new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })

/** Visible text only: text blocks, never reasoning or tool-call payloads. */
function blocksToText(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function resolveDshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim() !== ''
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh')
}

export function apply(ctx, config = {}) {
  const settings = {
    ...DEFAULTS,
    ...(config && typeof config === 'object' ? config : {}),
  }
  settings.jev = { ...DEFAULTS.jev, ...(config?.jev && typeof config.jev === 'object' ? config.jev : {}) }
  const dir = path.join(resolveDshHome(), 'quality-lens')
  const reportsFile = path.join(dir, 'reports.jsonl')
  const feedbackFile = path.join(dir, 'feedback.jsonl')

  /** messageId -> report, insertion ordered so the oldest can be evicted. */
  const reports = new Map()
  /** session key -> latest real user prompt, used only to score the next reply. */
  const lastQuestion = new Map()
  /** session key -> user texts collected in the current turn (follow-ups included). */
  const turnUsers = new Map()
  /** session key -> last self-contained user request, used as context for short follow-ups. */
  const lastSubstantive = new Map()
  /** session key -> recent scored Q/A pairs, used as relevance context (last 3). */
  const history = new Map()

  const sessionKey = (session) => {
    const id = session && (session.id ?? session.sessionId)
    return typeof id === 'string' && id !== '' ? id : 'default'
  }

  const appendLine = (file, value) => {
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.appendFileSync(file, `${JSON.stringify(value)}\n`, 'utf8')
    } catch (error) {
      ctx.logger?.warn?.(`[quality-lens] could not persist report: ${error?.message ?? error}`)
    }
  }

  const trim = () => {
    while (reports.size > settings.maxReports) {
      const oldest = reports.keys().next().value
      reports.delete(oldest)
    }
  }

  const loadReports = () => {
    let text = ''
    try {
      text = fs.readFileSync(reportsFile, 'utf8')
    } catch {
      return
    }
    const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000
    const lines = text.split('\n').filter(Boolean).slice(-settings.maxReports)
    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        if (!record?.messageId || typeof record.score !== 'number') continue
        if (record.at && Date.parse(record.at) < cutoff) continue
        reports.set(record.messageId, record)
      } catch {
        // A torn line must never stop the plugin from loading.
      }
    }
    trim()
  }

  const registerRoute = (route) => {
    ctx.effect(() => {
      const dispose = ctx.webServer.register(route)
      return () => {
        try {
          dispose()
        } catch {
          // Route fiber already gone during shutdown.
        }
      }
    }, `quality-lens: route ${route.path}`)
  }

  loadReports()

  ctx.on('session/event', (session, event) => {
    if (!settings.enabled || !event || typeof event.type !== 'string') return
    const data = event.data ?? {}
    const key = sessionKey(session)

    if (event.type === 'turn/start') {
      turnUsers.set(key, [])
      return
    }

    if (event.type === 'user/message') {
      const message = data.message ?? data
      const source = message?.source?.kind
      if (typeof source === 'string' && source !== 'user') return
      const text = blocksToText(message?.content)
      if (!text) return
      lastQuestion.set(key, text)
      if (text.replace(/\s/g, '').length >= 12) lastSubstantive.set(key, text)
      const bucket = turnUsers.get(key) ?? []
      // A turn can carry several real user messages (continued input); keep them
      // all so a short "好的，做吧" follow-up does not erase the actual request.
      if (!bucket.includes(text)) bucket.push(text)
      turnUsers.set(key, bucket)
      return
    }

    if (event.type !== 'assistant/message') return
    const message = data.message
    const messageId = message?.id
    if (typeof messageId !== 'string' || messageId === '') return
    if (reports.has(messageId)) return

    const answer = blocksToText(message?.content)
    if (answer.length < settings.minReplyChars) return

    const batch = turnUsers.get(key) ?? []
    const current = (batch.length > 0 ? batch.join('\n') : lastQuestion.get(key) ?? '').trim()
    turnUsers.set(key, [])
    if (!isSubstantiveQuestion(current)) return
    const question = current
    const recent = (history.get(key) ?? []).slice(-2)
    const fallback = lastSubstantive.get(key)
    const contextParts = [
      ...recent.map((item) => item.question).filter(Boolean),
      ...(fallback && !recent.some((item) => item.question === fallback) ? [fallback] : []),
    ]
    const contextText = contextParts.slice(-2).join('\n')
    const contextAnswer = (recent[recent.length - 1]?.answer ?? '').slice(0, 800)
    const report = settings.engine === 'heuristic'
      ? scoreAnswer({ question, answer, context: contextText })
      : scoreWithLabels({ question, answer, context: contextText, contextAnswer })
    const record = {
      v: 1,
      messageId,
      sessionId: key,
      at: new Date().toISOString(),
      provider: message?.provider ?? data.provider ?? null,
      model: message?.model ?? data.model ?? null,
      ...report,
    }

    history.set(key, [...recent, { question, answer }].slice(-3))

    if (settings.engine === 'jev' && jevConfigured(settings.jev)) {
      // Show the local label report immediately; upgrade it when Jev answers.
      record.pendingJev = true
      reports.set(messageId, record)
      trim()
      appendLine(reportsFile, record)
      void classifyWithJev({ question, answer, context: contextText, contextAnswer, config: settings.jev, logger: ctx.logger, fetchImpl: settings.jev.fetchImpl }).then((result) => {
        if (!result) {
          const settled = { ...record, pendingJev: false }
          reports.set(messageId, settled)
          return
        }
        const upgraded = {
          ...record,
          ...labelsToReport(result.labels, { answer, question, context: contextText, engine: 'jev', meta: result.meta }),
          pendingJev: false,
        }
        reports.set(messageId, upgraded)
        appendLine(reportsFile, upgraded)
      })
      return
    }

    reports.set(messageId, record)
    trim()
    appendLine(reportsFile, record)
  })

  registerRoute({
    kind: 'exact',
    path: `${API_PREFIX}/report`,
    handler: (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const messageId = url.searchParams.get('messageId') ?? ''
      if (messageId === '') {
        writeJson(res, 400, { ok: false, error: 'messageId required' })
        return
      }
      const report = reports.get(messageId)
      if (!report) {
        writeJson(res, 404, { ok: false, error: 'report not found' })
        return
      }
      writeJson(res, 200, { ok: true, report })
    },
  })

  registerRoute({
    kind: 'exact',
    path: `${API_PREFIX}/reports`,
    handler: (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') ?? 50) || 50))
      const items = [...reports.values()].slice(-limit).reverse()
      writeJson(res, 200, { ok: true, items, rubric: RUBRIC_VERSION })
    },
  })

  registerRoute({
    kind: 'exact',
    path: `${API_PREFIX}/feedback`,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: 'POST required' })
        return
      }
      let body
      try {
        body = await readJsonBody(req)
      } catch (error) {
        writeJson(res, 400, { ok: false, error: error?.message ?? 'bad request' })
        return
      }
      const verdict = body?.verdict
      if (verdict !== 'high' && verdict !== 'low') {
        writeJson(res, 400, { ok: false, error: 'verdict must be high or low' })
        return
      }
      const record = {
        messageId: typeof body?.messageId === 'string' ? body.messageId : null,
        verdict,
        reason: typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null,
        at: new Date().toISOString(),
        v: 1,
      }
      appendLine(feedbackFile, record)
      writeJson(res, 200, { ok: true })
    },
  })

  registerRoute({
    kind: 'exact',
    path: `${API_PREFIX}/health`,
    handler: (_req, res) => {
      writeJson(res, 200, {
        ok: true,
        version: 1,
        rubric: RUBRIC_VERSION,
        reports: reports.size,
        enabled: settings.enabled,
      })
    },
  })

  ctx.logger?.info?.(`[quality-lens] local rubric ${RUBRIC_VERSION} ready (${reports.size} stored reports)`)
}
