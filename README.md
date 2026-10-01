# Spine Studio

Spine 资源预览台 + 配套资源流水线。

## 功能

### 查看器 `viewer-studio/index.html`
- 条目列表与搜索，按逻辑名自动去重
- 自动取景：按 `Role` 骨骼子树框住人物；没有 `Role` 的皮肤退回「排除装饰层」的整场包围盒，并向人物根部收紧
- 视图操作：左键拖动平移、滚轮以光标为中心缩放、`+` / `−` 以画面中心缩放
- 视图记忆：手动缩放 / 平移跨皮肤保持，并写入 `localStorage`
- 聚焦角色 / 完整画面 / 重置视图 / 全屏
- 部件控制：一键隐藏装饰层（`BackGround` / `effect*` / `bg_*`）；运行时隐藏、显示、染色任意槽位
- 动作：列出并切换骨架全部动画，支持循环与暂停
- 多形态：同角色多套形态并排预览
- 声音：按角色名匹配本地语音库，候选列表 + 全库搜索 + 拖入文件播放
- 旧页面自检：`index.html` 变更后页面提示刷新

### 数据流水线 `tools/pipeline`
- `extract_retry.py`：批量提取重试；处理骨骼 JSON 藏在 `*.prefab`、多页图集、Unity NUL 头部
- `fix_pairing.py`：骨架与图集错配时重新配对（region 名重合度 + 贴图尺寸匹配）
- `repair-atlases.mjs`：批量清理图集 NUL 头部、把页名对齐到实际贴图
- `build_manifest_v2.py`：生成 `manifest.json`；去重 + 校验（页贴图存在、骨架附件能在图集里找到）
- `make-audio-index.mjs`：生成 `audio-index.json`（音频库索引）
- `legacy/`：早期版本脚本，留档

### 校验工具 `tools/verify`
- `health-all.mjs`：全量加载体检，报告失败项与耗时
- `validate-atlas.mjs`、`audit-assets.mjs`、`audit-deep.mjs`：图集与资源审计
- `verify-viewport.mjs`、`verify-round3.mjs`：取景、缩放居中、拖动、视图记忆、音频配对的可量化验收
- `list-parts.mjs`、`demo-hide-part.mjs`：列出可寻址部件、演示运行时隐藏部件
- `shot-stage.mjs`、`make-compare.mjs`：舞台截图与前后对比图

## 部署

### 依赖
- 一个静态文件服务器（示例用 Python `http.server`，任何等价物均可）
- 浏览器（Chrome）
- 跑流水线与校验脚本时另需：Python 3 + Pillow、Node.js 18+、`playwright-core`、`adb`、AssetStudioModCLI

### 步骤
1. 准备数据根目录（脚本默认 `D:\AIHOME\Mimo`），其中包含 `skins/` 与 `audio/`。
2. 将官方 `spine-player.js`、`spine-player.css` 放入 `viewer-studio/`（本项目不分发这两个文件）。
3. 生成索引：`node tools/pipeline/make-audio-index.mjs`，输出 `viewer-studio/audio-index.json`。
4. 启动静态服务，任选其一：
   - Windows 一键：双击 `open-viewer.cmd`（自动拉起服务并打开 Chrome）
   - 手动：`python -m http.server 8877 --bind 127.0.0.1 --directory <数据根>`
5. 打开 `http://localhost:8877/viewer-studio/index.html`。

### 环境相关常量
- `open-viewer.ps1` 通过用户环境变量 `MIMO_PYTHON` 定位 Python 解释器。
- `tools/` 下各脚本顶部的路径常量（数据根、`adb`、AssetStudioModCLI、`playwright-core`）按实际环境修改。
