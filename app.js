/* =====================================================================
   Pixel Art Studio — 核心逻辑
   纯原生 JavaScript，零依赖。用 canvas 手绘，支持：
     画笔 / 橡皮 / 油漆桶 / 吸管  ·  撤销重做  ·  多尺寸  ·  PNG 导出
     localStorage 自动保存  ·  键盘快捷键  ·  右键吸取颜色
   ===================================================================== */

(function () {
  'use strict';

  /* -------------------------------------------------------------
     常量
     ------------------------------------------------------------- */

  const CANVAS_PX  = 512;                       // 画布内部分辨率（16/32/64 的公倍数）
  const STORAGE_KEY = 'pixel-art-studio:v1';
  const MAX_HISTORY = 60;

  // PICO-8 风格经典色 + 几个现代色，共 20 色
  const PALETTE = [
    '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236',
    '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300',
    '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8',
    '#ffccaa', '#22d3ee', '#a78bfa', '#f472b6', '#4ade80'
  ];

  const TOOL_KEYS = { b: 'brush', e: 'eraser', g: 'fill', i: 'picker' };

  /* -------------------------------------------------------------
     DOM
     ------------------------------------------------------------- */

  const canvas      = document.getElementById('board');
  const ctx         = canvas.getContext('2d');
  const toolsBox    = document.getElementById('tools');
  const paletteBox  = document.getElementById('palette');
  const colorInput  = document.getElementById('colorInput');
  const colorValue  = document.getElementById('colorValue');
  const sizesBox    = document.getElementById('sizes');
  const gridToggle  = document.getElementById('gridToggle');
  const sizeWarn    = document.getElementById('sizeWarn');
  const undoBtn     = document.getElementById('undoBtn');
  const redoBtn     = document.getElementById('redoBtn');
  const clearBtn    = document.getElementById('clearBtn');
  const scaleSelect = document.getElementById('scaleSelect');
  const exportBtn   = document.getElementById('exportBtn');
  const statusSize  = document.getElementById('statusSize');
  const statusPos   = document.getElementById('statusPos');

  /* -------------------------------------------------------------
     状态
     ------------------------------------------------------------- */

  let size    = 32;
  let pixels  = new Array(size * size).fill(null);   // 每格的颜色，null = 透明
  let tool    = 'brush';
  let color   = '#22d3ee';
  let showGrid = true;

  const history = [];     // 撤销栈：存 pixels 快照
  const future  = [];     // 重做栈

  let painting = false;
  let lastIndex = -1;
  let pendingSize = null;

  const idx = (x, y) => y * size + x;
  const cell = () => CANVAS_PX / size;

  /* -------------------------------------------------------------
     渲染
     ------------------------------------------------------------- */

  function draw() {
    const c = cell();

    ctx.fillStyle = '#0a0e13';
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

    // 像素
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const col = pixels[idx(x, y)];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * c, y * c, c, c);
      }
    }

    // 网格线
    if (showGrid && c >= 6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, .055)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= size; i++) {
        const p = Math.round(i * c) + 0.5;
        ctx.moveTo(p, 0);      ctx.lineTo(p, CANVAS_PX);
        ctx.moveTo(0, p);      ctx.lineTo(CANVAS_PX, p);
      }
      ctx.stroke();
    }

    // 外边框
    ctx.strokeStyle = 'rgba(255, 255, 255, .14)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CANVAS_PX - 2, CANVAS_PX - 2);

    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = future.length === 0;
  }

  /* -------------------------------------------------------------
     坐标换算
     ------------------------------------------------------------- */

  function eventToCell(ev) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = Math.floor((ev.clientX - r.left) / r.width  * size);
    const y = Math.floor((ev.clientY - r.top)  / r.height * size);
    if (x < 0 || y < 0 || x >= size || y >= size) return null;
    return { x: x, y: y };
  }

  /* -------------------------------------------------------------
     绘制动作
     ------------------------------------------------------------- */

  function paintAt(x, y) {
    const i = idx(x, y);
    if (tool === 'eraser') {
      if (pixels[i] === null) return false;
      pixels[i] = null;
      return true;
    }
    if (pixels[i] === color) return false;
    pixels[i] = color;
    return true;
  }

  function floodFill(x, y, newColor) {
    const start = idx(x, y);
    const target = pixels[start];
    if (target === newColor) return false;

    const stack = [start];
    const seen = new Uint8Array(size * size);
    let changed = false;

    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      if (pixels[i] !== target) continue;

      pixels[i] = newColor;
      changed = true;

      const px = i % size;
      const py = (i - px) / size;
      if (px > 0)           stack.push(i - 1);
      if (px < size - 1)    stack.push(i + 1);
      if (py > 0)           stack.push(i - size);
      if (py < size - 1)    stack.push(i + size);
    }
    return changed;
  }

  function pickColorAt(x, y) {
    const col = pixels[idx(x, y)];
    if (col) {
      setColor(col);
      setStatus('已吸取 ' + col);
    } else {
      setStatus('这格是透明的');
    }
  }

  /* -------------------------------------------------------------
     历史记录
     ------------------------------------------------------------- */

  function pushHistory() {
    history.push(pixels.slice());
    if (history.length > MAX_HISTORY) history.shift();
    future.length = 0;
  }

  function undo() {
    if (!history.length) return;
    future.push(pixels.slice());
    pixels = history.pop();
    draw(); persist();
    setStatus('已撤销');
  }

  function redo() {
    if (!future.length) return;
    history.push(pixels.slice());
    pixels = future.pop();
    draw(); persist();
    setStatus('已重做');
  }

  /* -------------------------------------------------------------
     指针交互
     ------------------------------------------------------------- */

  function onPointerDown(ev) {
    const pos = eventToCell(ev);
    if (!pos) return;

    // 右键 / 中键：吸取颜色
    if (ev.button === 2 || ev.button === 1) {
      pickColorAt(pos.x, pos.y);
      return;
    }
    if (ev.button !== 0) return;

    ev.preventDefault();
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(ev.pointerId); } catch (err) { /* 忽略 */ }
    }

    if (tool === 'picker') {
      pickColorAt(pos.x, pos.y);
      return;
    }

    pushHistory();
    painting = true;
    lastIndex = -1;

    if (tool === 'fill') {
      if (floodFill(pos.x, pos.y, color)) {
        draw(); persist();
      } else {
        history.pop();          // 没改动就没必要留历史
      }
      painting = false;
      return;
    }

    if (paintAt(pos.x, pos.y)) {
      lastIndex = idx(pos.x, pos.y);
      draw(); persist();
    }
  }

  function onPointerMove(ev) {
    const pos = eventToCell(ev);

    if (!pos) {
      if (!painting) statusPos.textContent = '就绪';
      return;
    }

    const i = idx(pos.x, pos.y);
    const col = pixels[i];
    statusPos.textContent = (pos.x + 1) + ', ' + (pos.y + 1) + (col ? ' · ' + col : ' · 空');

    if (!painting || tool === 'fill' || tool === 'picker') return;
    if (i === lastIndex) return;

    if (paintAt(pos.x, pos.y)) {
      lastIndex = i;
      draw(); persist();
    }
  }

  function onPointerUp() {
    if (!painting) return;
    painting = false;
    lastIndex = -1;
    persist();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', function () {
    if (!painting) statusPos.textContent = '就绪';
  });
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

  /* -------------------------------------------------------------
     工具 / 颜色
     ------------------------------------------------------------- */

  function setTool(next) {
    tool = next;
    Array.prototype.forEach.call(toolsBox.querySelectorAll('.tool'), function (btn) {
      btn.classList.toggle('is-active', btn.dataset.tool === next);
    });
    setStatus('当前工具：' + ({
      brush: '画笔', eraser: '橡皮', fill: '油漆桶', picker: '吸管'
    })[next]);
  }

  function setColor(hex) {
    color = hex;
    colorInput.value = hex;
    colorValue.textContent = hex;
    Array.prototype.forEach.call(paletteBox.querySelectorAll('.swatch'), function (b) {
      b.classList.toggle('is-active', b.dataset.color.toLowerCase() === hex.toLowerCase());
    });
  }

  toolsBox.addEventListener('click', function (ev) {
    const btn = ev.target.closest('.tool');
    if (btn) setTool(btn.dataset.tool);
  });

  colorInput.addEventListener('input', function () { setColor(colorInput.value); });

  /* -------------------------------------------------------------
     调色板
     ------------------------------------------------------------- */

  (function buildPalette() {
    const frag = document.createDocumentFragment();
    PALETTE.forEach(function (hex) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.color = hex;
      b.style.background = hex;
      b.title = hex;
      b.setAttribute('aria-label', hex);
      frag.appendChild(b);
    });
    paletteBox.appendChild(frag);
  })();

  paletteBox.addEventListener('click', function (ev) {
    const b = ev.target.closest('.swatch');
    if (b) setColor(b.dataset.color);
  });

  /* -------------------------------------------------------------
     画布尺寸
     ------------------------------------------------------------- */

  function hasArt() {
    for (let i = 0; i < pixels.length; i++) if (pixels[i]) return true;
    return false;
  }

  function setSize(next) {
    size = next;
    pixels = new Array(size * size).fill(null);
    history.length = 0;
    future.length = 0;
    pendingSize = null;
    sizeWarn.hidden = true;

    Array.prototype.forEach.call(sizesBox.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', Number(b.dataset.size) === size);
    });
    statusSize.textContent = size + ' × ' + size;

    draw(); persist();
    setStatus('画布已切换为 ' + size + ' × ' + size);
  }

  sizesBox.addEventListener('click', function (ev) {
    const btn = ev.target.closest('button[data-size]');
    if (!btn) return;
    const want = Number(btn.dataset.size);
    if (want === size) return;

    if (hasArt() && pendingSize !== want) {
      pendingSize = want;
      sizeWarn.hidden = false;
      sizeWarn.textContent = '再点一次「' + want + '」确认切换，当前作品会被清空。';
      return;
    }
    setSize(want);
  });

  gridToggle.addEventListener('change', function () {
    showGrid = gridToggle.checked;
    draw(); persist();
  });

  /* -------------------------------------------------------------
     撤销 / 重做 / 清空
     ------------------------------------------------------------- */

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  clearBtn.addEventListener('click', function () {
    if (!hasArt()) { setStatus('画布本来就是空的'); return; }
    if (!window.confirm('确定要清空整张画布吗？这一步可以用 Ctrl+Z 撤销。')) return;
    pushHistory();
    pixels = new Array(size * size).fill(null);
    draw(); persist();
    setStatus('画布已清空');
  });

  /* -------------------------------------------------------------
     导出 PNG
     ------------------------------------------------------------- */

  function exportPng() {
    const scale = Math.max(1, parseInt(scaleSelect.value, 10) || 1);
    const out = document.createElement('canvas');
    out.width  = size * scale;
    out.height = size * scale;

    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const col = pixels[idx(x, y)];
        if (!col) continue;                      // 空像素保持透明
        octx.fillStyle = col;
        octx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const name = 'pixel-art-' + size + 'x' + size + '-' + stamp + '.png';

    if (out.toBlob) {
      out.toBlob(function (blob) {
        if (!blob) { setStatus('导出失败，请换一个浏览器试试'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        setStatus('已导出 ' + name);
      }, 'image/png');
    } else {
      const a = document.createElement('a');
      a.href = out.toDataURL('image/png');
      a.download = name;
      a.click();
      setStatus('已导出 ' + name);
    }
  }

  exportBtn.addEventListener('click', exportPng);

  /* -------------------------------------------------------------
     本地保存
     ------------------------------------------------------------- */

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        size: size,
        pixels: pixels,
        grid: showGrid
      }));
    } catch (err) { /* 隐私模式或空间不足，忽略 */ }
  }

  function restore() {
    let data = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (err) { data = null; }

    if (data && (data.size === 16 || data.size === 32 || data.size === 64) &&
        Array.isArray(data.pixels) && data.pixels.length === data.size * data.size) {
      size = data.size;
      pixels = data.pixels;
      showGrid = data.grid !== false;
    } else {
      size = 32;
      pixels = new Array(size * size).fill(null);
    }

    gridToggle.checked = showGrid;
    Array.prototype.forEach.call(sizesBox.querySelectorAll('button'), function (b) {
      b.classList.toggle('is-active', Number(b.dataset.size) === size);
    });
    statusSize.textContent = size + ' × ' + size;
  }

  /* -------------------------------------------------------------
     状态栏
     ------------------------------------------------------------- */

  let statusTimer = null;
  function setStatus(msg) {
    statusPos.textContent = msg;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      statusPos.textContent = '就绪';
    }, 2200);
  }

  /* -------------------------------------------------------------
     键盘快捷键
     ------------------------------------------------------------- */

  document.addEventListener('keydown', function (ev) {
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    const key = ev.key.toLowerCase();

    if ((ev.ctrlKey || ev.metaKey) && key === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) redo(); else undo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && key === 'y') {
      ev.preventDefault();
      redo();
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && key === 's') {
      ev.preventDefault();
      exportPng();
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    if (TOOL_KEYS[key]) {
      ev.preventDefault();
      setTool(TOOL_KEYS[key]);
    }
  });

  /* -------------------------------------------------------------
     启动
     ------------------------------------------------------------- */

  restore();
  setTool('brush');
  setColor(color);
  draw();
  setStatus('欢迎使用，随便画点什么吧');

})();
