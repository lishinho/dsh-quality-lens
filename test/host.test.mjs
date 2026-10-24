import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../lib/host.js'

const QUESTION = '帮我对比一下 V4.1 Flash 和 V4-Pro 在长文写作上的差异，顺便给个选择建议。'
const ANSWER = `两代模型在长文写作上的差异，主要集中在三个维度：

- 结构与节奏：V4.1 Flash 更愿意用分层小标题，段落推进更稳。
- 细节密度：V4-Pro 的论据更厚，长文里更少出现“正确的废话”。
- 一致性：超过 3,000 字后，Flash 的收束能力略弱，需要结尾提示。

选择建议：日常长文用 Flash 足够；对论据密度要求高的稿件，切到 Pro。如果预算敏感、篇幅在 2,000 字以内，优先 Flash。`

function makeCtx() {
  const routes = []
  const handlers = {}
  return {
    routes,
    handlers,
    effect(fn) {
      fn()
    },
    on(name, fn) {
      handlers[name] = fn
      return () => delete handlers[name]
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    logger: { info() {}, warn() {} },
  }
}

function makeHarness() {
  const response = { status: 0, body: '' }
  const res = {
    writeHead(status) {
      response.status = status
    },
    end(body) {
      response.body = String(body ?? '')
    },
  }
  return { res, response }
}

const routeFor = (ctx, suffix) => ctx.routes.find((route) => route.path.endsWith(suffix))

test('host scores a committed assistant message and serves it over the report route', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-lens-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const ctx = makeCtx()
    apply(ctx, { minReplyChars: 10 })

    ctx.handlers['session/event']({ id: 'ses_1' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: QUESTION }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_1' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_1', model: 'deepseek-flash', content: [{ type: 'text', text: ANSWER }] } },
    })

    const route = routeFor(ctx, '/report')
    assert.ok(route, 'report route should be registered')

    const { res, response } = makeHarness()
    route.handler({ url: '/api/dsh-quality-lens/report?messageId=msg_1', method: 'GET' }, res)
    assert.equal(response.status, 200)
    const payload = JSON.parse(response.body)
    assert.equal(payload.ok, true)
    assert.equal(payload.report.messageId, 'msg_1')
    assert.ok(payload.report.score >= 80)
    assert.equal(payload.report.model, 'deepseek-flash')

    const { res: res2, response: response2 } = makeHarness()
    routeFor(ctx, '/reports').handler({ url: '/api/dsh-quality-lens/reports?limit=10', method: 'GET' }, res2)
    assert.equal(response2.status, 200)
    assert.equal(JSON.parse(response2.body).items.length, 1)

    const { res: res3, response: response3 } = makeHarness()
    routeFor(ctx, '/health').handler({ url: '/api/dsh-quality-lens/health', method: 'GET' }, res3)
    assert.equal(JSON.parse(response3.body).reports, 1)

    // A duplicate event must not create a second report.
    ctx.handlers['session/event']({ id: 'ses_1' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_1', content: [{ type: 'text', text: ANSWER }] } },
    })
    const { res: res4, response: response4 } = makeHarness()
    routeFor(ctx, '/reports').handler({ url: '/api/dsh-quality-lens/reports', method: 'GET' }, res4)
    assert.equal(JSON.parse(response4.body).items.length, 1)

    // Short replies are skipped, and unknown ids answer 404.
    ctx.handlers['session/event']({ id: 'ses_1' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_short', content: [{ type: 'text', text: '可以。' }] } },
    })
    const { res: res5, response: response5 } = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_short', method: 'GET' }, res5)
    assert.equal(response5.status, 404)

    assert.ok(fs.existsSync(path.join(home, 'quality-lens', 'reports.jsonl')))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('plugin-injected user context is ignored when tracking the question', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-lens-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const ctx = makeCtx()
    apply(ctx, { minReplyChars: 10 })

    ctx.handlers['session/event']({ id: 'ses_2' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: '注入的上下文，不是用户问题' }], source: { kind: 'plugin' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_2' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: QUESTION }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_2' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_2', content: [{ type: 'text', text: ANSWER }] } },
    })

    const { res, response } = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_2', method: 'GET' }, res)
    const payload = JSON.parse(response.body)
    assert.ok(payload.report.topic.intents.length >= 2, 'should score against the real prompt, not the injected one')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('engine "jev" upgrades the local report asynchronously and clears pendingJev', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-lens-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const answers = {
    relevance: { type: 'score', score: 3, confidence: 0.9 },
    completeness: { type: 'score', score: 2.5, confidence: 0.8 },
    credibility: { type: 'score', score: 2, confidence: 0.8 },
    clarity: { type: 'score', score: 2.5, confidence: 0.8 },
    actionability: { type: 'score', score: 2.5, confidence: 0.8 },
    absolute: { type: 'noul', noul: 0.1 },
    refusal: { type: 'noul', noul: 0.05 },
    offtopic: { type: 'noul', noul: 0.1 },
  }
  try {
    const ctx = makeCtx()
    apply(ctx, {
      minReplyChars: 10,
      engine: 'jev',
      jev: {
        apiKey: 'test-key',
        fetchImpl: async () => ({ ok: true, json: async () => ({ answers }) }),
      },
    })
    ctx.handlers['session/event']({ id: 'ses_3' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: QUESTION }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_3' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_jev', content: [{ type: 'text', text: ANSWER }] } },
    })

    // The local report is available immediately and marked pending.
    const first = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_jev', method: 'GET' }, first.res)
    assert.equal(JSON.parse(first.response.body).report.pendingJev, true)

    await new Promise((resolve) => setTimeout(resolve, 30))

    const settled = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_jev', method: 'GET' }, settled.res)
    const report = JSON.parse(settled.response.body).report
    assert.equal(report.engine, 'jev')
    assert.equal(report.rubric, 'jev-v1')
    assert.equal(report.pendingJev, false)
    assert.ok(report.score >= 80)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('all real user messages in a turn are scored together (follow-ups do not erase the request)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-lens-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const ctx = makeCtx()
    apply(ctx, { minReplyChars: 10 })
    ctx.handlers['session/event']({ id: 'ses_4' }, { type: 'turn/start', data: { turn: 1 } })
    ctx.handlers['session/event']({ id: 'ses_4' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: QUESTION }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_4' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: '顺便给个一句话结论。' }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_4' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_batch', content: [{ type: 'text', text: ANSWER }] } },
    })
    const { res, response } = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_batch', method: 'GET' }, res)
    const report = JSON.parse(response.body).report
    assert.equal(report.topic.intents.length >= 2, true)
    assert.ok(report.stats.questionPreview.includes(QUESTION.slice(0, 10)))
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('a short follow-up turn is scored against the last self-contained request', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-lens-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const ctx = makeCtx()
    apply(ctx, { minReplyChars: 10 })
    ctx.handlers['session/event']({ id: 'ses_5' }, { type: 'turn/start', data: { turn: 1 } })
    ctx.handlers['session/event']({ id: 'ses_5' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: QUESTION }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_5' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_t1', content: [{ type: 'text', text: '第一轮完整回答。'.repeat(20) }] } },
    })
    ctx.handlers['session/event']({ id: 'ses_5' }, { type: 'turn/start', data: { turn: 2 } })
    ctx.handlers['session/event']({ id: 'ses_5' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: '那它还有什么风险？' }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_5' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_t2', content: [{ type: 'text', text: ANSWER }] } },
    })
    const { res, response } = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_t2', method: 'GET' }, res)
    const report = JSON.parse(response.body).report
    assert.equal(report.topic.contextUsed, true)
    assert.ok(report.topic.intents.length >= 2)
    assert.ok(report.topic.score >= 60)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('acknowledgement-only prompts are not scored (no chip, no report)', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-lens-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const ctx = makeCtx()
    apply(ctx, { minReplyChars: 10 })
    ctx.handlers['session/event']({ id: 'ses_ack' }, { type: 'turn/start', data: { turn: 1 } })
    ctx.handlers['session/event']({ id: 'ses_ack' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: '可以了 我试试' }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_ack' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_ack', content: [{ type: 'text', text: ANSWER }] } },
    })
    const { res, response } = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_ack', method: 'GET' }, res)
    assert.equal(response.status, 404)
    const list = makeHarness()
    routeFor(ctx, '/reports').handler({ url: '/api/dsh-quality-lens/reports', method: 'GET' }, list.res)
    assert.equal(JSON.parse(list.response.body).items.length, 0)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('a vague follow-up is scored against the previous turn in the same session', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-lens-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const ctx = makeCtx()
    apply(ctx, { minReplyChars: 10 })
    // turn 1: the real task
    ctx.handlers['session/event']({ id: 'ses_ctx' }, { type: 'turn/start', data: { turn: 1 } })
    ctx.handlers['session/event']({ id: 'ses_ctx' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: '帮我看看 dsh-bili-scroll 这个插件能做什么' }], source: { kind: 'user' } } },
    })
    const firstAnswer = 'dsh-bili-scroll 是每天替你刷 B 站的插件：按关键词搜索、读字幕判断、写 Markdown 日报，并把值得的内容 @ 你。已装 0.1.7。'
    ctx.handlers['session/event']({ id: 'ses_ctx' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_ctx_1', content: [{ type: 'text', text: firstAnswer }] } },
    })
    // turn 2: vague follow-up
    ctx.handlers['session/event']({ id: 'ses_ctx' }, { type: 'turn/start', data: { turn: 2 } })
    ctx.handlers['session/event']({ id: 'ses_ctx' }, {
      type: 'user/message',
      data: { message: { content: [{ type: 'text', text: '这个能做什么呢' }], source: { kind: 'user' } } },
    })
    ctx.handlers['session/event']({ id: 'ses_ctx' }, {
      type: 'assistant/message',
      data: { message: { id: 'msg_ctx_2', content: [{ type: 'text', text: firstAnswer }] } },
    })
    const { res, response } = makeHarness()
    routeFor(ctx, '/report').handler({ url: '/api/dsh-quality-lens/report?messageId=msg_ctx_2', method: 'GET' }, res)
    const report = JSON.parse(response.body).report
    assert.equal(report.topic.contextUsed, true)
    assert.ok(report.topic.score >= 60)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    fs.rmSync(home, { recursive: true, force: true })
  }
})
