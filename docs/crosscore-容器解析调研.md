# CrossCore（交错战线）容器解析调研

面向 `Custom/luascripts` 这类"UnityFS 被包装 + 自带加密位"的容器，记录可行路径与踩过的坑。

## 结论先行

- **`luascripts` = `[Unity 序列化头(152B)] + [UnityFS bundle]`**，内层签名首字节被改写（`'U'` → `0x14`）。
- **拿去包装后仍无法用 AssetStudio 打开**：`No Unity file can be loaded`。
- **换 `AssetsTools.NET` 可以打开**：签名首字节还原后 `signature not supported` 消失，块表直接解出（940 块）。
  → 结论：**卡点不是加密强度，而是读取器的宽容度**。同类问题优先换读取器，而不是硬破解。

## 容器结构（实测）

```
[0   .. 146]  Unity 序列化对象头（ABCustom）
[16  .. 83 ]  程序集限定名 "FAssembly-CSharp, Version=0.0.0.0, ..."（类型名在偏移 83 结束）
[152 ..     ] 内层 UnityFS bundle（签名首字节被改写）
```

bundle 头部（解密后读出）：

| 字段 | 值 |
|---|---|
| Signature | `UnityFS` |
| Version | 8 |
| GenerationVersion | 5.x.x |
| EngineVersion | 2022.3.62f2c1 |
| BlockInfos | **940 块**（首块 `DecompressedSize=131072` 即 128KB，`Flags=3`） |
| DirectoryInfos | 1 个内层文件 |
| flags | `0x243` → 压缩 `LZ4HC`(0x3F&3=3)、blocks 与 directory 合并(0x40)、加密位(0x200) |

内层 assets：**18,048 个资源**，其中 **TypeId 49（TextAsset）18,047 个** —— 即全部 Lua 脚本明文。

## 可行路径（推荐）

```
1. 剥前缀：从 offset 152 拷贝到文件尾
2. 还原首字节：把第 0 字节改回 'U'（得到标准 UnityFS）
3. 用 AssetsTools.NET 打开 → 取 BlockAndDirInfo / DirectoryInfos
4. LoadAssetsFileFromBundle(bundle, 0) → 遍历 AssetInfos
5. 对 TypeId==49 的资源读 m_Name / m_Script（即 Lua 源码）导出
6. 在导出的 Lua 里检索目标表（例如语音表就是 cfgSound.lua）
```

`tools/pipeline/crosscore/dotnet-probe/` 是第 3–5 步的可运行探针（.NET 8 + `AssetsTools.NET 3.0.3`）。

## 已否证的路径（避免重复劳动）

| 做法 | 结果 |
|---|---|
| AssetStudio（含 ModCLI） | 剥前缀前后都报 `No Unity file can be loaded` |
| AssestBundleTools 的 crosscore CLI | `Input is not a supported CrossCore prefixed-header bundle`（它只处理 duplicated-header-v1 / prefixed-header-v2 两种**前缀包装**） |
| 读 `CrossCoreBundleCodec.cs` 找解密算法 | 其 `Decrypt()` 只是**前缀剥离**，全文件检索 `Aes/XOR/Rijndael/DES/Crypto` 无命中 |
| 用 dump 里的 16 字节十六进制串当密钥解块表 | 300 种组合（AES-CBC/ECB × IV 变体 + XOR + 原样）全部未命中，多半是 AB 清单哈希 |
| 逐字节穷举 / 容错解码 / 链式推进 / 锚点回溯 / 内容特征判块 | 只能采到部分条目，缺口始终不出现 —— 因为块边界判断错误（真块是 **128KB**，不是 1MB） |

## 关键教训

1. **先看 flags**：`0x40` 表示 blocks 与 directory 合并存放，所以"块不连续"是正常现象，不要据此推断布局。
2. **块大小要看块表**，不要猜：本容器首块 128KB，此前误判为 1MB 导致所有偏移推算全错。
3. **同一容器多读取器对比**：AssetStudio 与 AssetsTools.NET 的宽容度差别足以决定成败。
4. **工具源码优先于黑盒试错**：`AssestBundleTools` 的价值不在它的 CrossCore 解密器（只是剥前缀），而在于它暴露了"底层用 AssetsTools.NET"这条线索。
