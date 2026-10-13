# Pixel Art Studio 🎨

一个**纯前端、零依赖**的在线像素画编辑器 —— 打开就能画，画完直接导出 PNG。

不装任何东西，不需要构建，没有框架，没有 CDN，没有外部字体。整个项目就是三个文件，扔进浏览器就能跑。

[![License: MIT](https://img.shields.io/badge/License-MIT-22d3ee.svg)](LICENSE)
[![No dependencies](https://img.shields.io/badge/dependencies-0-a78bfa.svg)]()
[![Vanilla JS](https://img.shields.io/badge/JS-vanilla-f7df1e.svg)]()

---

## ✨ 功能

| | |
| --- | --- |
| 🖌 **四种工具** | 画笔、橡皮、油漆桶（四连通填充）、吸管 |
| 🎨 **调色板** | 20 色 PICO-8 风格预设 + 任意自定义颜色 |
| 📐 **三种画布** | 16×16 / 32×32 / 64×64，随时切换 |
| ↶ **撤销 / 重做** | 最多 60 步历史，`Ctrl+Z` / `Ctrl+Shift+Z` |
| 💾 **自动保存** | 作品存在浏览器 localStorage，关掉页面也不会丢 |
| 🖼 **导出 PNG** | 支持 ×1 / ×4 / ×8 / ×16 放大，空像素保持透明 |
| ⌨️ **快捷键** | 单手就能操作全部工具 |
| 🖱 **右键取色** | 在画布上右键，直接吸取那一格的颜色 |
| 📱 **响应式** | 手机上也能画，布局自动堆叠 |

## 🚀 开始使用

### 方式一：直接打开

```bash
git clone https://github.com/simiomxiaomi/pixel-art-studio.git
cd pixel-art-studio
# 双击 index.html 就行，或者：
start index.html        # Windows
open  index.html        # macOS
```

### 方式二：起个本地服务器（可选）

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000
```

> 直接用 `file://` 打开也完全没问题，所有功能都可用。

## ⌨️ 快捷键

| 按键 | 作用 |
| --- | --- |
| <kbd>B</kbd> | 画笔 |
| <kbd>E</kbd> | 橡皮 |
| <kbd>G</kbd> | 油漆桶 |
| <kbd>I</kbd> | 吸管 |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | 撤销 |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | 重做 |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | 重做（备选） |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | 直接导出 PNG |
| 鼠标右键 | 吸取当前格子的颜色 |

## 📁 项目结构

```
pixel-art-studio/
├── index.html    # 页面结构
├── style.css     # 全部样式（约 400 行手写 CSS）
├── app.js        # 全部逻辑（约 400 行原生 JS）
├── LICENSE       # MIT
└── README.md     # 你正在看的这份
```

没有 `package.json`，没有 `node_modules`，没有构建产物 —— **克隆下来就能用**。

## 🔧 技术说明

- **绘制**：单个 `<canvas>`，内部分辨率固定 512×512（正好是 16 / 32 / 64 的公倍数），保证任何画布尺寸下每个像素都是整数、不糊边
- **缩放**：CSS `image-rendering: pixelated`，放大后依然是硬边像素，不会插值变模糊
- **填充算法**：用显式栈做的四连通 flood fill，避免深递归爆栈
- **历史记录**：每笔操作前对整个像素数组做一次快照，结构简单、撤销绝对可靠
- **持久化**：`localStorage` 存 `{ size, pixels, grid }`，读取时会校验尺寸与数组长度是否匹配，脏数据直接忽略
- **导出**：离屏 canvas 逐格 `fillRect`，用 `toBlob` 生成 PNG 并触发下载

## 🌐 部署到 GitHub Pages

1. 把仓库推到 GitHub
2. 打开仓库的 **Settings → Pages**
3. **Source** 选 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`
4. 等一两分钟，访问 `https://<你的用户名>.github.io/pixel-art-studio/`

因为全是静态文件，Vercel / Netlify / Cloudflare Pages 也同样可以直接拖进去部署。

## 📄 License

[MIT](LICENSE) © 2026 苏小晗
