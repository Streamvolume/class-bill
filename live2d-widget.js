/**
 * live2d-widget.js — 班费平台 Live2D 挂件
 *
 * 移动端适配：
 *   - 自动检测小屏，缩小画布至 140×190，不遮挡内容
 *   - 画布设置 touch-action: pan-y，允许页面正常上下滑动
 *   - 双击（桌面）/ 双击快速连点（移动）均可折叠隐藏
 *   - 气泡尺寸与位置随屏幕自适应
 */

(function () {
  /* ==================== 响应式判断 ==================== */

  // 以 640px 为分界，或检测到触屏设备且屏宽较窄
  const isMobile = window.matchMedia('(max-width: 640px)').matches
                || (window.innerWidth < 768 && 'ontouchstart' in window);

  /* ==================== 配置 ==================== */

  const CONFIG = {
    modelUrl:        'https://raw.githubusercontent.com/Streamvolume/sg/main/sg1.model3.json',

    // 桌面 / 移动端分别设置画布尺寸
    canvasWidth:     isMobile ? 140 : 280,
    canvasHeight:    isMobile ? 190 : 380,

    offsetRight:     isMobile ? 0 : 10,
    offsetBottom:    0,
    scaleFactor:     0.95,
    idleMotionGroup: 'Idle',
    focusSensitivity: 0.75,

    // 气泡侵入画布的像素数（移动端按比例缩小）
    bubbleInset:     isMobile ? 55 : 110,

    scripts: {
      cubismCore: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
      pixiJs:     'https://cdn.jsdelivr.net/npm/pixi.js@6.5.2/dist/browser/pixi.min.js',
      live2d:     'https://cdn.jsdelivr.net/npm/pixi-live2d-display/dist/cubism4.min.js',
    },
  };

  /* ==================== 对话内容 ==================== */

  const WELCOME_MSG = '你好！这里是班费公示平台，账单明细都在这里，欢迎查看～';

  const RANDOM_MSGS = [
    '钱花在刀刃上，每一笔都有记录。',
    '有什么疑问随时找生活委员哦！',
    '班费公开透明，大家放心～',
    '今天也是充实的一天，加油！',
    '账单实时更新，信息不滞后。',
    '如果余额充足，下次活动就可以安排了！',
    '每一笔出账都经过班委核实确认。',
    '有想法要组织活动？去找班委提议吧！',
    '好好学习，天天向上，顺便关注一下班费余额～',
    '数据托管在 GitHub，永久留存不丢失。',
  ];

  /* ==================== 工具 ==================== */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload  = resolve;
      s.onerror = () => reject(new Error(`Live2D: 脚本加载失败 ${src}`));
      document.head.appendChild(s);
    });
  }

  function log(msg) { console.log(`[Live2D Widget] ${msg}`); }

  /* ==================== 气泡系统 ==================== */

  let bubble      = null;
  let bubbleTimer = null;
  let typeTimer   = null;

  function createBubble() {
    const bubbleMaxWidth = isMobile ? 140 : 200;
    const style = document.createElement('style');
    style.textContent = `
      #live2d-bubble {
        position: fixed;
        z-index: 149;
        max-width: ${bubbleMaxWidth}px;
        min-width: 80px;
        background: rgba(18, 24, 38, 0.92);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        padding: ${isMobile ? '7px 10px' : '10px 13px'};
        font-size: ${isMobile ? '11px' : '12.5px'};
        line-height: 1.65;
        color: rgba(240,244,255,0.88);
        font-family: 'DM Sans', system-ui, sans-serif;
        letter-spacing: 0.02em;
        backdrop-filter: blur(12px);
        box-shadow: 0 4px 24px rgba(0,0,0,0.35);
        pointer-events: none;
        opacity: 0;
        transform: translateY(6px) scale(0.96);
        transition: opacity 0.28s ease, transform 0.28s ease;
        word-break: break-word;
      }
      #live2d-bubble.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      #live2d-bubble::after {
        content: '';
        position: absolute;
        right: -7px;
        bottom: 18px;
        width: 0; height: 0;
        border-top:    6px solid transparent;
        border-bottom: 6px solid transparent;
        border-left:   7px solid rgba(18,24,38,0.92);
      }
      #live2d-bubble::before {
        content: '';
        position: absolute;
        right: -8px;
        bottom: 17px;
        width: 0; height: 0;
        border-top:    7px solid transparent;
        border-bottom: 7px solid transparent;
        border-left:   8px solid rgba(255,255,255,0.12);
      }
      #live2d-bubble .cursor {
        display: inline-block;
        width: 1.5px;
        height: 1em;
        background: rgba(240,244,255,0.5);
        margin-left: 1px;
        vertical-align: text-bottom;
        animation: blink 0.9s step-end infinite;
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    bubble = document.createElement('div');
    bubble.id = 'live2d-bubble';
    document.body.appendChild(bubble);
  }

  function positionBubble() {
    bubble.style.right  = `${CONFIG.offsetRight + CONFIG.canvasWidth - CONFIG.bubbleInset}px`;
    bubble.style.bottom = `${Math.round(CONFIG.canvasHeight * 0.35)}px`;
  }

  function showBubble(text, autoDismiss = 5000) {
    if (!bubble) return;
    clearTimeout(bubbleTimer);
    clearTimeout(typeTimer);

    bubble.innerHTML = '';
    bubble.classList.remove('visible');

    const cursor = document.createElement('span');
    cursor.className = 'cursor';

    let i = 0;
    function typeNext() {
      if (i < text.length) {
        bubble.insertBefore(document.createTextNode(text[i]), cursor);
        i++;
        const ch = text[i - 1];
        const delay = /[，。！？、…]/.test(ch) ? 160 : /[\u4e00-\u9fa5]/.test(ch) ? 60 : 40;
        typeTimer = setTimeout(typeNext, delay);
      } else {
        setTimeout(() => { cursor.style.display = 'none'; }, 1500);
      }
    }

    bubble.appendChild(cursor);
    positionBubble();

    requestAnimationFrame(() => {
      bubble.classList.add('visible');
      setTimeout(typeNext, 120);
    });

    if (autoDismiss > 0) {
      bubbleTimer = setTimeout(hideBubble, autoDismiss + text.length * 60);
    }
  }

  function hideBubble() {
    if (!bubble) return;
    bubble.classList.remove('visible');
  }

  let lastMsgIdx = -1;
  function showRandomMsg() {
    let idx;
    do { idx = Math.floor(Math.random() * RANDOM_MSGS.length); }
    while (RANDOM_MSGS.length > 1 && idx === lastMsgIdx);
    lastMsgIdx = idx;
    showBubble(RANDOM_MSGS[idx], 5000);
  }

  /* ==================== DOM 容器 ==================== */

  function createContainer() {
    const wrap = document.createElement('div');
    wrap.id = 'live2d-wrap';
    wrap.style.cssText = `
      position: fixed;
      right:   ${CONFIG.offsetRight}px;
      bottom:  ${CONFIG.offsetBottom}px;
      width:   ${CONFIG.canvasWidth}px;
      height:  ${CONFIG.canvasHeight}px;
      z-index: 150;
      transition: opacity 0.4s ease, transform 0.4s ease;
      cursor: pointer;
      user-select: none;
    `;

    // 提示文字（桌面hover / 移动端始终微弱显示）
    const hint = document.createElement('div');
    hint.textContent = isMobile ? '双击隐藏' : '双击隐藏';
    hint.style.cssText = `
      position: absolute;
      top: 6px; left: 50%;
      transform: translateX(-50%);
      font-size: 9px;
      color: rgba(255,255,255,0.18);
      font-family: sans-serif;
      letter-spacing: 0.05em;
      pointer-events: none;
      opacity: ${isMobile ? 0.6 : 0};
      transition: opacity 0.3s;
      white-space: nowrap;
    `;
    wrap.appendChild(hint);

    if (!isMobile) {
      wrap.addEventListener('mouseenter', () => hint.style.opacity = '1');
      wrap.addEventListener('mouseleave', () => hint.style.opacity = '0');
    }

    /* ── 折叠逻辑 ── */
    let collapsed = false;

    function toggleCollapse() {
      collapsed = !collapsed;
      wrap.style.transform = collapsed
        ? `translateY(${CONFIG.canvasHeight - 20}px)` : 'translateY(0)';
      wrap.style.opacity = collapsed ? '0.2' : '1';
      if (collapsed) hideBubble();
    }

    // 桌面：原生 dblclick
    wrap.addEventListener('dblclick', toggleCollapse);

    // 移动端：300ms 内两次 touchend = 双击
    if (isMobile) {
      let lastTap = 0;
      wrap.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTap < 300) {
          e.preventDefault();
          toggleCollapse();
        }
        lastTap = now;
      }, { passive: false });
    }

    document.body.appendChild(wrap);
    return wrap;
  }

  /* ==================== 主逻辑 ==================== */

  async function init() {
    log(`初始化（${isMobile ? '移动端' : '桌面端'}，画布 ${CONFIG.canvasWidth}×${CONFIG.canvasHeight}）`);

    try {
      await loadScript(CONFIG.scripts.cubismCore);
      await loadScript(CONFIG.scripts.pixiJs);
      await loadScript(CONFIG.scripts.live2d);
    } catch (err) {
      console.warn(err.message);
      return;
    }

    const { Live2DModel } = PIXI.live2d;

    const wrap = createContainer();
    createBubble();

    const app = new PIXI.Application({
      width:           CONFIG.canvasWidth,
      height:          CONFIG.canvasHeight,
      backgroundAlpha: 0,
      antialias:       true,
      resolution:      window.devicePixelRatio || 1,
      autoDensity:     true,
    });
    wrap.appendChild(app.view);

    // 关键：允许触摸事件中的垂直滚动穿透画布
    // pan-y = 浏览器处理垂直滑动，canvas 只处理点击
    app.view.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';

    log(`加载模型：${CONFIG.modelUrl}`);
    let model;
    try {
      model = await Live2DModel.from(CONFIG.modelUrl, {
        autoInteract: false,
        ticker: PIXI.Ticker.shared,
      });
    } catch (err) {
      console.warn('[Live2D Widget] 模型加载失败：', err.message);
      wrap.remove();
      return;
    }

    app.stage.addChild(model);
    log('模型加载成功');

    // 缩放定位
    const scale = Math.min(
      CONFIG.canvasWidth  / model.internalModel.originalWidth,
      CONFIG.canvasHeight / model.internalModel.originalHeight
    ) * CONFIG.scaleFactor;
    model.scale.set(scale);
    model.x = (CONFIG.canvasWidth  - model.width)  / 2;
    model.y =  CONFIG.canvasHeight - model.height;

    // 待机动画循环
    function playIdleLoop() {
      try {
        const motions = model.internalModel.motionManager.definitions;
        const groups  = Object.keys(motions);
        log(`可用动画组：${groups.join(', ')}`);
        const group = groups.includes(CONFIG.idleMotionGroup) ? CONFIG.idleMotionGroup : groups[0];
        if (!group) return;
        const count = motions[group].length;
        let lastIdx = -1;
        function playNext() {
          let idx;
          do { idx = Math.floor(Math.random() * count); }
          while (count > 1 && idx === lastIdx);
          lastIdx = idx;
          model.motion(group, idx, PIXI.live2d.MotionPriority.NORMAL);
        }
        model.internalModel.motionManager.on('motionFinish', playNext);
        playNext();
      } catch (err) {
        log(`待机动画启动失败：${err.message}`);
      }
    }

    if (model.internalModel.motionManager.definitions) {
      playIdleLoop();
    } else {
      model.once('ready', playIdleLoop);
    }

    // 视线跟随（mousemove 桌面 / touchmove 移动）
    document.addEventListener('mousemove', (e) => {
      const fc = model.internalModel.focusController;
      if (!fc) return;
      fc.targetX =  ((e.clientX / window.innerWidth)  * 2 - 1) * CONFIG.focusSensitivity;
      fc.targetY = -((e.clientY / window.innerHeight)  * 2 - 1) * CONFIG.focusSensitivity;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      const fc = model.internalModel.focusController;
      if (!fc) return;
      fc.targetX =  ((t.clientX / window.innerWidth)  * 2 - 1) * CONFIG.focusSensitivity;
      fc.targetY = -((t.clientY / window.innerHeight)  * 2 - 1) * CONFIG.focusSensitivity;
    }, { passive: true });

    // 点击/单击：随机动作 + 随机气泡
    // 移动端用 touchend 区分单击（非双击判定窗口）
    let tapTimer = null;

    function handleTap(e) {
      e.stopPropagation();

      // 随机动作（非 Idle 组）
      try {
        const motions = model.internalModel.motionManager.definitions;
        const groups  = Object.keys(motions).filter(g =>
          g !== CONFIG.idleMotionGroup && motions[g].length > 0
        );
        if (groups.length > 0) {
          const g   = groups[Math.floor(Math.random() * groups.length)];
          const idx = Math.floor(Math.random() * motions[g].length);
          model.motion(g, idx, PIXI.live2d.MotionPriority.FORCE);
        }
      } catch (_) {}

      showRandomMsg();
    }

    if (isMobile) {
      // 移动端：touchend 延迟 320ms 触发，避免和双击冲突
      let touchStartTime = 0;
      app.view.addEventListener('touchstart', () => {
        touchStartTime = Date.now();
      }, { passive: true });

      app.view.addEventListener('touchend', (e) => {
        // 长按不触发（> 500ms）
        if (Date.now() - touchStartTime > 500) return;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => handleTap(e), 320);
      }, { passive: true });
    } else {
      app.view.addEventListener('pointerdown', handleTap);
    }

    // 欢迎词
    setTimeout(() => showBubble(WELCOME_MSG, 6000), 800);

    log('初始化完成 ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    requestAnimationFrame(init);
  }

})();
