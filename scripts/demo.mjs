import { scoreAnswer } from '../lib/scoring.js'

const samples = [
  {
    label: '良好：对比题 + 建议',
    question: '帮我对比一下 V4.1 Flash 和 V4-Pro 在长文写作上的差异，顺便给个选择建议。',
    answer: `两代模型在长文写作上的差异，主要集中在三个维度：

- 结构与节奏：V4.1 Flash 更愿意用分层小标题，段落推进更稳。
- 细节密度：V4-Pro 的论据更厚，长文里更少出现“正确的废话”。
- 一致性：超过 3,000 字后，Flash 的收束能力略弱，需要结尾提示。

选择建议：日常长文用 Flash 足够；对论据密度要求高的稿件，切到 Pro。如果预算敏感、篇幅在 2,000 字以内，优先 Flash。`,
  },
  {
    label: '一般：跑题 + 绝对化',
    question: '这个 Python 脚本报错了，怎么排查？',
    answer: `人工智能正在深刻改变世界。很多人都在讨论大模型，它一定会取代所有重复劳动，这是毫无疑问的。学习编程非常重要，建议多看书、多练习。`,
  },
  {
    label: '偏弱：短回答',
    question: '如何在 dsh 里安装插件？',
    answer: '可以直接安装。',
  },
  {
    label: '英文样本',
    question: 'Compare V4.1 Flash and V4-Pro for long-form writing and recommend one.',
    answer: `Both models handle long-form writing, but they differ in three ways:

- Structure: Flash uses headings and moves paragraphs more steadily.
- Evidence density: Pro keeps more concrete detail and fewer filler sentences.
- Consistency: after about 3,000 words, Flash needs an explicit closing cue.

Recommendation: use Flash for everyday drafts. Switch to Pro when evidence density matters. If your budget is tight or the piece is under 2,000 words, stay on Flash.`,
  },
]

for (const sample of samples) {
  const report = scoreAnswer({ question: sample.question, answer: sample.answer })
  console.log(`\n=== ${sample.label}`)
  console.log(`score ${report.score} (${report.grade}) · topic ${report.topic.score}% · confidence ${report.confidence}`)
  console.log('dims', report.dims)
  console.log('summary', report.summary)
  console.log('intents', report.topic.intents.map((i) => `${i.status}:${i.label}`))
  console.log('evidence', report.evidence.map((e) => `${e.dim}: ${e.quote.slice(0, 40)}`))
  console.log('suggestions', report.suggestions)
}
