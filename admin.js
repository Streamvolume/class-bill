/**
 * admin.js — 班费管理后台逻辑
 * 依赖：themes.js  data.js
 * 页面：admin.html
 *
 * 认证：从 sessionStorage 读取动账密码，重新解密 Token
 *       无凭证或解密失败 → 跳回 admin-login.html
 */

/* ==================== 类型元数据（与 app.js 保持一致）==================== */

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
const ADMIN_PASSWORD = 'banwei2023'; // 本地模式后备

/* ==================== 全局状态 ==================== */

let BILLS      = [];
let editingId  = null;
let adminFilter = 'all';

/* ==================== UI 原子 ==================== */

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

/* ==================== 统计 ==================== */

function calcBalance(bills) {
  return bills.reduce((acc, tx) => {
    if (INCOME_TYPES.includes(tx.type))  return acc + tx.amount;
    if (EXPENSE_TYPES.includes(tx.type)) return acc - tx.amount;
    return acc;
  }, 0);
}

function renderAdminStats() {
  const balance   = calcBalance(BILLS);
  const count     = BILLS.filter(t => t.type === 'expense').length;
  const perPerson = META.headcount > 0 ? balance / META.headcount : 0;
  const pending   = BILLS.filter(t => !t.confirmed).length;

  document.getElementById('aStatBalance').textContent = balance.toFixed(2);
  document.getElementById('aStatPer').textContent     = perPerson.toFixed(2);
  document.getElementById('aStatCount').textContent   = count;
  document.getElementById('aStatPending').textContent = pending;

  const badge = document.getElementById('pendingBadge');
  badge.textContent = pending > 0 ? `(${pending})` : '';
}

/* ==================== 账单列表（全部） ==================== */

function filterBills(filter) {
  return BILLS.filter(tx => {
    if (filter === 'all')    return true;
    if (filter === 'income') return INCOME_TYPES.includes(tx.type);
    if (filter === 'expense') return tx.type === 'expense';
    return true;
  });
}

function renderAdminLedger() {
  const rows = [...filterBills(adminFilter)].sort((a, b) => b.date.localeCompare(a.date));

  /* Desktop table */
  const tbody = document.getElementById('adminLedgerBody');
  tbody.innerHTML = rows.length ? rows.map(tx => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:0.78rem;color:var(--text-3)">${tx.date}</td>
      <td>${typeBadge(tx.type)}</td>
      <td>
        <div style="color:var(--text-1);font-weight:500">${tx.title}</div>
        ${tx.linked_activity ? `<div style="font-size:0.72rem;color:var(--text-3);margin-top:2px">↳ ${tx.linked_activity}</div>` : ''}
        ${tx.note ? `<div style="font-size:0.72rem;color:var(--text-3);margin-top:1px">${tx.note}</div>` : ''}
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
      <td>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap">
          <button class="btn-edit" onclick="openEditForm('${tx.id}')">编辑</button>
          ${!tx.confirmed ? `<button class="btn-confirm" onclick="confirmEntry('${tx.id}')">✓</button>` : ''}
          <button class="btn-danger" onclick="deleteEntry('${tx.id}')">删</button>
        </div>
      </td>
    </tr>
  `).join('') : `<tr><td colspan="7"><div class="empty-hint">暂无符合条件的账单</div></td></tr>`;

  /* Mobile cards */
  const cards = document.getElementById('adminLedgerCards');
  cards.innerHTML = rows.length ? rows.map(tx => `
    <div class="ledger-card">
      <div class="lc-top">
        <div class="lc-title">${tx.title}</div>
        <div>${amountCell(tx)}</div>
      </div>
      <div class="lc-meta">
        ${typeBadge(tx.type)}
        <span class="lc-date">${tx.date}</span>
        ${tagsPills(tx.tags)}
        <span class="confirmed-dot ${tx.confirmed ? 'dot-yes' : 'dot-no'}"></span>
      </div>
      ${tx.note ? `<div style="font-size:0.75rem;color:var(--text-3);margin-top:0.4rem">${tx.note}</div>` : ''}
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem;flex-wrap:wrap">
        <button class="btn-edit" onclick="openEditForm('${tx.id}')">编辑</button>
        ${!tx.confirmed ? `<button class="btn-confirm" onclick="confirmEntry('${tx.id}')">✓ 核实</button>` : ''}
        <button class="btn-danger" onclick="deleteEntry('${tx.id}')">删除</button>
      </div>
    </div>
  `).join('') : `<div class="empty-hint">暂无符合条件的账单</div>`;
}

/* ==================== 待确认列表 ==================== */

function renderPending() {
  const pending = BILLS.filter(tx => !tx.confirmed);
  const list    = document.getElementById('pendingList');

  if (!pending.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:3rem;color:var(--text-3)">
        <div style="font-size:2rem;margin-bottom:0.5rem">✓</div>
        <div style="font-size:0.85rem">所有账单均已核实</div>
      </div>`;
    return;
  }

  list.innerHTML = pending.map(tx => `
    <div class="pending-item">
      <div class="pending-info">
        <div class="pending-title">${tx.title}</div>
        <div class="pending-meta">
          ${tx.date} · ${TYPE_META[tx.type]?.label || tx.type} · ¥${tx.amount.toFixed(2)}
          ${tx.tags?.length ? ' · ' + tx.tags.join(', ') : ''}
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

/* ==================== Tab 切换 ==================== */

function switchTab(btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const tab = btn.dataset.atab;
  document.getElementById('tabAll').style.display     = tab === 'all'     ? 'block' : 'none';
  document.getElementById('tabPending').style.display = tab === 'pending' ? 'block' : 'none';
  if (tab === 'pending') renderPending();
}

/* ==================== 筛选 Tab ==================== */

document.getElementById('adminFilterTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('#adminFilterTabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  adminFilter = btn.dataset.filter;
  renderAdminLedger();
});

/* ==================== 表单 ==================== */

function toggleAddForm() {
  const f = document.getElementById('addForm');
  if (f.style.display !== 'none') { hideAddForm(); return; }
  editingId = null;
  resetForm();
  document.getElementById('formTitle').textContent  = '新增账单条目';
  document.getElementById('submitBtn').textContent  = '提交（待确认状态）';
  f.style.display = 'block';
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAddForm() {
  document.getElementById('addForm').style.display = 'none';
  document.getElementById('formAlert').innerHTML   = '';
  editingId = null;
}

function resetForm() {
  document.getElementById('fDate').value     = new Date().toISOString().slice(0, 10);
  document.getElementById('fType').value     = 'expense';
  ['fTitle','fAmount','fActivity','fTags','fRole','fNote'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

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
  document.getElementById('formTitle').textContent = '编辑账单条目';
  document.getElementById('submitBtn').textContent = '保存修改';
  document.getElementById('formAlert').innerHTML   = '';
  const f = document.getElementById('addForm');
  f.style.display = 'block';
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function submitEntry() {
  const alertEl   = document.getElementById('formAlert');
  const submitBtn = document.getElementById('submitBtn');

  const title     = document.getElementById('fTitle').value.trim();
  const date      = document.getElementById('fDate').value;
  const type      = document.getElementById('fType').value;
  const amountRaw = parseFloat(document.getElementById('fAmount').value);
  const tags      = document.getElementById('fTags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const note      = document.getElementById('fNote').value.trim();
  const activity  = document.getElementById('fActivity').value.trim();
  const role      = document.getElementById('fRole').value.trim();

  if (!title)  { alertEl.innerHTML = '<div class="alert alert-error">请填写摘要标题</div>'; return; }
  if (!date)   { alertEl.innerHTML = '<div class="alert alert-error">请选择日期</div>'; return; }
  if (isNaN(amountRaw) || amountRaw < 0) {
    alertEl.innerHTML = '<div class="alert alert-error">请输入有效金额（≥ 0）</div>';
    return;
  }

  submitBtn.disabled = true;

  if (editingId) {
    const idx = BILLS.findIndex(t => t.id === editingId);
    if (idx !== -1) {
      BILLS[idx] = {
        ...BILLS[idx],
        title, date, type, amount: amountRaw, tags, note,
        linked_activity: activity || undefined,
        paid_by_role:    role     || undefined,
        confirmed: false,
        confirmed_by: '',
      };
    }
  } else {
    BILLS.push({
      id: generateId(BILLS),
      type, title, date, amount: amountRaw, tags, note,
      linked_activity: activity || undefined,
      paid_by_role:    role     || undefined,
      confirmed: false,
      confirmed_by: '',
    });
  }

  try {
    await saveBills(BILLS);
    renderAdminLedger();
    renderAdminStats();
    const msg = editingId ? '✓ 已保存，状态重置为「待确认」' : '✓ 已添加，状态为「待确认」';
    alertEl.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    setTimeout(() => hideAddForm(), 1400);
  } catch (err) {
    alertEl.innerHTML = `<div class="alert alert-error">保存失败：${err.message}</div>`;
  } finally {
    submitBtn.disabled = false;
  }
}

/* ==================== 核实 / 删除 ==================== */

async function confirmEntry(id) {
  const tx = BILLS.find(t => t.id === id);
  if (!tx) return;
  tx.confirmed    = true;
  tx.confirmed_by = '班委核实';
  await saveBills(BILLS);
  renderAdminLedger();
  renderAdminStats();
  renderPending();
}

async function deleteEntry(id) {
  if (!confirm('确认删除此条账单？此操作无法撤销。')) return;
  BILLS = BILLS.filter(t => t.id !== id);
  await saveBills(BILLS);
  renderAdminLedger();
  renderAdminStats();
  renderPending();
}

/* ==================== 退出登录 ==================== */

function doLogout() {
  sessionStorage.removeItem('banfei_session_pass');
  window.location.href = 'admin-login.html';
}

/* ==================== 初始化 ==================== */

async function init() {
  initTheme();

  const isGithub = typeof MODE !== 'undefined' && MODE === 'github';
  document.getElementById('modeBadge').textContent = isGithub ? 'GitHub 模式' : 'Local 模式';

  // 从 sessionStorage 取动账密码，重新解密 Token
  const savedPass = sessionStorage.getItem('banfei_session_pass');
  if (!savedPass) {
    window.location.href = 'admin-login.html';
    return;
  }

  try {
    if (isGithub) {
      await unlockWithPassphrase(savedPass);
    } else {
      if (savedPass !== ADMIN_PASSWORD) throw new Error('session invalid');
    }
  } catch {
    sessionStorage.removeItem('banfei_session_pass');
    window.location.href = 'admin-login.html';
    return;
  }

  // 加载账单数据
  try {
    BILLS = await loadBills();
  } catch (err) {
    console.error('数据加载失败', err);
    BILLS = [];
  }

  renderAdminStats();
  renderAdminLedger();

  // 隐藏 loading
  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 400);
}

document.addEventListener('DOMContentLoaded', init);
