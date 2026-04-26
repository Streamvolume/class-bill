/**
 * live2d-widget.js — 班费平台 Live2D 挂件
 *
 * 功能：
 *   - 右下角固定展示自制 Live2D 模型
 *   - 自动播放 Idle 待机动画，循环随机切换
 *   - 鼠标/触摸位置实时视线跟随
 *   - 点击模型触发随机动作 + 随机对话气泡
 *   - 进入页面自动显示欢迎词气泡（打字机效果）
 *   - 可折叠隐藏（双击挂件区域）
 */

(function () {
  /* ==================== 配置 ==================== */

  const CONFIG = {
    modelUrl:        'https://raw.githubusercontent.com/Streamvolume/sg/main/sg1.model3.json',
    canvasWidth:     280,
    canvasHeight:    380,
    offsetRight:     10,
    offsetBottom:    0,
    scaleFactor:     0.95,
    idleMotionGroup: 'Idle',
    focusSensitivity: 0.95,

    // 气泡右边缘侵入画布的像素数
    // 增大 → 气泡向右移（更靠近模型实体）
    // 减小 → 气泡向左移（远离画布）
    // 建议范围：60–180，根据你模型两侧透明空白宽度调整
    bubbleInset: 90,
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

  let bubble      = null;   // 气泡 DOM 元素
  let bubbleTimer = null;   // 自动消失定时器
  let typeTimer   = null;   // 打字机定时器

  function createBubble() {
    // 注入气泡样式
    const style = document.createElement('style');
    style.textContent = `
      #live2d-bubble {
        position: fixed;
        z-index: 149;
        max-width: 200px;
        min-width: 100px;
        background: rgba(18, 24, 38, 0.92);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        padding: 10px 13px;
        font-size: 12.5px;
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
      /* 右侧小三角尾巴，指向模型 */
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
      /* 三角边框层 */
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
      /* 打字机光标 */
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
    return bubble;
  }

  /**
   * 定位气泡：出现在挂件左侧，垂直对齐模型下半部分
   * 因为模型外有大片透明空白，气泡尽量靠近视觉中心
   */
  function positionBubble() {
    // 气泡右边缘 = 屏幕右边 + offsetRight + canvasWidth - bubbleInset
    // bubbleInset 越大，气泡右边缘越靠近画布中心，越接近模型实体
    bubble.style.right  = `${CONFIG.offsetRight + CONFIG.canvasWidth - CONFIG.bubbleInset}px`;
    bubble.style.bottom = `${Math.round(CONFIG.canvasHeight * 0.35)}px`;
  }

  function showBubble(text, autoDismiss = 5000) {
    if (!bubble) return;

    // 清除旧定时器
    clearTimeout(bubbleTimer);
    clearTimeout(typeTimer);

    // 重置内容
    bubble.innerHTML = '';
    bubble.classList.remove('visible');

    // 打字机效果
    const cursor = document.createElement('span');
    cursor.className = 'cursor';

    let i = 0;
    function typeNext() {
      if (i < text.length) {
        // 在光标前插入字符
        bubble.insertBefore(document.createTextNode(text[i]), cursor);
        i++;
        // 中文字符稍慢，标点更慢
        const ch = text[i - 1];
        const delay = /[，。！？、…]/.test(ch) ? 160 : /[\u4e00-\u9fa5]/.test(ch) ? 60 : 40;
        typeTimer = setTimeout(typeNext, delay);
      } else {
        // 打字完成，光标再停留 1.5s 后隐藏
        setTimeout(() => { cursor.style.display = 'none'; }, 1500);
      }
    }

    bubble.appendChild(cursor);
    positionBubble();

    // 先让气泡出现，再开始打字
    requestAnimationFrame(() => {
      bubble.classList.add('visible');
      setTimeout(typeNext, 120);
    });

    // 自动消失
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

    const hint = document.createElement('div');
    hint.textContent = '双击隐藏';
    hint.style.cssText = `
      position: absolute;
      top: 8px; left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: rgba(255,255,255,0.22);
      font-family: sans-serif;
      letter-spacing: 0.05em;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
    `;
    wrap.appendChild(hint);
    wrap.addEventListener('mouseenter', () => hint.style.opacity = '1');
    wrap.addEventListener('mouseleave', () => hint.style.opacity = '0');

    let collapsed = false;
    wrap.addEventListener('dblclick', () => {
      collapsed = !collapsed;
      wrap.style.transform = collapsed
        ? `translateY(${CONFIG.canvasHeight - 24}px)` : 'translateY(0)';
      wrap.style.opacity = collapsed ? '0.25' : '1';
      if (collapsed) hideBubble();
    });

    document.body.appendChild(wrap);
    return wrap;
  }

  /* ==================== 主逻辑 ==================== */

  async function init() {
    log('初始化开始');

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
    app.view.style.cssText = 'display:block;width:100%;height:100%;';

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

    // 视线跟随
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

    // 点击：触发随机动作 + 显示随机对话
    app.view.addEventListener('pointerdown', (e) => {
      // 阻止双击折叠时误触
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

      // 随机对话气泡
      showRandomMsg();
    });

    // 欢迎词：模型就绪后 800ms 显示，让用户先看到模型
    setTimeout(() => showBubble(WELCOME_MSG, 6000), 800);

    log('初始化完成 ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    requestAnimationFrame(init);
  }

})();
