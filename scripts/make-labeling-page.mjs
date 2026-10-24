#!/usr/bin/env node
/**
 * 由 calibration/set.jsonl 生成本地标注页 calibration/labeling.html。
 *
 * 页面完全离线：数据内嵌、评分存 localStorage、导出 labels.jsonl 由浏览器下载。
 * 默认隐藏 AI 初评，避免锚定；建议先自己盲评，最后再打开对照。
 *
 * 用法：
 *   node scripts/make-labeling-page.mjs
 *   node scripts/make-labeling-page.mjs --in calibration/set.jsonl --out calibration/labeling.html
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const input = path.resolve(option('in', 'calibration/set.jsonl'))
const output = path.resolve(option('out', 'calibration/labeling.html'))

if (!fs.existsSync(input)) {
  console.error(`找不到 ${input}，先准备标注集（set.jsonl）。`)
  process.exit(1)
}

const rows = fs
  .readFileSync(input, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line, index) => ({ ...JSON.parse(line), id: Number.isInteger(JSON.parse(line).id) ? JSON.parse(line).id : index }))

const safeJson = JSON.stringify(rows).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>模型质量雷达 · 本地标注</title>
<style>
  :root{
    --bg:#f4f5f7; --card:#fff; --line:#e6e8ec; --ink:#1d2129; --ink2:#5b6472; --ink3:#8b929e;
    --green:#0e9f6e; --green-soft:#e9f7f1; --amber:#b45309; --amber-soft:#fdf3e3; --red:#b91c1c;
    --shadow:0 10px 40px rgba(18,24,40,.08),0 1px 3px rgba(18,24,40,.05);
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:14px/1.65 "PingFang SC","Hiragino Sans GB","Microsoft YaHei",-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
  .top{position:sticky;top:0;z-index:10;background:rgba(244,245,247,.94);backdrop-filter:blur(10px);
    border-bottom:1px solid var(--line);padding:12px 24px;display:flex;align-items:center;gap:16px}
  .brand{font-weight:700;letter-spacing:.2px}
  .brand small{display:block;font-weight:500;color:var(--ink3);font-size:10.5px;letter-spacing:2px}
  .prog{flex:1;height:6px;background:#e3e6ea;border-radius:999px;overflow:hidden;max-width:420px}
  .prog i{display:block;height:100%;width:0;background:var(--green);border-radius:999px;transition:width .2s}
  .count{color:var(--ink2);font-size:12px}
  .toggle{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink2);cursor:pointer}
  .wrap{max-width:1000px;margin:22px auto 60px;padding:0 20px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:20px 22px}
  .meta{display:flex;align-items:center;gap:8px;color:var(--ink3);font-size:11.5px;margin-bottom:10px}
  .badge{background:#f1f3f5;border:1px solid var(--line);border-radius:6px;padding:2px 7px}
  .q{font-size:15px;font-weight:600;line-height:1.6;margin-bottom:12px;white-space:pre-wrap}
  .answer{background:#fafbfc;border:1px solid var(--line);border-radius:10px;padding:14px 16px;max-height:44vh;
    overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.7;color:#2b3340}
  .rate{margin-top:18px}
  .rate h3{font-size:12px;color:var(--ink3);font-weight:600;letter-spacing:.4px;margin:0 0 8px}
  .stars{display:flex;gap:8px;flex-wrap:wrap}
  .star{flex:1;min-width:120px;border:1px solid var(--line);background:#fff;border-radius:10px;padding:10px 8px;
    cursor:pointer;text-align:center;transition:.12s;color:var(--ink2)}
  .star b{display:block;font-size:13px;color:var(--ink);margin-bottom:2px}
  .star small{font-size:10.5px;color:var(--ink3)}
  .star:hover{border-color:#b9c0ca}
  .star.on{border-color:var(--green);background:var(--green-soft);color:#0b6b4e}
  .star.on b{color:#0b6b4e}
  .row{display:flex;gap:14px;margin-top:14px;flex-wrap:wrap}
  .field{flex:1;min-width:180px}
  .field label{display:block;font-size:11px;color:var(--ink3);margin-bottom:5px}
  .field input,.field textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;
    font:inherit;font-size:12.5px;color:var(--ink);background:#fff;outline:none}
  .field input:focus,.field textarea:focus{border-color:var(--green)}
  .nav{display:flex;align-items:center;gap:10px;margin-top:20px}
  .btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;
    color:var(--ink2);cursor:pointer}
  .btn:hover{border-color:#b9c0ca}
  .btn.primary{background:var(--green);border-color:var(--green);color:#fff}
  .btn.primary:hover{filter:brightness(.95)}
  .btn:disabled{opacity:.4;cursor:not-allowed}
  .dots{display:flex;gap:6px;flex-wrap:wrap;margin:0 auto}
  .dot{width:22px;height:22px;border-radius:6px;border:1px solid var(--line);background:#fff;color:var(--ink3);
    font-size:10.5px;display:flex;align-items:center;justify-content:center;cursor:pointer}
  .dot.done{background:var(--green-soft);border-color:#bfe6d6;color:#0b6b4e}
  .dot.cur{outline:2px solid var(--green);outline-offset:1px}
  .ai{margin-top:18px;border-top:1px dashed var(--line);padding-top:14px;display:none}
  .ai.show{display:block}
  .ai .line{font-size:12px;color:var(--ink2);margin-bottom:6px}
  .ai .line b{color:var(--ink)}
  .ai .why{font-size:12px;color:var(--ink2);background:#fafbfc;border-left:2px solid #d8dde4;padding:8px 10px;border-radius:0 6px 6px 0}
  .hint{font-size:11px;color:var(--ink3);margin-top:10px}
  .done-all{text-align:center;padding:40px 0;color:var(--ink2)}
  .kbd{font-family:ui-monospace,monospace;font-size:11px;background:#f1f3f5;border:1px solid var(--line);border-radius:4px;padding:1px 5px}
</style>
</head>
<body>
<div class="top">
  <div class="brand">模型质量雷达<small>LOCAL LABELING</small></div>
  <div class="prog"><i id="prog"></i></div>
  <div class="count" id="count">0 / 0</div>
  <label class="toggle"><input type="checkbox" id="showAi"> 显示 AI 初评（会锚定，建议最后再开）</label>
</div>
<div class="wrap">
  <div class="card" id="card">
    <div class="meta"><span class="badge" id="source"></span><span id="model"></span><span id="idx"></span></div>
    <div class="q" id="q"></div>
    <div class="answer" id="a"></div>
    <div class="rate">
      <h3>这条回答有多好？（先自己判断，再对照 AI）</h3>
      <div class="stars" id="stars"></div>
      <div class="row">
        <div class="field" style="max-width:180px">
          <label>精确分（0-100，可改）</label>
          <input id="score" type="number" min="0" max="100" step="1" placeholder="未评分">
        </div>
        <div class="field">
          <label>备注（可选：为什么是这个分）</label>
          <input id="note" type="text" placeholder="例如：结论清楚，但漏了预算前提">
        </div>
      </div>
      <div class="hint">快捷键：<span class="kbd">1</span>-<span class="kbd">5</span> 打分，<span class="kbd">←</span> <span class="kbd">→</span> 切换样本。评分只存在本机浏览器。</div>
    </div>
    <div class="ai" id="ai">
      <div class="line">AI 初评：<b id="draftScore"></b> 分 · 自动分：<b id="autoScore"></b>（仅参考，不参与校准）</div>
      <div class="why" id="draftWhy"></div>
    </div>
    <div class="nav">
      <button class="btn" id="prev">← 上一条</button>
      <div class="dots" id="dots"></div>
      <button class="btn" id="next">下一条 →</button>
      <button class="btn primary" id="export">导出 labels.jsonl</button>
    </div>
  </div>
  <div class="done-all" id="done" style="display:none">
    <p>20 条都看完了。导出后运行：</p>
    <p><code>node scripts/apply-labels.mjs --labels calibration/labels.jsonl</code></p>
  </div>
</div>
<script>
const DATA = ${safeJson};
const STARS = [30, 50, 70, 85, 95];
const STORE = 'quality-lens-labels-v1';
const state = JSON.parse(localStorage.getItem(STORE) || '{}');
let cur = 0;

const $ = (id) => document.getElementById(id);
const save = () => localStorage.setItem(STORE, JSON.stringify(state));

function ensure(id) {
  if (!state[id]) state[id] = { humanScore: null, note: '' };
  return state[id];
}

function render() {
  const row = DATA[cur];
  const label = ensure(row.id);
  $('source').textContent = row.source === 'synthetic' ? '合成样本' : '真实会话';
  $('model').textContent = row.model ? '· ' + row.model : '';
  $('idx').textContent = '· 第 ' + (cur + 1) + ' / ' + DATA.length + ' 条';
  $('q').textContent = row.question || '（无问题）';
  $('a').textContent = row.answer || '';
  $('a').scrollTop = 0;
  $('score').value = label.humanScore === null ? '' : String(label.humanScore);
  $('note').value = label.note || '';
  $('draftScore').textContent = row.draftScore;
  $('autoScore').textContent = row.autoScore;
  $('draftWhy').textContent = row.draftReason || '—';

  const stars = $('stars');
  stars.textContent = '';
  const names = ['差', '一般', '好', '很好', '优秀'];
  STARS.forEach((value, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star' + (label.humanScore !== null && Math.abs(label.humanScore - value) <= 2 ? ' on' : '');
    btn.innerHTML = '<b>' + (index + 1) + ' 星 · ' + names[index] + '</b><small>' + value + ' 分</small>';
    btn.addEventListener('click', () => setScore(value));
    stars.appendChild(btn);
  });

  const dots = $('dots');
  dots.textContent = '';
  DATA.forEach((item, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot' + (state[item.id] && state[item.id].humanScore !== null ? ' done' : '') + (index === cur ? ' cur' : '');
    dot.textContent = String(index + 1);
    dot.addEventListener('click', () => { cur = index; render(); });
    dots.appendChild(dot);
  });

  const done = DATA.filter((item) => state[item.id] && state[item.id].humanScore !== null).length;
  $('count').textContent = done + ' / ' + DATA.length;
  $('prog').style.width = (100 * done / DATA.length) + '%';
  $('done').style.display = done === DATA.length ? 'block' : 'none';
  $('prev').disabled = cur === 0;
  $('next').disabled = cur === DATA.length - 1;
}

function setScore(value) {
  const label = ensure(DATA[cur].id);
  label.humanScore = Math.max(0, Math.min(100, Math.round(value)));
  save();
  render();
}

$('score').addEventListener('input', (event) => {
  const raw = event.target.value.trim();
  const label = ensure(DATA[cur].id);
  label.humanScore = raw === '' ? null : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
  save();
  const done = DATA.filter((item) => state[item.id] && state[item.id].humanScore !== null).length;
  $('count').textContent = done + ' / ' + DATA.length;
  $('prog').style.width = (100 * done / DATA.length) + '%';
});
$('note').addEventListener('input', (event) => {
  ensure(DATA[cur].id).note = event.target.value;
  save();
});
$('prev').addEventListener('click', () => { if (cur > 0) { cur -= 1; render(); } });
$('next').addEventListener('click', () => { if (cur < DATA.length - 1) { cur += 1; render(); } });
$('showAi').addEventListener('change', (event) => {
  $('ai').classList.toggle('show', event.target.checked);
});
$('export').addEventListener('click', () => {
  const lines = DATA.map((row) => {
    const label = state[row.id] || { humanScore: null, note: '' };
    return JSON.stringify({ id: row.id, humanScore: label.humanScore, note: label.note || '', source: row.source });
  });
  const blob = new Blob([lines.join('\\n') + '\\n'], { type: 'application/x-ndjson' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'labels.jsonl';
  a.click();
  URL.revokeObjectURL(url);
});

document.addEventListener('keydown', (event) => {
  if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.key >= '1' && event.key <= '5') setScore(STARS[Number(event.key) - 1]);
  if (event.key === 'ArrowLeft') { if (cur > 0) { cur -= 1; render(); } }
  if (event.key === 'ArrowRight') { if (cur < DATA.length - 1) { cur += 1; render(); } }
});

render();
</script>
</body>
</html>`

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, html, 'utf8')
console.log(`已生成 ${output}（${rows.length} 条样本）`)
console.log('打开：open ' + output)
console.log('隐私：文件只在本机；calibration/ 已 gitignore。')
