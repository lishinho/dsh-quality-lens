import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreAnswer, scoreWithLabels, gradeLabel, isSubstantiveQuestion, redactSecrets, RUBRIC_VERSION, DIMENSIONS, WEIGHTS } from '../lib/scoring.js'

const QUESTION = '帮我对比一下 V4.1 Flash 和 V4-Pro 在长文写作上的差异，顺便给个选择建议。'
const GOOD_ANSWER = `两代模型在长文写作上的差异，主要集中在三个维度：

- 结构与节奏：V4.1 Flash 更愿意用分层小标题，段落推进更稳。
- 细节密度：V4-Pro 的论据更厚，长文里更少出现“正确的废话”。
- 一致性：超过 3,000 字后，Flash 的收束能力略弱，需要结尾提示。

选择建议：日常长文用 Flash 足够；对论据密度要求高的稿件，切到 Pro。如果预算敏感、篇幅在 2,000 字以内，优先 Flash。`

const BAD_ANSWER = '人工智能正在深刻改变世界。很多人都在讨论大模型，它一定会取代所有重复劳动，这是毫无疑问的。学习编程非常重要，建议多看书、多练习。'
const BAD_QUESTION = '这个 Python 脚本报错了，怎么排查？'

test('rubric constants are stable', () => {
  assert.equal(RUBRIC_VERSION, 'v1-local')
  assert.deepEqual(DIMENSIONS, ['relevance', 'completeness', 'credibility', 'clarity', 'actionability'])
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 1)
})

test('good answer scores high and explains itself', () => {
  const report = scoreAnswer({ question: QUESTION, answer: GOOD_ANSWER })
  assert.ok(report.score >= 80, `expected >=80, got ${report.score}`)
  assert.ok(['good', 'excellent'].includes(report.grade))
  assert.ok(report.dims.relevance >= 85, `relevance=${report.dims.relevance}`)
  assert.ok(report.dims.completeness >= 80, `completeness=${report.dims.completeness}`)
  assert.ok(report.topic.score >= 85, `topic=${report.topic.score}`)
  assert.ok(report.topic.intents.length >= 2, 'multi-clause question should yield >=2 intents')
  assert.ok(report.evidence.length >= 2)
  assert.ok(report.suggestions.length >= 1 && report.suggestions.length <= 3)
  for (const dim of DIMENSIONS) assert.ok(report.dims[dim] >= 0 && report.dims[dim] <= 100)
  assert.equal(report.confidence, 'medium')
})

test('every evidence quote is a literal substring of the answer', () => {
  for (const sample of [
    { question: QUESTION, answer: GOOD_ANSWER },
    { question: BAD_QUESTION, answer: BAD_ANSWER },
  ]) {
    const report = scoreAnswer(sample)
    for (const item of report.evidence) {
      assert.ok(sample.answer.includes(item.quote), `not a substring: ${item.quote}`)
    }
  }
})

test('off-topic answer scores low and flags the missing intent', () => {
  const report = scoreAnswer({ question: BAD_QUESTION, answer: BAD_ANSWER })
  assert.ok(report.score < 65, `expected <65, got ${report.score}`)
  assert.equal(report.grade, 'poor')
  assert.ok(report.dims.relevance <= 60, `relevance=${report.dims.relevance}`)
  assert.ok(report.topic.score <= 20, `topic=${report.topic.score}`)
  assert.ok(report.topic.missing.length >= 1)
  assert.ok(report.suggestions.some((s) => s.includes('没有覆盖') || s.includes('只回答了一部分')))
})

test('short answer is low confidence and penalized', () => {
  const report = scoreAnswer({ question: '如何在 dsh 里安装插件？', answer: '可以直接安装。' })
  assert.equal(report.confidence, 'low')
  assert.ok(report.score < 65, `expected <65, got ${report.score}`)
})

test('English answers are scored, not ignored', () => {
  const report = scoreAnswer({
    question: 'Compare V4.1 Flash and V4-Pro for long-form writing and recommend one.',
    answer: `Both models handle long-form writing, but they differ in three ways:

- Structure: Flash uses headings and moves paragraphs more steadily.
- Evidence density: Pro keeps more concrete detail and fewer filler sentences.
- Consistency: after about 3,000 words, Flash needs an explicit closing cue.

Recommendation: use Flash for everyday drafts. Switch to Pro when evidence density matters. If your budget is tight or the piece is under 2,000 words, stay on Flash.`,
  })
  assert.ok(report.score >= 70, `expected >=70, got ${report.score}`)
  assert.ok(report.topic.score >= 60, `topic=${report.topic.score}`)
  assert.ok(report.evidence.length >= 1)
})

test('scoring is deterministic', () => {
  const a = scoreAnswer({ question: QUESTION, answer: GOOD_ANSWER })
  const b = scoreAnswer({ question: QUESTION, answer: GOOD_ANSWER })
  assert.deepEqual(a, b)
})

test('empty answer does not throw', () => {
  const report = scoreAnswer({ question: 'x', answer: '' })
  assert.ok(Number.isInteger(report.score))
  assert.ok(report.score >= 0 && report.score <= 100)
})

test('grade labels cover the four bands', () => {
  assert.equal(gradeLabel('excellent'), '优秀')
  assert.equal(gradeLabel('good'), '良好')
  assert.equal(gradeLabel('fair'), '一般')
  assert.equal(gradeLabel('poor'), '需改进')
})

test('acknowledgements and bare commands are not substantive questions', () => {
  for (const text of ['可以了 我试试', '好的', '谢谢', '继续', '嗯嗯', '收到', 'ok']) {
    assert.equal(isSubstantiveQuestion(text), false, `${text} should not be scored`)
  }
  for (const text of ['这个能做什么呢', '本地目录路径是什么', '为什么？', '帮我把这段代码改成 async']) {
    assert.equal(isSubstantiveQuestion(text), true, `${text} should be scored`)
  }
})

test('follow-up turns are scored against the prior task, new short questions are not', () => {
  const answer = 'dsh-bili-scroll 是每天替你刷 B 站的插件：按关键词搜索、读字幕判断、写 Markdown 日报，并把值得的内容 @ 你。已装 0.1.7，数据在 ~/.dsh/bili-duty。'
  const context = '帮我看看 dsh-bili-scroll 这个插件能做什么'
  const withContext = scoreWithLabels({ question: '这个能做什么呢', answer, context })
  const withoutContext = scoreWithLabels({ question: '这个能做什么呢', answer })
  assert.equal(withContext.topic.contextUsed, true)
  assert.ok(withContext.topic.score > withoutContext.topic.score, 'context should raise topic coverage')
  assert.ok(withContext.dims.relevance > withoutContext.dims.relevance)

  const newTopic = scoreWithLabels({ question: '今天天气怎么样', answer, context })
  assert.equal(newTopic.topic.contextUsed, false, 'a self-contained short question is a new task')
  assert.ok(newTopic.topic.score < 40)
})

test('a restated follow-up gets continuation credit', () => {
  const context = '帮我看看 dsh-bili-scroll 这个插件能做什么'
  const answer = 'dsh-bili-scroll 是每天替你刷 B 站的插件：按关键词搜索、读字幕判断、写 Markdown 日报，并把值得的内容 @ 你。已装 0.1.7。'
  const report = scoreWithLabels({ question: '这个能做什么呢', answer, context, contextAnswer: answer })
  assert.equal(report.topic.contextUsed, true)
  assert.ok(report.topic.continuation > 0)
  assert.ok(report.topic.score >= 60)
})

test('credential-shaped strings are redacted from reports and skipped as prompts', () => {
  const token = 'npm_' + 'x'.repeat(36)
  assert.ok(redactSecrets(`token: ${token}`).includes('[REDACTED]'))
  assert.equal(isSubstantiveQuestion(`token: ${token}`), false)
  assert.equal(isSubstantiveQuestion(`这个 token 还有效吗？`), true)
  const report = scoreWithLabels({ question: `token: ${token}`, answer: '收到，旧 token 已经删掉了。' })
  assert.equal(JSON.stringify(report).includes(token), false)
  assert.equal(report.stats.questionPreview.includes(token), false)
})
