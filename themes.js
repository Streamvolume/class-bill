/**
 * themes.js — 班费公示平台色彩主题系统
 * 新增主题：在 THEMES 数组末尾追加一个对象即可，key 必须覆盖所有 CSS 变量
 */

const THEMES = [
  {
    name: '深空青金',
    '--bg-base':      '#080d1a',
    '--bg-card':      'rgba(255,255,255,0.04)',
    '--bg-input':     'rgba(255,255,255,0.07)',
    '--accent':       '#00e5c3',
    '--accent-dim':   'rgba(0,229,195,0.12)',
    '--accent-2':     '#f5a020',
    '--text-1':       '#f0f4ff',
    '--text-2':       'rgba(240,244,255,0.55)',
    '--text-3':       'rgba(240,244,255,0.28)',
    '--border':       'rgba(255,255,255,0.08)',
    '--border-hover': 'rgba(255,255,255,0.18)',
    '--income':       '#34d399',
    '--expense':      '#fb923c',
    '--glass':        'rgba(255,255,255,0.025)',
  },
  {
    name: '午夜紫晶',
    '--bg-base':      '#0c0814',
    '--bg-card':      'rgba(180,130,255,0.05)',
    '--bg-input':     'rgba(180,130,255,0.08)',
    '--accent':       '#b47dff',
    '--accent-dim':   'rgba(180,125,255,0.12)',
    '--accent-2':     '#ff7eb3',
    '--text-1':       '#f5f0ff',
    '--text-2':       'rgba(245,240,255,0.55)',
    '--text-3':       'rgba(245,240,255,0.28)',
    '--border':       'rgba(180,130,255,0.10)',
    '--border-hover': 'rgba(180,130,255,0.25)',
    '--income':       '#68d7b0',
    '--expense':      '#ff7eb3',
    '--glass':        'rgba(180,130,255,0.03)',
  },
  {
    name: '黑曜琥珀',
    '--bg-base':      '#0e0a04',
    '--bg-card':      'rgba(255,180,50,0.04)',
    '--bg-input':     'rgba(255,180,50,0.07)',
    '--accent':       '#f5a020',
    '--accent-dim':   'rgba(245,160,32,0.12)',
    '--accent-2':     '#ff6b6b',
    '--text-1':       '#fff8ed',
    '--text-2':       'rgba(255,248,237,0.55)',
    '--text-3':       'rgba(255,248,237,0.28)',
    '--border':       'rgba(255,180,50,0.08)',
    '--border-hover': 'rgba(255,180,50,0.20)',
    '--income':       '#6ee7b7',
    '--expense':      '#ff6b6b',
    '--glass':        'rgba(255,180,50,0.025)',
  },
  {
    name: '暗林翡翠',
    '--bg-base':      '#060e0a',
    '--bg-card':      'rgba(80,255,150,0.04)',
    '--bg-input':     'rgba(80,255,150,0.07)',
    '--accent':       '#4ade80',
    '--accent-dim':   'rgba(74,222,128,0.12)',
    '--accent-2':     '#f9a8d4',
    '--text-1':       '#f0fff4',
    '--text-2':       'rgba(240,255,244,0.55)',
    '--text-3':       'rgba(240,255,244,0.28)',
    '--border':       'rgba(80,255,150,0.08)',
    '--border-hover': 'rgba(80,255,150,0.20)',
    '--income':       '#4ade80',
    '--expense':      '#f9a8d4',
    '--glass':        'rgba(80,255,150,0.025)',
  },
  {
    name: '墨海珊瑚',
    '--bg-base':      '#090c12',
    '--bg-card':      'rgba(255,130,120,0.04)',
    '--bg-input':     'rgba(255,130,120,0.07)',
    '--accent':       '#ff8c85',
    '--accent-dim':   'rgba(255,140,133,0.12)',
    '--accent-2':     '#7dd3fc',
    '--text-1':       '#fff5f5',
    '--text-2':       'rgba(255,245,245,0.55)',
    '--text-3':       'rgba(255,245,245,0.28)',
    '--border':       'rgba(255,130,120,0.08)',
    '--border-hover': 'rgba(255,130,120,0.20)',
    '--income':       '#6ee7b7',
    '--expense':      '#fcd34d',
    '--glass':        'rgba(255,130,120,0.025)',
  },
];

let _currentThemeIdx = Math.floor(Math.random() * THEMES.length);

function applyTheme(idx) {
  const t = THEMES[idx];
  const root = document.documentElement;
  Object.entries(t).forEach(([k, v]) => {
    if (k !== 'name') root.style.setProperty(k, v);
  });
  const btn = document.getElementById('themeSwitcher');
  if (btn) btn.textContent = t.name;
}

function nextTheme() {
  _currentThemeIdx = (_currentThemeIdx + 1) % THEMES.length;
  applyTheme(_currentThemeIdx);
}

function initTheme() {
  applyTheme(_currentThemeIdx);
}
