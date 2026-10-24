/**
 * Local, deterministic answer-quality scoring for 质量雷达 / Quality Lens.
 *
 * Pure functions only: no I/O, no model calls, no randomness. The host plugin
 * calls `scoreAnswer()` on the committed assistant text; the browser never
 * imports this file (it only renders the report the host stored).
 *
 * Rubric v1-local (see docs): relevance 25, completeness 20, credibility 20,
 * clarity 15, actionability 20, plus an independent topic-coverage score.
 */

export const RUBRIC_VERSION = 'v1-local'
export const DIMENSIONS = ['relevance', 'completeness', 'credibility', 'clarity', 'actionability']
export const WEIGHTS = { relevance: 0.25, completeness: 0.2, credibility: 0.2, clarity: 0.15, actionability: 0.2 }

const STOPWORDS = new Set(`
的 了 和 与 及 或 是 在 我 你 他 她 它 我们 你们 他们 这 那 这个 那个 这些 那些 一个 一些 什么 怎么 如何
为什么 可以 能否 是否 需要 应该 以及 但是 而且 因为 所以 如果 就是 还是 只是 已经 可能 大概 比较 更 最 很
非常 也 都 就 还 又 再 让 给 对 从 到 把 被 为 于 之 其 该 各 们 吗 呢 吧 啊 呀 哦 嗯 一下 请问 帮我 麻烦
谢谢 你好 这个 那个 有 没有 不 没 会 能 要 想 看 说 做 用 用 里 上 下 中 时候 现在 今天 然后 接着 首先 其次
最后 总之 综上 总结 结论 因此 所以 但是 不过 然而 另外 还有 同时 顺便 分别 以及 例如 比如 包括 主要 一般
一般来讲 通常 来说 简单 具体 其实 确实 真的 比较 相对 方面 问题 内容 情况 方式 方法 部分 时候 东西
the a an and or of to in on for with is are was were be been this that these those it its i you he she they
we what how why which who when where can could should would will not no yes do does did have has had as at by
from into about than then so but if because while please thanks hi hello
`.split(/\s+/))

const ABSOLUTES = ['一定', '必然', '永远', '从不', '绝对', '毫无疑问', '肯定', '所有', '任何', '都不可能', '完全正确', '保证']
const HEDGES = ['可能', '取决于', '建议', '视情况', '大概', '或许', '需要验证', '不一定', '通常', '一般来说', '相对', '倾向于', '存在差异']
const ACTION_VERBS = ['先', '然后', '接着', '可以', '建议', '打开', '执行', '运行', '配置', '检查', '使用', '安装', '设置', '点击', '输入', '确认', '对比', '验证', '补充', '选择', '切换', '导出', '保存', '提供', '安排', '联系', '回复', '修复', '定位', '说明']
const ACTION_VERBS_EN = ['use', 'switch', 'recommend', 'try', 'start', 'run', 'check', 'set', 'install', 'compare', 'choose', 'avoid', 'keep', 'stay', 'pick']
const CONCLUSIONS = ['总之', '综上', '总结', '结论', '因此', '所以', '建议', '一句话']
const FILLERS = ['总的来说', '需要注意的是', '值得一提的是', '综上所述', '换句话说', '简单来说', '众所周知', '不难发现']
const CITATION = /https?:\/\/|参见|来源[:：]|引用|官方文档|文档链接|见.{0,6}(文档|章节|链接)/
const TOOL_EVIDENCE = /(运行结果|输出如下|测试通过|实测|日志|报错如下|执行结果)/
const CODE_FENCE = /```/
const LIST_LINE = /^\s*(?:[-*•]|\d+[.)、])\s+/m
const HEADING = /^\s{0,3}#{1,6}\s+/m
const TABLE = /^\s*\|.+\|\s*$/m
const REFUSAL = /^(抱歉|对不起|我无法|我不能|作为(一个)?(AI|人工智能)|请(你)?提供)/

const TYPES = [
  { id: 'compare', zh: /对比|比较|区别|差异|哪个|哪个好|还是|vs/i, en: /\b(compare|comparison|difference|versus|vs)\b/i, marker: /对比|相比|区别|差异|各有|取决于|表格|\|/, markerEn: /\b(compared?|differ\w*|versus|while|whereas)\b/i },
  { id: 'howto', zh: /怎么|如何|怎样|步骤|流程|方法/, en: /\bhow\b|\bsteps?\b/i, marker: /步骤|第[一二三四五1-5]步|\d+[.)、]|先|然后|接着/, markerEn: /\bstep|\bfirst\b|\bthen\b|\bnext\b/i },
  { id: 'why', zh: /为什么|为何|原因/, en: /\bwhy\b|\breason/i, marker: /因为|原因|由于|导致|所以/, markerEn: /\bbecause|\bsince\b|\bdue to\b|\breason\b/i },
  { id: 'define', zh: /是什么|什么是|介绍|含义|定义/, en: /\bwhat is\b|\bdefine\b|\bmeaning\b/i, marker: /是指|定义为|指的是|包括/, markerEn: /\bmeans?\b|\brefers? to\b|\bdefined as\b|\bincludes?\b/i },
  { id: 'write', zh: /写|撰写|草拟|文案|文章|邮件|方案|稿/, en: /\bwrite\b|\bdraft\b|\bcopy\b/i, marker: /标题|正文|开头|结尾|版本|文案|段落/, markerEn: /\btitle|\bdraft|\bopening|\bclosing|\bversion|\bparagraph\b/i },
  { id: 'code', zh: /代码|实现|函数|报错|bug|接口|api|脚本/i, en: /\bcode\b|\bimplement\b|\bfunction\b|\bbug\b/i, marker: /```|function|const |import |class |命令|参数|返回值/, markerEn: /```|\bfunction\b|\bconst\b|\bimport\b|\bclass\b|\bcommand\b/ },
  { id: 'advice', zh: /建议|推荐|选|该不该|值得|哪个更/, en: /\bshould\b|\brecommend\b|\badvice\b/i, marker: /建议|推荐|取决于|如果|优先|适合/, markerEn: /\brecommend|\bsuggest|\bshould|\bprefer|\bdepend\w*/i },
  { id: 'fact', zh: /多少|什么时候|哪年|谁|哪里|是否/, en: /\bhow many\b|\bhow much\b|\bwhen\b|\bwho\b|\bwhere\b/i, marker: /\d|年|月|日|位于|属于/, markerEn: /\d{4}|\byear\b|\bmonth\b|\blocated\b/i },
]

const POSITIVE = {
  relevance: '紧扣问题',
  completeness: '覆盖完整',
  credibility: '表述有依据',
  clarity: '结构清晰',
  actionability: '建议可执行',
}
const NEGATIVE = {
  relevance: '有跑题内容',
  completeness: '漏掉了部分子问题',
  credibility: '有过度断言',
  clarity: '结构还可以更清楚',
  actionability: '缺少可执行的下一步',
}

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

/** Small synonym expansion so Chinese paraphrases are not scored as off-topic. */
const TERM_SYNONYMS = [
  ['便宜', '价格', '费用', '费率', '更低', '贵', '成本'],
  ['区别', '差异', '对比', '比较', '不同'],
  ['报错', '错误', '异常', '失败', 'bug'],
  ['安装', '装', '添加', 'install'],
  ['客户', '用户', '对方'],
  ['邮件', '主题', '正文', '您好'],
  ['道歉', '抱歉', '致歉'],
  ['延期', '推迟', '延迟'],
  ['建议', '推荐', '可以', '取舍'],
  ['向量', '向量化', 'embedding', '检索'],
  ['bili', 'b站', '哔哩哔哩'],
  ['scroll', '刷', '滚动'],
  ['插件', '工具', '扩展'],
  ['model', '模型'],
  ['prompt', '提示词'],
  ['api', '接口'],
  ['code', '代码'],
  ['token', '令牌'],
]
const hasCJK = (s) => /[\u4e00-\u9fff]/.test(s)

/** Loose presence check: exact for Chinese, prefix-tolerant for long English words. */
function termPresent(term, haystack, termSet) {
  if (termSet.has(term) || haystack.includes(term)) return true
  if (!hasCJK(term) && term.length >= 7) {
    if (haystack.includes(term.slice(0, 6))) return true
  }
  for (const group of TERM_SYNONYMS) {
    if (!group.some((word) => term.includes(word) || word.includes(term))) continue
    if (group.some((word) => haystack.includes(word))) return true
  }
  return false
}
const countMatches = (text, list) => list.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0)

/** Word-level tokens. Uses Intl.Segmenter when available, regex fallback otherwise. */
export function tokenize(text) {
  const out = []
  const raw = String(text ?? '')
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
    for (const part of segmenter.segment(raw)) if (part.isWordLike) out.push(part.segment.toLowerCase())
  } else {
    for (const match of raw.toLowerCase().matchAll(/[\u4e00-\u9fff]{2,4}|[a-z0-9_+-]{2,}/g)) out.push(match[0])
  }
  return out.filter((token) => {
    if (!token || STOPWORDS.has(token)) return false
    if (/^[\d.%¥$+\-_/]+$/.test(token)) return false
    if (hasCJK(token)) return token.length >= 2
    if (token.length < 3) return false
    return /^[a-z0-9_+-]+$/.test(token)
  })
}

/** Term frequency map, insertion ordered by first appearance. */
export function termFrequencies(text) {
  const map = new Map()
  for (const token of tokenize(text)) map.set(token, (map.get(token) ?? 0) + 1)
  return map
}

/**
 * Whether a user message is worth scoring at all. Acknowledgements, reactions
 * and bare commands ("可以了 我试试", "好的", "继续") are not questions; scoring
 * them produces meaningless intent labels and prompt tips.
 *
 * @param {string} text - the user message (or the joined turn messages)
 * @returns {boolean}
 */
export function isSubstantiveQuestion(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return false
  const compact = raw.replace(/[\s。！？!?，,、~～…]+/g, '')
  if (compact.length === 0) return false
  const ack = /^(好的?|可以了?|行|嗯+|哦+|收到|明白了?|了解|谢谢|感谢|辛苦了?|继续|开始吧?|我试试|试一下|好滴|ok|okay|thanks?|thx)$/i
  if (ack.test(compact)) return false
  if (/^(好的?|可以了?|嗯+|哦+|行|收到|谢谢|继续)+$/.test(compact)) return false
  const hasAsk = /[?？]|怎么|如何|什么|为什么|为啥|哪|多少|是否|能否|可不可以|吗|呢|请教|请问|介绍|解释|对比|比较|建议|推荐|写|生成|实现|排查|安装|配置|设计|分析|评估|总结|整理/.test(raw)
  if (!hasAsk && compact.length < 10) return false
  return compact.length >= 2
}

/** Whether a message continues the previous task instead of starting a new one. */
export function isFollowUp(question, context) {
  const q = String(question ?? '').trim()
  const c = String(context ?? '').trim()
  if (!c || !q) return false
  if (/^(这个|那个|它|上面|刚才|继续|然后|下一步|还有|再|那|所以|另外|基于|接着|这样|那种|此|该|上述|前面)/.test(q)) return true
  const compact = q.replace(/\s/g, '')
  if (compact.length > 18) return false
  const terms = [...termFrequencies(q).keys()]
  const contextTerms = termFrequencies(c)
  if (terms.length === 0) return true
  if (terms.length === 1) {
    if (/^(为什么|怎么|如何|什么|哪|多少|是否|然后|接下来)/.test(terms[0])) return true
    return contextTerms.has(terms[0])
  }
  const overlap = terms.filter((term) => contextTerms.has(term)).length
  // Short but self-contained ("今天天气怎么样") is a new task; a short
  // continuation ("这个呢", "为什么") shares the prior task's terms.
  return overlap >= Math.min(2, terms.length)
}

/** Split a question into sub-asks (clauses), dropping empty ones. */
export function splitIntents(question) {
  return String(question ?? '')
    .split(/[，,；;。！？!?\n]+|(?:以及|并且|同时|顺便|另外|还有|分别|然后)|\s+(?:and|plus|also|then)\s+/gi)
    .map((part) => part.replace(/^(请|帮我|麻烦|想问一下|能否)/, '').trim())
    .filter((part) => part.length >= 2 && termFrequencies(part).size > 0)
}

function detectType(question, answer) {
  for (const type of TYPES) {
    if (type.zh.test(question) || type.en.test(question)) {
      return { id: type.id, marker: type.marker.test(answer) || (type.markerEn ? type.markerEn.test(answer) : false) }
    }
  }
  return { id: 'general', marker: false }
}

function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6)
}

function splitParagraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function answerStats(answer) {
  const paragraphs = splitParagraphs(answer)
  const longParagraphs = paragraphs.filter((p) => p.replace(/\s/g, '').length > 220).length
  const codeBlocks = (answer.match(/```/g)?.length ?? 0) >= 2 ? Math.floor((answer.match(/```/g)?.length ?? 0) / 2) : 0
  const listLines = answer.split('\n').filter((line) => /^\s*(?:[-*•]|\d+[.)、])\s+/.test(line)).length
  const sentences = splitSentences(answer)
  const fillerCount = countMatches(answer, FILLERS)
  const words = tokenize(answer)
  const fourGrams = new Map()
  for (let i = 0; i + 4 <= words.length; i += 1) {
    const gram = words.slice(i, i + 4).join(' ')
    fourGrams.set(gram, (fourGrams.get(gram) ?? 0) + 1)
  }
  const repeated = [...fourGrams.values()].filter((n) => n > 1).length
  return {
    chars: answer.replace(/\s/g, '').length,
    sentences,
    paragraphs,
    longParagraphs,
    codeBlocks,
    listLines,
    hasHeading: HEADING.test(answer),
    hasTable: TABLE.test(answer),
    fillerCount,
    repeated,
    words,
  }
}

function topicCoverage(question, answer, answerTerms) {
  const answerLower = answer.toLowerCase()
  const weightOf = (term) => (hasCJK(term) ? Math.min(2.5, term.length) : Math.min(2.5, Math.max(1, term.length / 4)))
  const intents = splitIntents(question).slice(0, 6).map((clause) => {
    const keywords = [...termFrequencies(clause).keys()].slice(0, 8)
    const totalWeight = keywords.reduce((sum, term) => sum + weightOf(term), 0)
    const matched = keywords.filter((k) => termPresent(k, answerLower, answerTerms))
    const matchedWeight = matched.reduce((sum, term) => sum + weightOf(term), 0)
    const coverage = totalWeight === 0 ? 0 : matchedWeight / totalWeight
    return {
      label: clause.length > 26 ? `${clause.slice(0, 26)}…` : clause,
      keywords,
      coverage: Number(coverage.toFixed(3)),
      status: coverage >= 0.5 ? 'covered' : coverage >= 0.25 ? 'partial' : 'missing',
    }
  })

  const questionTerms = new Set([...termFrequencies(question).keys()])
  const driftQuotes = []
  for (const paragraph of splitParagraphs(answer)) {
    if (paragraph.replace(/\s/g, '').length < 80) continue
    if (/^\s*(?:[-*•]|\d+[.)、])\s+/.test(paragraph)) continue
    if (CODE_FENCE.test(paragraph) || HEADING.test(paragraph)) continue
    const hits = [...questionTerms].filter((term) => termPresent(term, paragraph.toLowerCase(), new Set(tokenize(paragraph)))).length
    if (hits === 0) driftQuotes.push(paragraph.length > 90 ? `${paragraph.slice(0, 90)}…` : paragraph)
  }

  const total = intents.reduce((n, i) => n + i.coverage, 0)
  const ratio = intents.length === 0 ? 0 : total / intents.length
  return {
    intents,
    ratio,
    covered: intents.filter((i) => i.status === 'covered'),
    partial: intents.filter((i) => i.status === 'partial'),
    missing: intents.filter((i) => i.status === 'missing'),
    driftQuotes: driftQuotes.slice(0, 2),
  }
}

function pickEvidence(answer, stats, topic) {
  const evidence = []
  const push = (dim, quote, why) => {
    if (!quote || evidence.some((item) => item.quote === quote)) return
    evidence.push({ dim, quote, why })
  }
  const sentences = stats.sentences
  if (sentences[0]) push('relevance', sentences[0], '开篇直接回应问题')
  const actionSentence = sentences.find((s) => countMatches(s, ACTION_VERBS) >= 1 && s !== sentences[0])
  if (actionSentence) push('actionability', actionSentence, '给出了可执行的动作或判断')
  const riskSentence = sentences.find((s) => countMatches(s, ABSOLUTES) >= 1 || countMatches(s, HEDGES) >= 1)
  if (riskSentence) {
    const absolute = countMatches(riskSentence, ABSOLUTES) >= 1
    push('credibility', riskSentence, absolute ? '存在绝对化断言，缺少限定条件' : '有不确定性说明，表述较稳')
  }
  if (topic.driftQuotes[0]) push('completeness', topic.driftQuotes[0], '这段与问题的关联较弱')
  if (evidence.length < 2 && sentences[1]) push('completeness', sentences[1], '对要点的展开')
  return evidence.slice(0, 4)
}

/**
 * Prompt-tuning advice: what the user could have written differently so the
 * next answer is better. This is what the report's "提示词调优" section shows;
 * `suggestions` remains the answer-level advice for older clients.
 *
 * @param {{ question: string, dims: object, topic: object, labels: object }} input
 * @returns {Array<{ issue: string, tip: string, rewrite: string }>} up to 3 tips
 */
export function buildPromptTips({ question, dims, topic, labels }) {
  const q = String(question ?? '').trim() || '<在这里粘贴你的问题>'
  const intents = labels?.question?.intents ?? []
  const tips = []
  const add = (issue, tip, rewrite) => {
    if (tips.length >= 3 || !rewrite) return
    const prefix = `${q}\n\n`
    const addition = rewrite.startsWith(prefix) ? rewrite.slice(prefix.length).trim() : rewrite
    tips.push({ issue, tip, rewrite, addition })
  }
  const clean = (label) => String(label ?? '').replace(/…$/, '').replace(/\s+/g, ' ').trim()
  const clauses = (topic?.intents ?? []).map((intent) => clean(intent.label)).filter(Boolean)
  const missing = [...(topic?.missing ?? []), ...(topic?.partial ?? [])].map((intent) => clean(intent.label)).filter(Boolean)

  if (missing.length > 0 && clauses.length > 0) {
    const numbered = clauses.slice(0, 6).map((clause, index) => `${index + 1}) ${clause}`).join('\n')
    add(
      `回答没有完整覆盖：${missing.join('、')}`,
      '把子问题拆成编号，明确要求逐条回答；每条先给结论，再给理由。',
      `${q}\n\n请逐条回答，每条先给一句话结论，再给理由：\n${numbered}`,
    )
  }

  if ((dims?.actionability ?? 100) < 72) {
    add(
      '回答只有原则，缺少可直接执行的步骤',
      '在问题里要求「步骤 + 判断规则」，而不是只要一个结论。',
      `${q}\n\n要求：给出 3 步以内可执行的步骤，并说明每一步的输入、输出和判断标准。`,
    )
  }
  if ((dims?.credibility ?? 100) < 72 || labels?.answer?.absolute) {
    add(
      '回答出现绝对化表述，或关键结论缺少依据',
      '要求标注来源、说明不确定性与适用前提。',
      `${q}\n\n要求：关键结论标注来源或依据；不确定的地方说明前提和置信度，不要用「一定/必然/所有」这类绝对化表述。`,
    )
  }
  if ((dims?.clarity ?? 100) < 72) {
    add(
      '回答结构不够清楚',
      '要求「先结论后论据 + 分点」，并限制每点长度。',
      `${q}\n\n要求：先给一句话结论，再用 3 个要点展开；每点不超过 2 句，避免重复。`,
    )
  }
  if ((dims?.relevance ?? 100) < 72 || labels?.answer?.offtopic) {
    add(
      '回答里出现了与问题无关的内容',
      '补充背景、目标与范围，并要求只回答相关内容。',
      `背景：<一句话背景>\n目标：<你真正想解决的问题>\n范围：只讨论 <范围>，不要展开无关内容。\n\n${q}`,
    )
  }

  if (intents.includes('intent.compare')) {
    add(
      '对比类问题没有指定比较维度',
      '把维度写进 prompt，最后要求给出选择建议和适用前提。',
      `${q}\n\n请从以下维度对比：价格、能力、适用场景、限制；最后给出选择建议，并说明适用前提。`,
    )
  }
  if (intents.includes('intent.code')) {
    add(
      '排错类问题缺少报错原文与环境信息',
      '附上报错原文、运行环境和最小复现步骤。',
      `报错原文：<粘贴 traceback>\n环境：<系统 / 语言版本 / 依赖版本>\n复现步骤：<最小步骤>\n\n${q}\n\n请先判断最可能的原因，再给修复步骤；不确定时说明还需要哪些信息。`,
    )
  }
  if (intents.includes('intent.advice')) {
    add(
      '建议类问题没有给出约束和偏好',
      '把预算、时间、偏好和不能接受的方案写清楚。',
      `${q}\n\n约束：预算 <…>、时间 <…>、偏好 <…>、不能接受的方案 <…>。请在这些约束下给出建议，并说明取舍。`,
    )
  }

  if (tips.length === 0) {
    add(
      '问题信息量还可以再压实',
      '用「背景 + 目标 + 约束 + 输出格式」四段式，减少模型的自由发挥。',
      `背景：…\n目标：…\n约束：…\n输出格式：…\n\n${q}`,
    )
  }
  return tips
}

function buildSuggestions(intents, dims, topic) {
  const suggestions = []
  if (topic.missing.length > 0) {
    suggestions.push(`问题里有 ${topic.intents.length} 个子意图，回答没有覆盖「${topic.missing.map((i) => i.label).join('、')}」；建议补上。`)
  } else if (dims.completeness < 75 && topic.partial.length > 0) {
    suggestions.push(`「${topic.partial[0].label}」只回答了一部分；建议补一句结论或适用前提。`)
  }
  if (dims.actionability < 72) suggestions.push('把结论落到动作上：补一条步骤、命令或判断规则，让读者能直接照做。')
  if (dims.credibility < 72) suggestions.push('关键结论补来源，或说明不确定性（取决于预算、篇幅、场景）。')
  if (dims.clarity < 72) suggestions.push('拆开长段落，先给结论再给论据；删掉重复的过渡句。')
  if (dims.relevance < 72) suggestions.push('删掉与问题无关的段落，把篇幅留给直接回答。')
  if (suggestions.length === 0) suggestions.push('保持现在的结构；如果要多模型对比，建议固定同一套问题与评分口径。')
  return suggestions.slice(0, 3)
}

/**
 * Score one committed assistant answer.
 * @param {{ question?: string, answer: string, context?: string }} input
 * @returns {object} report without messageId (the host adds identity fields)
 */
export function scoreAnswer(input) {
  const answer = String(input?.answer ?? '').trim()
  const question = String(input?.question ?? '').trim() || '（未捕获到用户问题）'
  const previous = String(input?.context ?? '').trim()

  const stats = answerStats(answer)
  const type = detectType(question, answer)
  const topic = topicCoverage(question, answer, new Set(tokenize(answer)))

  const coverage = topic.ratio
  const drift = topic.driftQuotes.length
  const absolutes = countMatches(answer, ABSOLUTES)
  const hedges = countMatches(answer, HEDGES)
  const actionVerbs = countMatches(answer, ACTION_VERBS)
  const hasConclusion = countMatches(answer, CONCLUSIONS) > 0
  const hasCitation = CITATION.test(answer)
  const hasToolEvidence = TOOL_EVIDENCE.test(answer)
  const hasCode = stats.codeBlocks > 0
  const numbered = /^\s*\d+[.)、]\s+/m.test(answer)
  const hasExample = /例如|比如|示例|举个例子|for example|e\.g\./i.test(answer)
  const conditional = /如果|若|当.{0,10}(时|就)|if\s+.{0,60}(,|then)|取决于|视.{0,6}而定/i.test(answer)
  const prioritise = /优先|首选|建议先|recommend|prefer|pick/i.test(answer)
  const englishActions = ACTION_VERBS_EN.reduce((n, w) => n + (new RegExp(`\\b${w}\\b`, 'i').test(answer) ? 1 : 0), 0)
  const refusal = REFUSAL.test(answer.trim())
  const unsourcedNumbers = (answer.match(/\d+(?:\.\d+)?\s*(?:%|元|字|分钟|次|倍|万|亿)/g)?.length ?? 0) >= 6 && !hasCitation

  const shortPenalty = stats.chars < 40 ? 16 : stats.chars < 80 ? 8 : 0
  const relevance = clamp(48 + 42 * coverage + (type.marker ? 10 : 0) - drift * 6 - shortPenalty, 10, 98)
  const completeness = clamp(
    45 + 30 * coverage + (topic.intents.length >= 2 ? 8 : 0) + (hasConclusion ? 9 : 0) + (stats.chars >= 250 ? 8 : stats.chars >= 120 ? 4 : 0) - (refusal ? 25 : 0) - shortPenalty,
    10,
    98,
  )
  const credibility = clamp(
    74 + (hasCitation ? 7 : 0) + (hedges > 0 ? 7 : 0) + (hasToolEvidence ? 5 : 0) - Math.min(absolutes, 4) * 5 - (unsourcedNumbers ? 6 : 0),
    20,
    97,
  )
  const clarity = clamp(
    55 +
      (stats.hasHeading ? 10 : 0) +
      (stats.listLines >= 2 ? 10 : 0) +
      (stats.listLines >= 3 ? 5 : 0) +
      (stats.paragraphs[0] && stats.paragraphs[0].length <= 160 ? 4 : 0) +
      (hasCode ? 6 : 0) +
      (stats.paragraphs.length >= 2 && stats.paragraphs.length <= 8 ? 8 : 0) +
      (stats.hasTable ? 4 : 0) -
      Math.min(stats.longParagraphs, 3) * 7 -
      (stats.fillerCount > 2 ? 6 : 0) -
      (stats.repeated > stats.words.length * 0.12 ? 8 : 0),
    20,
    98,
  )
  const actionability = clamp(
    50 +
      (numbered ? 12 : 0) +
      (hasCode ? 12 : 0) +
      Math.min(actionVerbs + englishActions, 6) * 3 +
      (hasExample ? 5 : 0) +
      (conditional ? 9 : 0) +
      (prioritise ? 6 : 0) +
      (stats.listLines >= 3 ? 4 : 0),
    20,
    98,
  )

  const dims = { relevance, completeness, credibility, clarity, actionability }
  const score = Math.round(DIMENSIONS.reduce((sum, dim) => sum + dims[dim] * WEIGHTS[dim], 0))
  const grade = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'poor'

  const ranked = [...DIMENSIONS].sort((a, b) => dims[b] - dims[a])
  const strong = ranked.filter((dim) => dims[dim] >= 76).slice(0, 2)
  const worst = ranked[ranked.length - 1]
  const hasWeakness = dims[worst] < 72 || absolutes > 0 || topic.missing.length > 0 || drift > 0
  const positiveText = strong.length > 0 ? strong.map((dim) => POSITIVE[dim]).join('、') : '整体一般'
  const summary = hasWeakness ? `${positiveText}；${NEGATIVE[worst]}。` : `${positiveText}；没有明显短板。`

  const confidence = stats.chars < 120 || topic.intents.length === 0 ? 'low' : 'medium'
  const evidence = pickEvidence(answer, stats, topic)
  const suggestions = buildSuggestions(topic.intents, dims, topic)
  const promptTips = buildPromptTips({
    question,
    dims,
    topic,
    labels: { question: { intents: [type.id] }, answer: { absolute: absolutes > 0, offtopic: drift > 0 } },
  })

  return {
    score,
    grade,
    dims,
    topic: {
      score: clamp(coverage * 100 - drift * 10 + (type.marker ? 8 : 0), 0, 100),
      intents: topic.intents,
      covered: topic.covered.map((i) => i.label),
      partial: topic.partial.map((i) => i.label),
      missing: topic.missing.map((i) => i.label),
      driftQuotes: topic.driftQuotes,
      contextUsed: topic.contextUsed === true,
      contextScore: topic.contextScore ?? null,
      continuation: topic.continuation ?? null,
      keywordRatio: topic.keywordRatio ?? null,
    },
    summary,
    evidence,
    suggestions,
    promptTips,
    confidence,
    rubric: RUBRIC_VERSION,
    stats: {
      chars: stats.chars,
      sentences: stats.sentences.length,
      paragraphs: stats.paragraphs.length,
      codeBlocks: stats.codeBlocks,
      listLines: stats.listLines,
      coverage: Number(coverage.toFixed(3)),
      drift: drift,
      type: type.id,
      questionPreview: question.length > 60 ? `${question.slice(0, 60)}…` : question,
      previousTurns: previous ? 1 : 0,
    },
  }
}

/** Short verdict word for the chip/panel (host-side zh default; client localizes). */
export function gradeLabel(grade) {
  return { excellent: '优秀', good: '良好', fair: '一般', poor: '需改进' }[grade] ?? '一般'
}

// ---------------------------------------------------------------------------
// Label engine (labels-v1)
//
// The same rubric, expressed as an explicit set of classification labels.
// Local rules produce the labels today; a typed decision model (Jev) can
// produce the same labels later, and both feed `labelsToReport()`. Keeping the
// label set explicit makes scores auditable and makes the two engines
// interchangeable.
// ---------------------------------------------------------------------------

export const LABEL_VERSION = 'labels-v1'

/** Question-intent label rules; multiple intents can fire for one question. */
const INTENT_LABELS = [
  { id: 'intent.compare', type: 'compare', test: (q) => /对比|比较|区别|差异|哪个|哪个好|还是|vs/i.test(q) || /\b(compare|comparison|difference|versus|vs)\b/i.test(q) },
  { id: 'intent.howto', type: 'howto', test: (q) => /怎么|如何|怎样|步骤|流程|方法/.test(q) || /\bhow\b|\bsteps?\b/i.test(q) },
  { id: 'intent.why', type: 'why', test: (q) => /为什么|为何|原因/.test(q) || /\bwhy\b|\breason/i.test(q) },
  { id: 'intent.define', type: 'define', test: (q) => /是什么|什么是|介绍|含义|定义/.test(q) || /\bwhat is\b|\bdefine\b|\bmeaning\b/i.test(q) },
  { id: 'intent.write', type: 'write', test: (q) => /写|撰写|草拟|文案|文章|邮件|方案|稿/.test(q) || /\bwrite\b|\bdraft\b|\bcopy\b/i.test(q) },
  { id: 'intent.code', type: 'code', test: (q) => /代码|实现|函数|报错|bug|接口|api|脚本/i.test(q) || /\bcode\b|\bimplement\b|\bfunction\b|\bbug\b/i.test(q) },
  { id: 'intent.advice', type: 'advice', test: (q) => /建议|推荐|选|该不该|值得|哪个更/.test(q) || /\bshould\b|\brecommend\b|\badvice\b/i.test(q) },
  { id: 'intent.fact', type: 'fact', test: (q) => /多少|什么时候|哪年|谁|哪里|是否/.test(q) || /\bhow many\b|\bhow much\b|\bwhen\b|\bwho\b|\bwhere\b/i.test(q) },
]

/** Shape labels read from the answer itself. */
function shapeLabels(answer, stats, topic) {
  const absolutes = countMatches(answer, ABSOLUTES)
  const hedges = countMatches(answer, HEDGES)
  const actionVerbs = countMatches(answer, ACTION_VERBS)
  const englishActions = ACTION_VERBS_EN.reduce((n, w) => n + (new RegExp(`\\b${w}\\b`, 'i').test(answer) ? 1 : 0), 0)
  const unsourcedNumbers = (answer.match(/\d+(?:\.\d+)?\s*(?:%|元|字|分钟|次|倍|万|亿)/g)?.length ?? 0) >= 6 && !CITATION.test(answer)
  return {
    heading: stats.hasHeading,
    list: stats.listLines >= 2,
    table: stats.hasTable,
    code: stats.codeBlocks > 0,
    structured: stats.hasHeading || stats.listLines >= 2 || stats.hasTable || stats.codeBlocks > 0,
    stepwise: /^\s*\d+[.)、]\s+/m.test(answer) || actionVerbs + englishActions >= 3,
    evidence: CITATION.test(answer) || TOOL_EVIDENCE.test(answer),
    hedged: hedges > 0,
    absolute: absolutes > 0,
    unsourcedNumbers,
    vague: stats.chars < 60,
    refusal: REFUSAL.test(answer.trim()),
    offtopic: topic.ratio < 0.15 && stats.chars >= 60,
    repetition: stats.repeated > stats.words.length * 0.12,
    filler: stats.fillerCount > 2,
    example: /例如|比如|示例|举个例子|for example|e\.g\./i.test(answer),
    conditional: /如果|若|当.{0,10}(时|就)|if\s+.{0,60}(,|then)|取决于|视.{0,6}而定/i.test(answer),
    prioritise: /优先|首选|建议|recommend|prefer|pick/i.test(answer),
    conclusion: countMatches(answer, CONCLUSIONS) > 0,
    concrete: /(?:\d+|[一二三四五六七八九十两]+)\s*(?:天|日|个工作日|小时|分钟|点|月|年|元|%|字|周|次)/.test(answer) || /周[一二三四五六日天]/.test(answer) || /\d{4}-\d{1,2}-\d{1,2}/.test(answer),
    longParagraphs: stats.longParagraphs > 0,
    actionVerbs,
  }
}

/**
 * Classify one answer into the explicit label vocabulary.
 * @param {{ question?: string, answer: string }} input
 * @returns {object} labels + topic coverage (no scores yet)
 */
/** Overlap coefficient between two texts, used to detect a restated continuation. */
function continuationScore(contextAnswer, answer) {
  const a = termFrequencies(contextAnswer)
  const b = termFrequencies(answer)
  if (a.size === 0 || b.size === 0) return 0
  const intersection = [...b.keys()].filter((term) => a.has(term)).length
  return intersection / Math.max(1, Math.min(a.size, b.size))
}

export function classifyLabels(input) {
  const answer = String(input?.answer ?? '').trim()
  const question = String(input?.question ?? '').trim() || '（未捕获到用户问题）'
  const context = String(input?.context ?? '').trim()
  const contextAnswer = String(input?.contextAnswer ?? '').trim()
  const stats = answerStats(answer)
  let topic = topicCoverage(question, answer, new Set(tokenize(answer)))
  let contextUsed = false
  let contextScore = null
  if (context) {
    const contextTopic = topicCoverage(context, answer, new Set(tokenize(answer)))
    if (contextTopic.intents.length > 0) {
      contextScore = Math.round(contextTopic.ratio * 100)
      if (isFollowUp(question, context)) {
        // A short/continuation turn is graded against the task it continues;
        // the current wording alone cannot carry the intent. If the answer
        // restates the previous answer, that overlap also counts as relevance.
        const continuation = contextAnswer ? continuationScore(contextAnswer, answer) : 0
        const effective = Math.max(contextTopic.ratio, Math.min(0.85, continuation * 0.9))
        topic = {
          ...contextTopic,
          contextUsed: true,
          contextScore,
          continuation: Math.round(continuation * 100),
          keywordRatio: contextTopic.ratio,
          ratio: effective,
        }
        contextUsed = true
      }
    }
  }

  const intents = INTENT_LABELS.filter((rule) => rule.test(question))
  const shapes = shapeLabels(answer, stats, topic)
  const answerLabels = []
  const add = (group, id, confidence) => answerLabels.push({ group, id, confidence: Number(confidence.toFixed(2)) })

  for (const rule of intents) add('intent', rule.id, 0.8)
  if (intents.length === 0) add('intent', 'intent.other', 0.5)

  add('shape', 'shape.structured', shapes.structured ? 0.9 : 0.6)
  if (shapes.heading) add('shape', 'shape.heading', 0.9)
  if (shapes.list) add('shape', 'shape.list', 0.9)
  if (shapes.table) add('shape', 'shape.table', 0.9)
  if (shapes.code) add('shape', 'shape.code', 0.95)
  if (shapes.stepwise) add('shape', 'shape.stepwise', 0.8)
  if (shapes.evidence) add('shape', 'shape.evidence', 0.75)
  if (shapes.hedged) add('shape', 'shape.hedged', 0.7)
  if (shapes.absolute) add('shape', 'shape.absolute', 0.7)
  if (shapes.unsourcedNumbers) add('shape', 'shape.unsourced-numbers', 0.65)
  if (shapes.vague) add('shape', 'shape.vague', 0.75)
  if (shapes.refusal) add('shape', 'shape.refusal', 0.85)
  if (shapes.offtopic) add('shape', 'shape.offtopic', 0.65)
  if (shapes.repetition) add('shape', 'shape.repetition', 0.65)
  if (shapes.filler) add('shape', 'shape.filler', 0.6)
  if (shapes.example) add('shape', 'shape.example', 0.7)
  if (shapes.conditional) add('shape', 'shape.conditional', 0.7)
  if (shapes.prioritise) add('shape', 'shape.prioritise', 0.7)
  if (shapes.conclusion) add('shape', 'shape.conclusion', 0.75)
  if (shapes.concrete) add('shape', 'shape.concrete', 0.7)

  for (const intent of topic.intents) {
    add('topic', `topic.${intent.status}`, 0.7)
  }

  return {
    version: LABEL_VERSION,
    source: 'local',
    question: { intents: intents.map((rule) => rule.id), type: intents[0]?.type ?? 'general' },
    answer: shapes,
    topic,
    labels: answerLabels,
    stats,
  }
}

function dimsFromLabels(labels) {
  const { answer, question, topic, stats } = labels
  const coverage = topic.ratio
  const intents = topic.intents
  const typeMarker = TYPES.find((type) => type.id === question.type)?.marker.test(String(labels.answerText ?? '')) ?? false
  const relevance = clamp(35 + 50 * coverage + (typeMarker ? 8 : 0) - (answer.offtopic ? 18 : 0) - (answer.vague ? 6 : 0), 10, 98)
  const completeness = clamp(
    44 + 34 * coverage + (intents.length >= 2 ? 8 : 0) + (answer.conclusion ? 8 : 0) + (stats.chars >= 250 ? 8 : stats.chars >= 120 ? 4 : 0) - (answer.refusal ? 24 : 0) - (answer.vague ? 6 : 0) - (answer.offtopic ? 10 : 0),
    10,
    98,
  )
  const credibility = clamp(72 + (answer.evidence ? 9 : 0) + (answer.hedged ? 7 : 0) - (answer.absolute ? 10 : 0) - (answer.unsourcedNumbers ? 6 : 0) - (answer.offtopic ? 12 : 0), 15, 97)
  const clarity = clamp(
    54 + (answer.heading ? 9 : 0) + (answer.list ? 9 : 0) + (answer.code ? 6 : 0) + (answer.table ? 4 : 0) + (stats.paragraphs.length >= 2 && stats.paragraphs.length <= 8 ? 6 : 0) + (answer.list && stats.paragraphs.length <= 8 ? 6 : 0) + (stats.paragraphs[0] && stats.paragraphs[0].length <= 160 ? 4 : 0) + (stats.paragraphs.length >= 2 && stats.chars / stats.paragraphs.length < 180 ? 6 : 0) + (stats.sentences.length >= 3 ? 4 : 0) + (stats.sentences.length > 0 && stats.chars / stats.sentences.length >= 10 && stats.chars / stats.sentences.length <= 60 ? 4 : 0) - (answer.longParagraphs ? 8 : 0) - (answer.repetition ? 8 : 0) - (answer.filler ? 6 : 0),
    15,
    98,
  )
  const actionability = clamp(
    50 + (answer.stepwise ? 12 : 0) + (answer.code ? 10 : 0) + (answer.conditional ? 8 : 0) + (answer.prioritise ? 6 : 0) + (answer.example ? 5 : 0) + (answer.concrete ? 5 : 0) + Math.min(Number(answer.actionVerbs) || 0, 5) * 2,
    15,
    98,
  )
  return { relevance, completeness, credibility, clarity, actionability }
}

/**
 * Turn a label set into the report the client renders. Shared by the local
 * label engine and the Jev adapter, so both produce the same shape.
 * @param {object} labels - output of {@link classifyLabels} (or a Jev-produced equivalent)
 * @param {{ answer?: string, question?: string, engine?: string, meta?: object }} [extra]
 * @returns {object} report
 */
export function labelsToReport(labels, extra = {}) {
  const answer = String(extra.answer ?? '')
  const question = String(extra.question ?? '')
  const stats = labels.stats ?? answerStats(answer)
  const topic = labels.topic
  const dims = labels.dims ?? dimsFromLabels({ ...labels, answerText: answer })
  let score = Math.round(DIMENSIONS.reduce((sum, dim) => sum + dims[dim] * WEIGHTS[dim], 0))
  // Hard gates: an off-topic or refusing answer cannot present as "good" just
  // because its prose is readable.
  if (labels.answer?.offtopic) score = Math.min(score, 45)
  if (labels.answer?.refusal) score = Math.min(score, 50)
  const grade = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'poor'
  const ranked = [...DIMENSIONS].sort((a, b) => dims[b] - dims[a])
  const strong = ranked.filter((dim) => dims[dim] >= 76).slice(0, 2)
  const worst = ranked[ranked.length - 1]
  const hasWeakness = dims[worst] < 72 || labels.answer.absolute || topic.missing.length > 0 || topic.driftQuotes.length > 0
  const positiveText = strong.length > 0 ? strong.map((dim) => POSITIVE[dim]).join('、') : '整体一般'
  const summary = hasWeakness ? `${positiveText}；${NEGATIVE[worst]}。` : `${positiveText}；没有明显短板。`
  const confidence = labels.source === 'jev' ? labels.confidence ?? 'medium' : stats.chars < 120 || topic.intents.length === 0 ? 'low' : 'medium'
  const evidence = pickEvidence(answer, stats, topic)
  const suggestions = buildSuggestions(topic.intents, dims, topic)
  const tipQuestion = topic.contextUsed && extra.context ? String(extra.context) : question
  const promptTips = buildPromptTips({ question: tipQuestion, dims, topic, labels })

  return {
    score,
    grade,
    dims,
    topic: {
      score: clamp(topic.ratio * 100 - topic.driftQuotes.length * 10 + (labels.answer?.structured ? 4 : 0) + (topic.contextUsed ? 5 : 0), 0, 100),
      intents: topic.intents,
      covered: topic.covered.map((i) => i.label),
      partial: topic.partial.map((i) => i.label),
      missing: topic.missing.map((i) => i.label),
      driftQuotes: topic.driftQuotes,
      contextUsed: topic.contextUsed === true,
      contextScore: topic.contextScore ?? null,
      continuation: topic.continuation ?? null,
      keywordRatio: topic.keywordRatio ?? null,
    },
    summary,
    evidence,
    suggestions,
    promptTips,
    confidence,
    rubric: extra.engine === 'jev' ? 'jev-v1' : LABEL_VERSION,
    engine: extra.engine ?? 'labels',
    labels: labels.labels ?? [],
    stats: {
      chars: stats.chars,
      sentences: stats.sentences.length,
      paragraphs: stats.paragraphs.length,
      codeBlocks: stats.codeBlocks,
      listLines: stats.listLines,
      coverage: Number(topic.ratio.toFixed(3)),
      drift: topic.driftQuotes.length,
      type: labels.question?.type ?? 'general',
      questionPreview: question.length > 60 ? `${question.slice(0, 60)}…` : question,
      previousTurns: 0,
    },
    ...(extra.meta ?? {}),
  }
}

/**
 * Score an answer with the explicit label engine (default engine in the host).
 * @param {{ question?: string, answer: string }} input
 * @returns {object} report
 */
export function scoreWithLabels(input) {
  const answer = String(input?.answer ?? '').trim()
  const question = String(input?.question ?? '').trim()
  const context = String(input?.context ?? '').trim()
  const contextAnswer = String(input?.contextAnswer ?? '').trim()
  const labels = classifyLabels({ question, answer, context, contextAnswer })
  return labelsToReport(labels, { answer, question, context, engine: 'labels' })
}
