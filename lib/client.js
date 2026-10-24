/**
 * 质量雷达 / Quality Lens — browser half.
 *
 * Hand-written lazy-CJS bundle (the format the client module system expects):
 * it registers the package id and a factory, exports a normal Cordis plugin,
 * and renders the score chip into the assistant action row. No build step.
 *
 * It reads one JSON route from the host (`/api/dsh-quality-lens/report`) and
 * never writes anything except the feedback POST the user triggers.
 */
window.__ModuleLoader__.load({
  id: 'dsh-quality-lens',
  factory: (require) => {
    const React = require('react')
    const NS = 'quality-lens'
    const h = React.createElement

    const zh = {
      'chip.quality': '质量',
      'chip.topic': '关联',
      'chip.hint': '质量雷达：点击查看质检报告',
      'panel.title': '质量报告',
      'panel.close': '关闭',
      'panel.dims': '五维评分',
      'panel.topic': '话题关联度',
      'panel.covered': '覆盖',
      'panel.missing': '未覆盖',
      'panel.drift': '关联较弱的段落',
      'panel.evidence': '证据与理由',
      'panel.suggestions': '改进建议',
      'panel.promptTips': '提示词调优',
      'panel.copy': '复制改写',
      'panel.copied': '已复制',
      'panel.appendLabel': '在提问后追加',
      'panel.fullRewrite': '完整改写',
      'panel.confidence': '置信度',
      'panel.confidence.high': '高',
      'panel.confidence.medium': '中',
      'panel.confidence.low': '低',
      'panel.footer': '本地评分 · 不上传对话 · 仅供参考',
      'panel.rubric': '评分口径',
      'panel.context': '含上下文',
      'panel.contextHint': '关联度参考了最近一轮的问题',
      'panel.model': '模型',
      'panel.note': '分数用于比较表达与任务达成，不代表事实正确性。',
      'dim.relevance': '相关性',
      'dim.completeness': '完整性',
      'dim.credibility': '可信度',
      'dim.clarity': '清晰度',
      'dim.actionability': '可执行性',
      'grade.excellent': '优秀',
      'grade.good': '良好',
      'grade.fair': '一般',
      'grade.poor': '需改进',
      'topic.noQuestion': '未捕获到对应问题',
    }

    const en = {
      'chip.quality': 'Quality',
      'chip.topic': 'Topic',
      'chip.hint': 'Quality Lens: click for the review report',
      'panel.title': 'Quality report',
      'panel.close': 'Close',
      'panel.dims': 'Five dimensions',
      'panel.topic': 'Topic coverage',
      'panel.covered': 'Covered',
      'panel.missing': 'Missing',
      'panel.drift': 'Low-relevance paragraph',
      'panel.evidence': 'Evidence',
      'panel.suggestions': 'Suggestions',
      'panel.promptTips': 'Prompt tuning',
      'panel.copy': 'Copy rewrite',
      'panel.copied': 'Copied',
      'panel.appendLabel': 'Append after your question',
      'panel.fullRewrite': 'Full rewrite',
      'panel.confidence': 'Confidence',
      'panel.confidence.high': 'High',
      'panel.confidence.medium': 'Medium',
      'panel.confidence.low': 'Low',
      'panel.footer': 'Scored locally · no conversation is uploaded · heuristic only',
      'panel.rubric': 'Rubric',
      'panel.context': 'Context',
      'panel.contextHint': 'Topic coverage used the previous question as context',
      'panel.model': 'Model',
      'panel.note': 'Scores compare expression and task completion, not factual truth.',
      'dim.relevance': 'Relevance',
      'dim.completeness': 'Completeness',
      'dim.credibility': 'Credibility',
      'dim.clarity': 'Clarity',
      'dim.actionability': 'Actionability',
      'grade.excellent': 'Excellent',
      'grade.good': 'Good',
      'grade.fair': 'Fair',
      'grade.poor': 'Needs work',
      'topic.noQuestion': 'No matching question was captured',
    }

    const CSS = `
.ql-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:8px;
  border:1px solid transparent;font-family:inherit;font-size:12px;font-weight:600;line-height:1;cursor:pointer;
  white-space:nowrap;transition:filter .12s ease;background:transparent;}
.ql-chip:hover{filter:brightness(.96);}
.ql-chip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2563eb);outline-offset:2px;}
.ql-diamond{width:7px;height:7px;border-radius:1.5px;transform:rotate(45deg);background:currentColor;flex:none;}
.ql-good{color:var(--dsw-alias-state-success-primary,#0e9f6e);
  background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#0e9f6e) 12%,transparent);
  border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#0e9f6e) 28%,transparent);}
.ql-excellent{color:var(--dsw-alias-state-success-primary,#0b7a55);
  background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#0e9f6e) 18%,transparent);
  border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#0e9f6e) 36%,transparent);}
.ql-fair{color:var(--dsw-alias-state-warn-primary,#b45309);
  background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent);
  border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 30%,transparent);}
.ql-poor{color:var(--dsw-alias-state-error-primary,#b91c1c);
  background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 12%,transparent);
  border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 26%,transparent);}
.ql-panel{position:fixed;top:64px;right:24px;bottom:24px;width:400px;max-width:calc(100vw - 32px);z-index:1201;
  overflow:auto;border-radius:14px;border:1px solid var(--dsw-alias-border-l2,rgba(20,26,36,.12));
  background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1d2129);
  box-shadow:0 24px 60px rgba(10,14,20,.22);font-family:inherit;font-size:12.5px;line-height:1.6;}
.ql-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(10,14,20,.22);}
.ql-head{display:flex;align-items:flex-start;gap:10px;padding:16px 18px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(20,26,36,.08));position:sticky;top:0;
  background:var(--dsw-alias-bg-base,#fff);z-index:1;}
.ql-title{font-size:14px;font-weight:600;letter-spacing:.2px;}
.ql-sub{font-size:11px;color:var(--dsw-alias-label-tertiary,#8b929e);margin-top:3px;}
.ql-close{margin-left:auto;width:26px;height:26px;border:0;border-radius:7px;background:transparent;
  color:var(--dsw-alias-label-tertiary,#8b929e);cursor:pointer;font-size:16px;line-height:1;flex:none;}
.ql-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,26,36,.06));}
.ql-hero{display:flex;align-items:center;gap:14px;padding:16px 18px;}
.ql-ring{width:78px;height:78px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;
  position:relative;background:conic-gradient(var(--ql-tone,#0e9f6e) 0 var(--ql-pct,0%),rgba(20,26,36,.09) var(--ql-pct,0%));}
.ql-ring::after{content:'';position:absolute;inset:6px;border-radius:50%;background:var(--dsw-alias-bg-base,#fff);}
.ql-ring-num{position:relative;z-index:1;font-size:24px;font-weight:700;letter-spacing:-.5px;}
.ql-ring-num small{font-size:10px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8b929e);margin-left:1px;}
.ql-hero-main{min-width:0;}
.ql-badges{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;}
.ql-badge{font-size:11px;font-weight:600;border-radius:6px;padding:2px 7px;
  background:color-mix(in srgb,var(--ql-tone,#0e9f6e) 14%,transparent);color:var(--ql-tone,#0b6b4e);}
.ql-badge.plain{background:var(--dsw-alias-interactive-bg-hover,rgba(20,26,36,.06));
  color:var(--dsw-alias-label-secondary,#5b6472);font-weight:500;}
.ql-summary{font-size:12px;color:var(--dsw-alias-label-secondary,#5b6472);}
.ql-section{padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l2,rgba(20,26,36,.08));}
.ql-h3{font-size:11px;font-weight:600;letter-spacing:.4px;color:var(--dsw-alias-label-tertiary,#8b929e);margin-bottom:9px;}
.ql-bar{display:flex;align-items:center;gap:9px;margin-bottom:7px;}
.ql-bar-label{width:58px;flex:none;color:var(--dsw-alias-label-secondary,#5b6472);font-size:11.5px;}
.ql-bar-track{flex:1;height:6px;border-radius:999px;background:rgba(20,26,36,.09);overflow:hidden;}
.ql-bar-fill{height:100%;border-radius:999px;background:var(--ql-tone,#0e9f6e);}
.ql-bar-val{width:24px;text-align:right;color:var(--dsw-alias-label-secondary,#5b6472);
  font-variant-numeric:tabular-nums;font-size:11.5px;}
.ql-topic-top{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;}
.ql-topic-num{font-size:21px;font-weight:700;letter-spacing:-.3px;}
.ql-topic-num small{font-size:10px;font-weight:500;color:var(--dsw-alias-label-tertiary,#8b929e);margin-left:1px;}
.ql-muted{color:var(--dsw-alias-label-tertiary,#8b929e);font-size:11px;}
.ql-tags{display:flex;flex-wrap:wrap;gap:5px;}
.ql-tag{display:inline-flex;align-items:center;gap:5px;max-width:100%;font-size:11px;border-radius:6px;
  padding:3px 7px;background:var(--dsw-alias-interactive-bg-hover,rgba(20,26,36,.06));
  color:var(--dsw-alias-label-secondary,#5b6472);}
.ql-tag::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor;flex:none;opacity:.85;}
.ql-tag.covered{color:var(--dsw-alias-state-success-primary,#0e9f6e);}
.ql-tag.partial{color:var(--dsw-alias-state-warn-primary,#b45309);}
.ql-tag.missing{color:var(--dsw-alias-label-tertiary,#8b929e);}
.ql-tag span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ql-quote{border-left:2px solid color-mix(in srgb,var(--ql-tone,#0e9f6e) 35%,transparent);
  background:var(--dsw-alias-interactive-bg-hover,rgba(20,26,36,.03));border-radius:0 7px 7px 0;
  padding:8px 10px;margin-bottom:7px;}
.ql-quote-why{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8b929e);margin-bottom:3px;}
.ql-quote-text{font-size:11.5px;color:var(--dsw-alias-label-primary,#1d2129);}
.ql-sug{display:flex;gap:7px;margin-bottom:6px;font-size:11.5px;color:var(--dsw-alias-label-primary,#1d2129);}
.ql-sug b{color:var(--ql-tone,#0e9f6e);font-weight:700;flex:none;}
.ql-ptip{border:1px solid var(--dsw-alias-border-l2,rgba(20,26,36,.1));border-radius:8px;
  padding:8px 10px;margin-bottom:8px;background:var(--dsw-alias-interactive-bg-hover,rgba(20,26,36,.03));}
.ql-ptip-issue{font-size:10.5px;color:var(--dsw-alias-label-tertiary,#8b929e);margin-bottom:3px;}
.ql-ptip-tip{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-primary,#1d2129);margin-bottom:7px;}
.ql-rewrite{position:relative;border-radius:6px;background:var(--dsw-alias-bg-base,#fff);
  border:1px solid var(--dsw-alias-border-l2,rgba(20,26,36,.08));padding:7px 66px 7px 9px;}
.ql-rewrite-label{font-size:9.5px;color:var(--dsw-alias-label-tertiary,#8b929e);margin-bottom:4px;letter-spacing:.2px;}
.ql-rewrite-text{font-size:10.5px;line-height:1.6;white-space:pre-wrap;color:var(--dsw-alias-label-secondary,#5b6472);
  max-height:104px;overflow:auto;}
.ql-copy{position:absolute;right:6px;top:6px;border:1px solid var(--dsw-alias-border-l2,rgba(20,26,36,.12));
  background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#5b6472);border-radius:5px;
  font:inherit;font-size:10px;padding:2px 6px;cursor:pointer;}
.ql-copy:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(20,26,36,.06));}
.ql-foot{padding:11px 18px 14px;border-top:1px solid var(--dsw-alias-border-l2,rgba(20,26,36,.08));
  color:var(--dsw-alias-label-tertiary,#8b929e);font-size:10.5px;}
.ql-foot b{font-weight:500;color:var(--dsw-alias-label-secondary,#5b6472);}
`

    const TONE = {
      excellent: 'var(--dsw-alias-state-success-primary, #0b7a55)',
      good: 'var(--dsw-alias-state-success-primary, #0e9f6e)',
      fair: 'var(--dsw-alias-state-warn-primary, #b45309)',
      poor: 'var(--dsw-alias-state-error-primary, #b91c1c)',
    }

    function useReport(messageId) {
      const [report, setReport] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        let timer = null
        let attempts = 0
        const load = () => {
          if (!alive) return
          fetch(`/api/dsh-quality-lens/report?messageId=${encodeURIComponent(messageId)}`, {
            headers: { accept: 'application/json' },
            credentials: 'same-origin',
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (!alive) return
              if (data && data.report) {
                setReport(data.report)
                return
              }
              attempts += 1
              if (attempts < 3) timer = setTimeout(load, 450 * attempts)
            })
            .catch(() => {
              if (!alive) return
              attempts += 1
              if (attempts < 3) timer = setTimeout(load, 700 * attempts)
            })
        }
        load()
        return () => {
          alive = false
          if (timer) clearTimeout(timer)
        }
      }, [messageId])

      const pendingJev = report && report.pendingJev === true
      React.useEffect(() => {
        if (!pendingJev) return
        let alive = true
        const poll = () => {
          fetch(`/api/dsh-quality-lens/report?messageId=${encodeURIComponent(messageId)}`, {
            headers: { accept: 'application/json' },
            credentials: 'same-origin',
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (alive && data && data.report) setReport(data.report)
            })
            .catch(() => {})
        }
        const interval = setInterval(poll, 800)
        const stop = setTimeout(() => clearInterval(interval), 8000)
        return () => {
          alive = false
          clearInterval(interval)
          clearTimeout(stop)
        }
      }, [pendingJev, messageId])
      return report
    }

    function Dims({ report, t, tone }) {
      const keys = ['relevance', 'completeness', 'credibility', 'clarity', 'actionability']
      return h(
        'div',
        { className: 'ql-section' },
        h('div', { className: 'ql-h3' }, t('panel.dims')),
        keys.map((key) =>
          h(
            'div',
            { className: 'ql-bar', key },
            h('div', { className: 'ql-bar-label' }, t(`dim.${key}`)),
            h(
              'div',
              { className: 'ql-bar-track' },
              h('div', { className: 'ql-bar-fill', style: { width: `${report.dims[key]}%`, background: tone } }),
            ),
            h('div', { className: 'ql-bar-val' }, String(report.dims[key])),
          ),
        ),
      )
    }

    function Topic({ report, t }) {
      const intents = report.topic?.intents ?? []
      return h(
        'div',
        { className: 'ql-section' },
        h('div', { className: 'ql-h3' }, t('panel.topic')),
        h(
          'div',
          { className: 'ql-topic-top' },
          h('span', { className: 'ql-topic-num' }, String(report.topic?.score ?? 0), h('small', null, '%')),
          h(
            'span',
            { className: 'ql-muted' },
            `${t('panel.covered')} ${(report.topic?.covered ?? []).length}/${intents.length}`,
          ),
          report.topic?.contextUsed
            ? h('span', { className: 'ql-badge plain', title: t('panel.contextHint') }, `${t('panel.context')}${report.topic.continuation ? ` ${report.topic.continuation}%` : ''}`)
            : null,
        ),
        intents.length === 0
          ? h('div', { className: 'ql-muted' }, t('topic.noQuestion'))
          : h(
              'div',
              { className: 'ql-tags' },
              intents.map((intent, index) =>
                h(
                  'span',
                  { className: `ql-tag ${intent.status}`, key: `${index}-${intent.label}`, title: intent.label },
                  h('span', null, intent.label),
                ),
              ),
            ),
      )
    }

    function PromptTip({ tip, t }) {
      const [copied, setCopied] = React.useState(false)
      const shown = tip.addition || tip.rewrite
      const shownLabel = tip.addition ? t('panel.appendLabel') : t('panel.fullRewrite')
      const copy = () => {
        const done = () => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(tip.rewrite).then(done).catch(done)
        } else {
          done()
        }
      }
      return h(
        'div',
        { className: 'ql-ptip' },
        h('div', { className: 'ql-ptip-issue' }, tip.issue),
        h('div', { className: 'ql-ptip-tip' }, tip.tip),
        h(
          'div',
          { className: 'ql-rewrite' },
          h('div', { className: 'ql-rewrite-label' }, shownLabel),
          h('div', { className: 'ql-rewrite-text' }, shown),
          h('button', { type: 'button', className: 'ql-copy', onClick: copy }, copied ? t('panel.copied') : t('panel.copy')),
        ),
      )
    }

    function PromptTips({ report, t }) {
      const tips = Array.isArray(report.promptTips) ? report.promptTips : []
      if (tips.length > 0) {
        return h(
          'div',
          { className: 'ql-section' },
          h('div', { className: 'ql-h3' }, t('panel.promptTips')),
          tips.map((tip, index) => h(PromptTip, { tip, t, key: index })),
        )
      }
      const legacy = Array.isArray(report.suggestions) ? report.suggestions : []
      if (legacy.length === 0) return null
      return h(
        'div',
        { className: 'ql-section' },
        h('div', { className: 'ql-h3' }, t('panel.suggestions')),
        legacy.map((text, index) => h('div', { className: 'ql-sug', key: index }, h('b', null, String(index + 1)), h('span', null, text))),
      )
    }

    function Panel({ report, t, tone, onClose }) {
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const grade = t(`grade.${report.grade}`)
      const confidence = t(`panel.confidence.${report.confidence}`)
      const pct = Math.max(0, Math.min(100, report.score))
      const meta = [report.model || report.provider || '', report.at ? new Date(report.at).toLocaleTimeString() : '']
        .filter(Boolean)
        .join(' · ')

      return h(
        React.Fragment,
        null,
        h('div', { className: 'ql-backdrop', onClick: onClose }),
        h(
          'div',
          { className: 'ql-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('panel.title') },
          h(
            'div',
            { className: 'ql-head' },
            h(
              'div',
              null,
              h('div', { className: 'ql-title' }, t('panel.title')),
              h('div', { className: 'ql-sub' }, meta),
            ),
            h('button', { className: 'ql-close', type: 'button', onClick: onClose, 'aria-label': t('panel.close') }, '×'),
          ),
          h(
            'div',
            { className: 'ql-hero' },
            h(
              'div',
              {
                className: 'ql-ring',
                style: { '--ql-tone': tone, '--ql-pct': `${pct}%` },
              },
              h('span', { className: 'ql-ring-num' }, String(report.score), h('small', null, '/100')),
            ),
            h(
              'div',
              { className: 'ql-hero-main' },
              h(
                'div',
                { className: 'ql-badges' },
                h('span', { className: 'ql-badge' }, grade),
                h(
                  'span',
                  { className: 'ql-badge plain' },
                  `${t('panel.confidence')} ${confidence}`,
                ),
                report.rubric
                  ? h('span', { className: 'ql-badge plain' }, report.engine === 'jev' ? 'Jev 精评' : report.rubric)
                  : null,
                report.pendingJev ? h('span', { className: 'ql-badge plain' }, '精评中…') : null,
              ),
              h('div', { className: 'ql-summary' }, report.summary),
            ),
          ),
          h(Dims, { report, t, tone }),
          h(Topic, { report, t }),
          report.evidence && report.evidence.length > 0
            ? h(
                'div',
                { className: 'ql-section' },
                h('div', { className: 'ql-h3' }, t('panel.evidence')),
                report.evidence.map((item, index) =>
                  h(
                    'div',
                    { className: 'ql-quote', key: `${index}-${item.dim}` },
                    h('div', { className: 'ql-quote-why' }, item.why),
                    h('div', { className: 'ql-quote-text' }, `“${item.quote}”`),
                  ),
                ),
              )
            : null,
          h(PromptTips, { report, t }),
          h(
            'div',
            { className: 'ql-foot' },
            h('b', null, `${t('panel.rubric')} ${report.rubric ?? 'v1-local'}`),
            ` · ${t('panel.footer')}`,
            h('div', { style: { marginTop: '4px' } }, t('panel.note')),
          ),
        ),
      )
    }

    function Chip(props) {
      const messageId = props.messageId
      const t = typeof props.t === 'function' ? props.t : (key) => (zh[key] ?? en[key] ?? key)
      const report = useReport(messageId)
      const [open, setOpen] = React.useState(false)
      if (!report) return null

      const toneKey = report.score >= 90 ? 'excellent' : report.score >= 75 ? 'good' : report.score >= 60 ? 'fair' : 'poor'
      const label = `${t('chip.quality')} ${report.score} · ${t('chip.topic')} ${report.topic?.score ?? 0}%`
      const hint = report.pendingJev ? '正在用 Jev 精评，稍后更新' : t('chip.hint')

      return h(
        React.Fragment,
        null,
        h(
          'button',
          {
            type: 'button',
            className: `ql-chip ql-${toneKey}`,
            title: hint,
            'aria-label': `${label} · ${hint}`,
            onClick: () => setOpen(true),
          },
          h('span', { className: 'ql-diamond', 'aria-hidden': 'true' }),
          h('span', null, label),
        ),
        open ? h(Panel, { report, t, tone: TONE[toneKey], onClose: () => setOpen(false) }) : null,
      )
    }

    function apply(ctx) {
      ctx.effect(() => {
        if (document.getElementById('ql-quality-lens-style')) return () => {}
        const el = document.createElement('style')
        el.id = 'ql-quality-lens-style'
        el.textContent = CSS
        document.head.appendChild(el)
        return () => {
          el.remove()
        }
      }, 'quality-lens: styles')

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'quality-lens: dictionaries')

      ctx.slots.inject('conversation.chat.assistant-actions', () =>
        ctx.slots.register(
          {
            name: 'conversation.chat.assistant-actions',
            id: 'quality-lens',
            order: 30,
            locale: NS,
          },
          Chip,
        ),
      )
    }

    return { name: NS, inject: ['slots', 'locale'], apply }
  },
})
