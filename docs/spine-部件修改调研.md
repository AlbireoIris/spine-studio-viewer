# Spine 部件修改 / 加装饰 — 调研笔记

> 范围：仅针对**已导出到本地的** Spine 三件套（json + atlas + png）做二次创作/学习。
> 不涉及写回游戏客户端、不提供改包/注入步骤。

## 1. Spine 显示部件是什么

一套 Spine 皮肤的“可显示部件”分布在三处：

| 文件 | 作用 | 能改什么 |
|---|---|---|
| `*.png` | 图集像素（bounds 里的小图） | 画上去：加装饰、改颜色、贴花 |
| `*.atlas` | 部件名 → 图集坐标 | 增删 region、改 offsets |
| `*.json` | 骨骼 / 槽位 / 附件绑定 / 动画 | 换附件、加骨骼、加网格 |

**关键概念**

- **Slot（槽位）**：骨骼上的“挂点”，决定谁显示在哪一层。
- **Attachment（附件）**：真正被画出来的东西（region / mesh / skinned mesh）。
- **Skin（皮肤）**：附件的命名集合，可整体切换。

## 2. 不改文件的“看/播”改造（已完成）

查看器侧可以做且不破坏资源：

- 隐藏/显示 `BackGround`、`effect*`、`bg_*` 骨骼（装饰框、背景层）
- 缩放 viewport 到 `Role` 骨骼，避免装饰框把角色压小
- 多形态并排（osiris03a/03b/03c）
- 绑定音频（acb → wav 用 vgmstream 解出后与皮肤同名放置）

这些都只改**运行时状态**，不改磁盘上的 json/atlas/png。

## 3. 合法本地二创的三种改法

### 3.1 改图集像素（最简单）

1. 用 PS / GIMP / Aseprite 打开 `xxx.png`
2. 找到要装饰的部件区域（对照 `xxx.atlas` 里的 `bounds:x,y,w,h`）
3. 画上去（加光环、贴纸、改色）
4. 保存回 png，主名保持一致

**注意**：atlas 坐标不要动，否则部件错位。

### 3.2 用 Spine 编辑器换附件

1. 用 **Spine 编辑器**（官方试用版）导入 `xxx.json` + atlas + png
2. 在 **Setup** 模式里：
   - 新建 region 附件（或导入新 PNG 作为新 region）
   - 把它挂到某个 Slot（例如 `hair_*`、`clothing_*`）
   - 需要跟动就加约束/网格
3. 导出新的 json/atlas/png

适合：真正加一件“装饰”并让它跟着骨骼动。

### 3.3 代码级动态附件（高级）

Spine Runtime 支持运行时：

- `skeleton.setAttachment(slotName, attachmentName)`
- 动态创建 `RegionAttachment` / `MeshAttachment`
- 用 `SkeletonJson` / `SkeletonBinary` 读改后的数据

适合：做交互式换装 demo（在**自己的查看器**里）。

## 4. 常见“部件加装饰”清单

| 想做的事 | 推荐路径 | 难度 |
|---|---|---|
| 给角色脸上贴花/痣 | 改 PNG 图集对应 region | 易 |
| 给武器加发光 | Spine 编辑器加新 region + 混合模式 | 中 |
| 加一顶帽子跟头骨动 | 新附件挂到 `head_*` slot | 中 |
| 全身换配色 | PS 调色或 runtime tint | 易 |
| 改动画动作 | Spine 编辑器改曲线 | 难 |

## 5. 技术边界（请遵守）

- 以上只适用于**你导出的副本**做研究、学习、个人欣赏。
- **不要**把改过的文件打包回游戏客户端 / 绕过校验 / 做破解补丁。
- 二创发布请遵守游戏官方二创政策与素材版权。

## 6. 本项目里已有的工具

| 工具 | 用途 |
|---|---|
| `AssetStudioModCLI` | UnityFS → Spine 三件套 |
| `vgmstream-cli` | acb/HCA → wav |
| `viewer-studio` | 预览 / 隐藏装饰层 / 多形态 / 音频 |
| `SpineViewer` 桌面版 | 专业查看/导出 GIF/MP4 |

---

*文档生成于本地分析会话，供个人学习使用。*
