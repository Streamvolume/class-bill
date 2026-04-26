/**
 * data.js — 班费平台数据层
 *
 * 双模式设计：
 *   MODE = 'local'   → 数据存储于 localStorage（当前使用）
 *   MODE = 'github'  → 数据读写 GitHub 仓库中的 bills.json（接入后切换）
 *
 * 接入 GitHub 步骤：
 *   1. 将 MODE 改为 'github'
 *   2. 填写 GITHUB_CONFIG 中的 owner / repo / token
 *   3. 在仓库根目录创建 bills.json，初始内容为空数组 []
 *   4. 完成，所有 save/load 操作自动走 GitHub API
 */

/* ==================== 配置区 ==================== */

const MODE = 'github'; // 切换为 'github' 启用 GitHub 模式

const GITHUB_CONFIG = {
  owner: 'Streamvolume',   // ← GitHub 用户名
  repo:  'class-bill',          // ← 仓库名
  path:  'bills.json',             // ← 数据文件路径
  token: '',                       // ← 班委各自填入自己的 Personal Access Token
  branch: 'main',
};

/* ==================== 元信息 ==================== */

const META = {
  class_name:    '药学2023级231班',
  academic_year: '2023-2027',
  enroll_date:   '2023-09-01',
  headcount:     42,
  currency:      'CNY',
};

/* ==================== 默认示例数据 ==================== */

const DEFAULT_BILLS = [
  {
    id: 'T20230901-000',
    type: 'balance_init',
    title: '账本期初余额（迁移建立）',
    date: '2023-09-01',
    amount: 0,
    tags: ['建账'],
    note: '账本重建，历史结余由聊天记录推算',
    confirmed: true,
    confirmed_by: '生活委员',
  },
  {
    id: 'T20230910-001',
    type: 'income_collective',
    title: '2023秋季学期班费收取',
    date: '2023-09-10',
    amount_per_person: 100,
    headcount: 45,
    amount: 4500,
    tags: ['学期缴费', '主要入账'],
    note: '开学第一次统一收取，覆盖全学年基础开支',
    confirmed: true,
    confirmed_by: '班长',
  },
  {
    id: 'T20231220-001',
    type: 'income_activity',
    title: '元旦晚会自愿筹款',
    date: '2023-12-20',
    amount: 380,
    linked_activity: '2024元旦晚会',
    tags: ['活动', '筹款'],
    note: '班级成员自愿',
    confirmed: true,
    confirmed_by: '生活委员',
  },
  {
    id: 'T20231228-001',
    type: 'expense',
    title: '元旦晚会道具及布置采购',
    date: '2023-12-28',
    amount: 620,
    linked_activity: '2024元旦晚会',
    paid_by_role: '生活委员',
    receipt: true,
    tags: ['活动', '采购'],
    note: '超市采购，已留票据',
    confirmed: true,
    confirmed_by: '班长',
  },
  {
    id: 'T20231229-001',
    type: 'refund',
    title: '元旦晚会采购找零归还',
    date: '2023-12-29',
    amount: 55,
    linked_expense: 'T20231228-001',
    tags: ['冲账'],
    note: '采购多付，找零归还',
    confirmed: true,
    confirmed_by: '生活委员',
  },
  {
    id: 'T20240102-001',
    type: 'income_surplus',
    title: '2024元旦晚会活动结余归还',
    date: '2024-01-02',
    amount: 115,
    linked_activity: '2024元旦晚会',
    tags: ['活动', '结余'],
    note: '活动结束后余款转回主账户',
    confirmed: true,
    confirmed_by: '班长',
  },
  {
    id: 'T20240520-001',
    type: 'expense',
    title: '教师节慰问礼品采购',
    date: '2024-05-20',
    amount: 800,
    linked_activity: '教师节慰问',
    paid_by_role: '生活委员',
    receipt: false,
    tags: ['活动', '礼品'],
    note: '票据补录中',
    confirmed: false,
    confirmed_by: '',
  },
];

/* ==================== 本地模式 ==================== */

const LOCAL_KEY = 'banfei_v2_bills';

function localLoad() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_BILLS));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_BILLS));
  }
}

function localSave(bills) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(bills));
}

/* ==================== AES-GCM 加解密 ==================== */
/*
 * 安全模型：
 *   - GitHub Token 经 AES-GCM + PBKDF2 加密后存入仓库 config.json（公开但无意义）
 *   - 班委输入动账密码 → 浏览器解密 → Token 注入内存 → 会话结束即消失
 *   - Token 永不以明文形式出现在代码、仓库或网络请求 URL 中
 */

async function _deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * decryptToken(encryptedB64, password) → Promise<string>
 * 解密失败（密码错误）时抛出 DOMException，由调用方捕获转为用户提示
 */
async function decryptToken(encryptedB64, password) {
  const packed = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));
  const salt   = packed.slice(0, 16);
  const iv     = packed.slice(16, 28);
  const ct     = packed.slice(28);
  const key    = await _deriveKey(password, salt);
  const plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plain);
}

/* ==================== GitHub 模式 ==================== */

let _githubSha    = null;  // 当前 bills.json SHA，写回时必须提供
let _runtimeToken = '';    // 解密后的 Token，仅存内存，页面关闭即清除
let _encryptedToken = '';  // 从 config.json 读取的加密串，缓存避免重复请求

/** 从仓库获取 config.json 并缓存加密串 */
async function _loadEncryptedToken() {
  if (_encryptedToken) return _encryptedToken;
  const { owner, repo, branch } = GITHUB_CONFIG;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/config.json?ref=${branch}&t=${Date.now()}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error(`config.json 读取失败：${res.status}，请确认文件已上传至仓库根目录`);
  const json = await res.json();
  const config = JSON.parse(atob(json.content.replace(/\n/g, '')));
  if (!config.encrypted_token) throw new Error('config.json 格式错误，缺少 encrypted_token 字段');
  _encryptedToken = config.encrypted_token;
  return _encryptedToken;
}

/**
 * unlockWithPassphrase(passphrase) → Promise<void>
 * 用动账密码解密 Token，成功后注入 _runtimeToken
 * 失败时抛出 Error（密码错误或网络问题）
 */
async function unlockWithPassphrase(passphrase) {
  const enc = await _loadEncryptedToken();
  try {
    _runtimeToken = await decryptToken(enc, passphrase);
  } catch {
    throw new Error('动账密码错误，解密失败');
  }
}

/**
 * 读取：公开仓库无需 token，不发 Authorization 头
 */
async function githubLoad() {
  const { owner, repo, path, branch } = GITHUB_CONFIG;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}&t=${Date.now()}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error(`账单读取失败：${res.status} ${res.statusText}`);
  const json = await res.json();
  _githubSha = json.sha;
  return JSON.parse(atob(json.content.replace(/\n/g, '')));
}

/**
 * 写入：使用内存中的 Token
 */
async function githubSave(bills) {
  if (!_runtimeToken) throw new Error('会话已过期，请重新登录后台');
  const { owner, repo, path, branch } = GITHUB_CONFIG;
  const url     = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(bills, null, 2))));
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${_runtimeToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `班费更新 ${new Date().toISOString().slice(0, 10)}`,
      content, branch,
      sha: _githubSha,
    }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(`写入失败：${res.status} ${errJson.message || res.statusText}`);
  }
  _githubSha = (await res.json()).content.sha;
}

/* ==================== 统一公开接口 ==================== */

/**
 * loadBills() → Promise<Array>
 * 读取账单列表
 */
async function loadBills() {
  if (MODE === 'github') return await githubLoad();
  return localLoad();
}

/**
 * saveBills(bills) → Promise<void>
 * 保存完整账单列表
 */
async function saveBills(bills) {
  if (MODE === 'github') return await githubSave(bills);
  localSave(bills);
}

/**
 * generateId(bills) → String
 * 生成唯一账单 ID
 */
function generateId(bills) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(bills.length + 1).padStart(3, '0');
  return `T${dateStr}-${seq}`;
}
