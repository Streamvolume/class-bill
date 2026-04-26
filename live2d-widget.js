/**
 * live2d-widget.js — 班费平台 Live2D 挂件
 *
 * 依赖（动态注入，无需手动引入）：
 *   1. live2dcubismcore.min.js   Cubism 4 官方运行时
 *   2. pixi.js v6                WebGL 渲染
 *   3. pixi-live2d-display       模型加载与交互封装
 *
 * 功能：
 *   - 右下角固定展示自制 Live2D 模型
 *   - 自动播放 Idle 待机动画，循环随机切换
 *   - 鼠标/触摸位置实时视线跟随
 *   - 点击模型触发随机动作（预留）
 *   - 可折叠隐藏（双击挂件区域）
 */

(function () {
  /* ==================== 配置 ==================== */

  const CONFIG = {
    // model3.json 的 raw 链接（GitHub blob URL 转 raw）
    modelUrl: 'https://raw.githubusercontent.com/Streamvolume/sg/main/sg1.model3.json',

    // 挂件画布尺寸（px）
    canvasWidth:  280,
    canvasHeight: 380,

    // 距页面右边、底部的偏移（避开主题切换按钮）
    offsetRight:  10,
    offsetBottom: 0,

    // 模型在画布内的缩放系数（1 = 自适应填满，调小可留白）
    scaleFactor: 0.95,

    // 模型在画布内的垂直锚点（0 = 顶部对齐，1 = 底部对齐）
    anchorY: 1.0,

    // 待机动画组名（与 model3.json Motions 内的 key 一致，找不到则静默跳过）
    idleMotionGroup: 'Idle',

    // 鼠标跟随灵敏度（0 = 不跟随，1 = 完全跟随，建议 0.6-0.9）
    focusSensitivity: 0.9,

    // CDN 脚本链接（按需替换为更稳定的镜像）
    scripts: {
      cubismCore: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
      pixiJs:     'https://cdn.jsdelivr.net/npm/pixi.js@6.5.2/dist/browser/pixi.min.js',
      live2d:     'https://cdn.jsdelivr.net/npm/pixi-live2d-display/dist/cubism4.min.js',
    },
  };

  /* ==================== 工具函数 ==================== */

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

  function log(msg) {
    console.log(`[Live2D Widget] ${msg}`);
  }

  /* ==================== DOM 结构 ==================== */

  function createContainer() {
    // 外层容器（fixed 定位）
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

    // 折叠提示（悬停时显示）
    const hint = document.createElement('div');
    hint.id = 'live2d-hint';
    hint.textContent = '双击隐藏';
    hint.style.cssText = `
      position: absolute;
      top: 8px; left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: rgba(255,255,255,0.25);
      font-family: sans-serif;
      letter-spacing: 0.05em;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
    `;
    wrap.appendChild(hint);
    wrap.addEventListener('mouseenter', () => hint.style.opacity = '1');
    wrap.addEventListener('mouseleave', () => hint.style.opacity = '0');

    // 折叠 / 展开
    let collapsed = false;
    wrap.addEventListener('dblclick', () => {
      collapsed = !collapsed;
      wrap.style.transform = collapsed
        ? `translateY(${CONFIG.canvasHeight - 24}px)`
        : 'translateY(0)';
      wrap.style.opacity = collapsed ? '0.25' : '1';
    });

    document.body.appendChild(wrap);
    return wrap;
  }

  /* ==================== 主逻辑 ==================== */

  async function init() {
    log('初始化开始');

    // 1. 顺序加载三个依赖脚本
    try {
      await loadScript(CONFIG.scripts.cubismCore);
      log('Cubism Core 加载完毕');
      await loadScript(CONFIG.scripts.pixiJs);
      log('PixiJS 加载完毕');
      await loadScript(CONFIG.scripts.live2d);
      log('pixi-live2d-display 加载完毕');
    } catch (err) {
      console.warn(err.message);
      return;
    }

    const { Live2DModel } = PIXI.live2d;

    // 2. 创建 DOM 容器
    const wrap = createContainer();

    // 3. 创建 PIXI 应用（透明背景）
    const app = new PIXI.Application({
      width:            CONFIG.canvasWidth,
      height:           CONFIG.canvasHeight,
      backgroundAlpha:  0,
      antialias:        true,
      resolution:       window.devicePixelRatio || 1,
      autoDensity:      true,
    });
    wrap.appendChild(app.view);
    app.view.style.cssText = 'display:block;width:100%;height:100%;';

    // 4. 加载模型
    log(`加载模型：${CONFIG.modelUrl}`);
    let model;
    try {
      model = await Live2DModel.from(CONFIG.modelUrl, {
        autoInteract: false,   // 禁用内置交互，由我们手动控制
        ticker: PIXI.Ticker.shared,
      });
    } catch (err) {
      console.warn('[Live2D Widget] 模型加载失败：', err.message);
      wrap.remove();
      return;
    }

    app.stage.addChild(model);
    log('模型加载成功');

    // 5. 缩放与定位
    //    按画布尺寸自适应，保持宽高比
    const scaleX = CONFIG.canvasWidth  / model.internalModel.originalWidth;
    const scaleY = CONFIG.canvasHeight / model.internalModel.originalHeight;
    const scale  = Math.min(scaleX, scaleY) * CONFIG.scaleFactor;

    model.scale.set(scale);
    // 水平居中，垂直底部对齐
    model.x = (CONFIG.canvasWidth  - model.width)  / 2;
    model.y = CONFIG.canvasHeight  - model.height;

    // 6. 待机动画（Idle 组循环随机播放）
    function playIdleLoop() {
      try {
        const motions = model.internalModel.motionManager.definitions;
        const groups  = Object.keys(motions);
        log(`可用动画组：${groups.join(', ')}`);

        // 优先找 Idle，没有则用第一个组
        const group = groups.includes(CONFIG.idleMotionGroup)
          ? CONFIG.idleMotionGroup
          : groups[0];

        if (!group) { log('未找到任何动画组，跳过'); return; }

        const count = motions[group].length;
        let  lastIdx = -1;

        function playNext() {
          // 随机选一个不重复的
          let idx;
          do { idx = Math.floor(Math.random() * count); }
          while (count > 1 && idx === lastIdx);
          lastIdx = idx;

          model.motion(group, idx, PIXI.live2d.MotionPriority.NORMAL);
          log(`播放 ${group}[${idx}]`);
        }

        // 监听动画结束事件 → 自动播放下一个
        model.internalModel.motionManager.on('motionFinish', playNext);
        playNext(); // 立刻播放第一个

      } catch (err) {
        log(`待机动画启动失败：${err.message}`);
      }
    }

    // 等模型完全初始化后再启动动画
    if (model.internalModel.motionManager.definitions) {
      playIdleLoop();
    } else {
      model.once('ready', playIdleLoop);
    }

    // 7. 鼠标/触摸视线跟随
    //    直接操作 focusController，传归一化坐标 [-1, 1]
    //    以全屏范围映射，确保鼠标移到屏幕边缘时眼睛才到极限位置
    function handlePointerMove(e) {
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      const y = e.clientY ?? e.touches?.[0]?.clientY;
      if (x === undefined || y === undefined) return;

      // 归一化：屏幕中心 = (0, 0)，右/下 = 正值
      const normalX =  ((x / window.innerWidth)  * 2 - 1) * CONFIG.focusSensitivity;
      const normalY = -((y / window.innerHeight) * 2 - 1) * CONFIG.focusSensitivity;

      // 直接写入 focusController，跳过 model.focus() 的坐标系转换
      const fc = model.internalModel.focusController;
      if (fc) {
        fc.targetX = normalX;
        fc.targetY = normalY;
      }
    }

    document.addEventListener('mousemove',  handlePointerMove, { passive: true });
    document.addEventListener('touchmove',  handlePointerMove, { passive: true });

    // 8. 点击触发随机动作（预留，目前静默）
    app.view.addEventListener('pointerdown', () => {
      try {
        const motions = model.internalModel.motionManager.definitions;
        const groups  = Object.keys(motions).filter(g =>
          g !== CONFIG.idleMotionGroup && motions[g].length > 0
        );
        if (groups.length === 0) return;
        const group = groups[Math.floor(Math.random() * groups.length)];
        const idx   = Math.floor(Math.random() * motions[group].length);
        model.motion(group, idx, PIXI.live2d.MotionPriority.FORCE);
      } catch (_) { /* 无动作时静默忽略 */ }
    });

    log('初始化完成 ✓');
  }

  /* ==================== 启动 ==================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // 延迟一帧，让主页面渲染先完成
    requestAnimationFrame(init);
  }

})();
