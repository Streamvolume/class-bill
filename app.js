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

/* ==================== ADMIN — 认证 ==================== */

const ADMIN_PASSWORD = 'banwei2023'; // ← 可修改

function toggleAdmin() {
  const zone = document.getElementById('zone-admin');
  const isOpen = zone.classList.toggle('open');
  if (isOpen) zone.scrollIntoView({ behavior: 'smooth' });
}

function doAuth() {
  const val     = document.getElementById('authInput').value;
  const alertEl = document.getElementById('authAlert');

  if (val !== ADMIN_PASSWORD) {
    alertEl.innerHTML = '<div class="alert alert-error">密码错误，请重试</div>';
    document.getElementById('authInput').value = '';
    setTimeout(() => { alertEl.innerHTML = ''; }, 2000);
    return;
  }

  // GitHub 模式：校验 token 不为空
  if (typeof MODE !== 'undefined' && MODE === 'github') {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token) {
      alertEl.innerHTML = '<div class="alert alert-error">GitHub 模式下请填写 Token</div>';
      return;
    }
    setGithubToken(token);
  }

  adminAuthed = true;
  document.getElementById('authBox').style.display   = 'none';
  document.getElementById('adminPanel').classList.add('open');
}

function doLogout() {
  adminAuthed = false;
  editingId   = null;
  document.getElementById('adminPanel').classList.remove('open');
  document.getElementById('authBox').style.display = 'block';
  document.getElementById('authInput').value       = '';
  hideAddForm();
  document.getElementById('pendingBox').style.display = 'none';
}

/* ==================== ADMIN — 表单开关 ==================== */

function toggleAddForm() {
  const f = document.getElementById('addForm');
  const showing = f.style.display !== 'none';
  if (showing) {
    hideAddForm();
  } else {
    editingId = null;
    resetForm();
    document.getElementById('formTitle').textContent = '新增账单条目';
    document.getElementById('submitBtn').textContent = '提交（待确认状态）';
    f.style.display = 'block';
    f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function hideAddForm() {
  document.getElementById('addForm').style.display = 'none';
  document.getElementById('formAlert').innerHTML   = '';
  editingId = null;
}

function resetForm() {
  document.getElementById('fDate').value     = new Date().toISOString().slice(0, 10);
  document.getElementById('fType').value     = 'expense';
  document.getElementById('fTitle').value    = '';
  document.getElementById('fAmount').value   = '';
  document.getElementById('fActivity').value = '';
  document.getElementById('fTags').value     = '';
  document.getElementById('fRole').value     = '';
  document.getElementById('fNote').value     = '';
}

/* ==================== ADMIN — 编辑现有账单 ==================== */

function openEditForm(id) {
  const tx = BILLS.find(t => t.id === id);
  if (!tx) return;

  editingId = id;

  document.getElementById('fDate').value     = tx.date     || '';
  document.getElementById('fType').value     = tx.type     || 'expense';
  document.getElementById('fTitle').value    = tx.title    || '';
  document.getElementById('fAmount').value   = tx.amount   || '';
  document.getElementById('fActivity').value = tx.linked_activity || '';
  document.getElementById('fTags').value     = (tx.tags || []).join(', ');
  document.getElementById('fRole').value     = tx.paid_by_role   || '';
  document.getElementById('fNote').value     = tx.note     || '';

  document.getElementById('formTitle').textContent  = '编辑账单条目';
  document.getElementById('submitBtn').textContent  = '保存修改';
  document.getElementById('formAlert').innerHTML    = '';

  const f = document.getElementById('addForm');
  f.style.display = 'block';
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ==================== ADMIN — 提交表单（新增 / 更新） ==================== */

async function submitEntry() {
  const alertEl   = document.getElementById('formAlert');
  const submitBtn = document.getElementById('submitBtn');

  const title    = document.getElementById('fTitle').value.trim();
  const date     = document.getElementById('fDate').value;
  const type     = document.getElementById('fType').value;
  const amountRaw = parseFloat(document.getElementById('fAmount').value);
  const tags     = document.getElementById('fTags').value
                    .split(',').map(t => t.trim()).filter(Boolean);
  const note     = document.getElementById('fNote').value.trim();
  const activity = document.getElementById('fActivity').value.trim();
  const role     = document.getElementById('fRole').value.trim();

  if (!title)  { alertEl.innerHTML = '<div class="alert alert-error">请填写摘要标题</div>'; return; }
  if (!date)   { alertEl.innerHTML = '<div class="alert alert-error">请选择日期</div>'; return; }
  if (isNaN(amountRaw) || amountRaw < 0) {
    alertEl.innerHTML = '<div class="alert alert-error">请输入有效金额（≥ 0）</div>';
    return;
  }

  submitBtn.disabled = true;

  if (editingId) {
    /* — 更新模式 — */
    const idx = BILLS.findIndex(t => t.id === editingId);
    if (idx !== -1) {
      BILLS[idx] = {
        ...BILLS[idx],
        title, date, type, amount: amountRaw, tags, note,
        linked_activity: activity || undefined,
        paid_by_role:    role     || undefined,
        /* 更新后重置确认状态，需管理员重新核实 */
        confirmed:    false,
        confirmed_by: '',
      };
    }
  } else {
    /* — 新增模式 — */
    BILLS.push({
      id:   generateId(BILLS),
      type, title, date,
      amount: amountRaw,
      tags,  note,
      linked_activity: activity || undefined,
      paid_by_role:    role     || undefined,
      confirmed:    false,
      confirmed_by: '',
    });
  }

  try {
    await saveBills(BILLS);
    renderLedger();
    renderStats();
    generateFloatCards();

    const msg = editingId ? '✓ 已保存修改，状态已重置为「待确认」' : '✓ 已添加，状态为「待确认」';
    alertEl.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    setTimeout(() => { hideAddForm(); }, 1400);
  } catch (err) {
    alertEl.innerHTML = `<div class="alert alert-error">保存失败：${err.message}</div>`;
  } finally {
    submitBtn.disabled = false;
  }
}

/* ==================== ADMIN — 待确认列表 ==================== */

function togglePending() {
  const box = document.getElementById('pendingBox');
  const showing = box.style.display !== 'none';
  box.style.display = showing ? 'none' : 'block';
  if (!showing) renderPending();
}

function renderPending() {
  const pending = BILLS.filter(tx => !tx.confirmed);
  const list    = document.getElementById('pendingList');

  if (!pending.length) {
    list.innerHTML =
      '<div style="color:var(--text-3);font-size:0.85rem;padding:0.5rem 0">暂无待确认条目 ✓</div>';
    return;
  }

  list.innerHTML = pending.map(tx => `
    <div class="pending-item" id="pi-${tx.id}">
      <div class="pending-info">
        <div class="pending-title">${tx.title}</div>
        <div class="pending-meta">
          ${tx.date} · ${TYPE_META[tx.type]?.label || tx.type} · ¥${tx.amount.toFixed(2)}
        </div>
      </div>
      <div class="pending-btns">
        <button class="btn-edit"    onclick="openEditForm('${tx.id}')">编辑</button>
        <button class="btn-confirm" onclick="confirmEntry('${tx.id}')">✓ 核实</button>
        <button class="btn-danger"  onclick="deleteEntry('${tx.id}')">删除</button>
      </div>
    </div>
  `).join('');
}

/* ==================== ADMIN — 全部账单管理列表 ==================== */

function toggleAllBills() {
  const box = document.getElementById('allBillsBox');
  const showing = box.style.display !== 'none';
  box.style.display = showing ? 'none' : 'block';
  if (!showing) renderAllBillsAdmin();
}

function renderAllBillsAdmin() {
  const list = document.getElementById('allBillsList');
  const sorted = [...BILLS].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    list.innerHTML = '<div style="color:var(--text-3);font-size:0.85rem">暂无账单</div>';
    return;
  }

  list.innerHTML = sorted.map(tx => `
    <div class="pending-item">
      <div class="pending-info">
        <div class="pending-title" style="display:flex;align-items:center;gap:0.5rem">
          ${tx.title}
          <span class="confirmed-dot ${tx.confirmed ? 'dot-yes' : 'dot-no'}"
            title="${tx.confirmed ? '已核实' : '待确认'}"></span>
        </div>
        <div class="pending-meta">
          ${tx.date} · ${TYPE_META[tx.type]?.label || tx.type} · ¥${tx.amount.toFixed(2)}
          ${tx.tags && tx.tags.length ? ' · ' + tx.tags.join(', ') : ''}
        </div>
      </div>
      <div class="pending-btns">
        <button class="btn-edit"   onclick="openEditForm('${tx.id}')">编辑</button>
        ${!tx.confirmed
          ? `<button class="btn-confirm" onclick="confirmEntry('${tx.id}')">✓ 核实</button>`
          : ''}
        <button class="btn-danger" onclick="deleteEntry('${tx.id}')">删除</button>
      </div>
    </div>
  `).join('');
}

/* ==================== ADMIN — 核实 / 删除 ==================== */

async function confirmEntry(id) {
  const tx = BILLS.find(t => t.id === id);
  if (!tx) return;
  tx.confirmed    = true;
  tx.confirmed_by = '班委核实';
  await saveBills(BILLS);
  renderLedger();
  renderPending();
  if (document.getElementById('allBillsBox').style.display !== 'none') renderAllBillsAdmin();
}

async function deleteEntry(id) {
  if (!confirm('确认删除此条账单？此操作无法撤销。')) return;
  BILLS = BILLS.filter(t => t.id !== id);
  await saveBills(BILLS);
  renderLedger();
  renderStats();
  generateFloatCards();
  renderPending();
  if (document.getElementById('allBillsBox').style.display !== 'none') renderAllBillsAdmin();
}

/* ==================== 初始化 ==================== */

async function init() {
  initTheme();

  const isGithub = typeof MODE !== 'undefined' && MODE === 'github';

  // 标注当前数据模式
  document.getElementById('modeBadge').textContent = isGithub ? 'GitHub 模式' : 'Local 模式';

  // GitHub 模式下显示 Token 输入框
  if (isGithub) {
    document.getElementById('tokenGroup').style.display = 'block';
  }

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

  // 隐藏 loading
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 500);
}

document.addEventListener('DOMContentLoaded', init);
