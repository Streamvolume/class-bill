/**
 * app.js — 班费公示平台 v2 业务逻辑
 * 依赖：themes.js  data.js
 */

/* ==================== 类型元数据 ==================== */

const TYPE_META = {
  income_collective: { label: '集体缴费', bg: 'rgba(52,211,153,0.12)',  color: 'var(--income)',  sign: '+' },
  income_activity:   { label: '活动筹款', bg: 'rgba(52,211,153,0.08)',  color: 'var(--income)',  sign: '+' },
  income_surplus:    { label: '结余归还', bg: 'rgba(52,211,153,0.06)',  color: 'var(--income)',  sign: '+' },
  expense:           { label: '出账',     bg: 'rgba(251,146,60,0.12)',  color: 'var(--expense)', sign: '−' },
  refund:            { label: '冲账退款', bg: 'rgba(100,180,255,0.10)', color: '#7dd3fc',        sign: '+' },
  balance_init:      { label: '期初余额', bg: 'rgba(255,255,255,0.06)', color: 'var(--text-3)',  sign: ''  },
};

const INCOME_TYPES  = ['income_collective', 'income_activity', 'income_surplus', 'refund', 'balance_init'];
const EXPENSE_TYPES = ['expense'];

/* ==================== 全局状态 ==================== */

let BILLS = [];
let currentFilter = 'all';
let editingId     = null;   // 当前编辑的账单 ID，null = 新增模式
let adminAuthed   = false;

/* ==================== 统计计算 ==================== */

function calcBalance(bills) {
  return bills.reduce((acc, tx) => {
    if (INCOME_TYPES.includes(tx.type))  return acc + tx.amount;
    if (EXPENSE_TYPES.includes(tx.type)) return acc - tx.amount;
    return acc;
  }, 0);
}

function daysSinceEnroll() {
  const enroll = new Date(META.enroll_date);
  return Math.floor((Date.now() - enroll.getTime()) / 86400000);
}

function animateCount(el, target, duration, decimals = 0) {
  const start = performance.now();
  function step(now) {
    const p   = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val  = target * ease;
    el.textContent = decimals > 0 ? val.toFixed(decimals) : Math.floor(val).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = decimals > 0 ? target.toFixed(decimals) : target.toLocaleString();
  }
  requestAnimationFrame(step);
}

function renderStats() {
  const days      = daysSinceEnroll();
  const balance   = calcBalance(BILLS);
  const count     = BILLS.filter(t => t.type === 'expense').length;
  const perPerson = META.headcount > 0 ? balance / META.headcount : 0;

  document.getElementById('classBadge').textContent =
    META.class_name + ' · ' + META.academic_year;

  animateCount(document.getElementById('statDays'),      days,      1400, 0);
  animateCount(document.getElementById('statCount'),     count,      900, 0);
  animateCount(document.getElementById('statBalance'),   balance,   1200, 2);
  animateCount(document.getElementById('statPerPerson'), perPerson, 1200, 2);

  const balEl = document.getElementById('statBalance');
  if (balance < 0)   balEl.style.color = 'var(--expense)';
  else if (balance < 200) balEl.style.color = 'var(--accent-2)';
  else               balEl.style.color = 'var(--accent)';
}

/* ==================== 浮动背景卡片 ==================== */

function generateFloatCards() {
  const bg = document.getElementById('heroBg');
  bg.innerHTML = '';
  const items = BILLS.filter(t => t.type !== 'balance_init').slice(-14);
  items.forEach(tx => {
    const card = document.createElement('div');
    card.className = 'float-card';
    const isExp = EXPENSE_TYPES.includes(tx.type);
    const sign  = isExp ? '−' : '+';
    const cls   = isExp ? 'fc-expense' : 'fc-income';
    card.innerHTML =
      `${tx.date} · ${tx.title.slice(0, 14)} <span class="${cls}">${sign}¥${tx.amount}</span>`;
    const left  = 5 + Math.random() * 85;
    const delay = Math.random() * 18;
    const dur   = 14 + Math.random() * 12;
    const rot   = (Math.random() - 0.5) * 10;
    card.style.cssText =
      `left:${left}%;--rot:${rot}deg;animation-duration:${dur}s;animation-delay:-${delay}s;`;
    bg.appendChild(card);
  });
}

/* ==================== UI 原子组件 ==================== */

function typeBadge(type) {
  const m = TYPE_META[type] || { label: type, bg: 'rgba(255,255,255,0.05)', color: 'var(--text-2)' };
  return `<span class="type-badge" style="background:${m.bg};color:${m.color}">${m.label}</span>`;
}

function amountCell(tx) {
  const m = TYPE_META[tx.type];
  if (!m || m.sign === '')
    return `<span style="color:var(--text-3);font-family:var(--font-mono)">—</span>`;
  const cls = m.sign === '+' ? 'amount-income' : 'amount-expense';
  return `<span class="${cls}">${m.sign} ¥${tx.amount.toFixed(2)}</span>`;
}

function tagsPills(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(t => `<span class="tag-pill">${t}</span>`).join('');
}

/* ==================== 账单列表渲染 ==================== */

function filterBills(filter) {
  return BILLS.filter(tx => {
    if (filter === 'all')        return true;
    if (filter === 'income')     return INCOME_TYPES.includes(tx.type);
    if (filter === 'expense')    return tx.type === 'expense';
    if (filter === 'unconfirmed') return !tx.confirmed;
    return true;
  });
}

function renderLedger() {
  const rows = filterBills(currentFilter);

  /* Desktop table */
  const tbody = document.getElementById('ledgerBody');
  if (!rows.length) {
    tbody.innerHTML =
      `<tr><td colspan="6"><div class="empty-hint">暂无符合条件的账单</div></td></tr>`;
  } else {
    tbody.innerHTML = rows.map(tx => `
      <tr>
        <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-3)">${tx.date}</td>
        <td>${typeBadge(tx.type)}</td>
        <td>
          <div style="color:var(--text-1);font-weight:500">${tx.title}</div>
          ${tx.linked_activity
            ? `<div style="font-size:0.72rem;color:var(--text-3);margin-top:2px">↳ ${tx.linked_activity}</div>`
            : ''}
          ${tx.note
            ? `<div style="font-size:0.72rem;color:var(--text-3);margin-top:1px">${tx.note}</div>`
            : ''}
        </td>
        <td>${tagsPills(tx.tags)}</td>
        <td>${amountCell(tx)}</td>
        <td>
          <span class="confirmed-dot ${tx.confirmed ? 'dot-yes' : 'dot-no'}"
            title="${tx.confirmed ? '已核实：' + (tx.confirmed_by || '') : '待确认'}"></span>
          <span style="font-size:0.72rem;color:var(--text-3);margin-left:4px">
            ${tx.confirmed ? tx.confirmed_by || '已核实' : '待确认'}
          </span>
        </td>
      </tr>
    `).join('');
  }

  /* Mobile cards */
  const cardsCont = document.getElementById('ledgerCards');
  if (!rows.length) {
    cardsCont.innerHTML = `<div class="empty-hint">暂无符合条件的账单</div>`;
  } else {
    cardsCont.innerHTML = rows.map(tx => `
      <div class="ledger-card">
        <div class="lc-top">
          <div class="lc-title">${tx.title}</div>
          <div>${amountCell(tx)}</div>
        </div>
        <div class="lc-meta">
          ${typeBadge(tx.type)}
          <span class="lc-date">${tx.date}</span>
          ${tagsPills(tx.tags)}
          <span class="confirmed-dot ${tx.confirmed ? 'dot-yes' : 'dot-no'}" style="margin-left:4px"></span>
        </div>
        ${tx.note
          ? `<div style="font-size:0.75rem;color:var(--text-3);margin-top:0.4rem">${tx.note}</div>`
          : ''}
      </div>
    `).join('');
  }
}

/* ==================== 筛选 Tab ==================== */

document.getElementById('filterTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderLedger();
});

/* ==================== 滚动揭示动画 ==================== */

function initReveal() {
  const io = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.1 }
  );
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

/* ==================== 初始化 ==================== */

async function init() {
  initTheme();

  const isGithub = typeof MODE !== 'undefined' && MODE === 'github';
  document.getElementById('modeBadge').textContent = isGithub ? 'GitHub 模式' : 'Local 模式';

  try {
    BILLS = await loadBills();
  } catch (err) {
    console.error('数据加载失败', err);
    BILLS = [];
  }

  renderStats();
  renderLedger();
  generateFloatCards();
  initReveal();

  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 500);
}

document.addEventListener('DOMContentLoaded', init);
