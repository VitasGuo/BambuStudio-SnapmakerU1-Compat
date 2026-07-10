# Snapmaker U1 Bridge for macOS

该目录承载 Snapmaker U1 Bridge 的 macOS 原生伴随应用。项目使用同一套 Swift 与 Bridge 源码，分别生成只含单一架构的 Apple Silicon 和 Intel 应用，不修改或重新签名 `BambuStudio.app`。

## 支持基线

- 最低系统：macOS 11.0
- Bambu Studio：仅支持并强制检测 2.7.1.62 正式版；不要直接使用未验证的更新版本
- Apple Silicon 包：`arm64`
- Intel 包：`x86_64`；可在 Apple Silicon 上通过 Rosetta 2 做首阶段验证
- 内置运行时：Node.js v22.23.1，使用 nodejs.org 官方 Darwin 压缩包和脚本内固定的 SHA-256

两个包具有相同的 bundle identifier `com.snapmaker.u1bridge`，不能同时安装到同一路径。应用会根据 `Info.plist` 中的 `SnapmakerU1TargetArchitecture` 做启动架构防护；Intel 构建允许在 Rosetta 下运行。

安装 U1 预设时，伴随 App 除了写入 `~/Library/Application Support/BambuStudio/system/Snapmaker*`，还会幂等激活 `BambuStudio.conf` 中的 `Snapmaker U1 / 0.4` 机型。卸载仅移除由本 App 添加的精确机型条目，并保留用户的其他打印机、耗材及后续设置；顶层 `filaments` 由 Bambu Studio 自行维护，伴随 App 不改写。Bambu Studio 必须在安装、更新或卸载预设前完全退出。

## 构建

构建机需要 Xcode Command Line Tools，并需要联网下载 Node 运行时及首次安装 npm 依赖。所有 JavaScript 生产依赖由已提交的 `bridge-node/package-lock.json` 和 `npm ci --omit=dev` 锁定。

```bash
./scripts/build-macos.sh arm64
./scripts/build-macos.sh x86_64
./scripts/build-macos.sh all
```

`all` 会依次构建两个完全独立的包，避免共享暂存目录或 npm 安装目录。下载缓存位于 `.cache/macos-build/`，可以删除后进行干净重建。

产物位于 `dist/`：

```text
Snapmaker-U1-Bridge-arm64.app
Snapmaker-U1-Bridge-arm64.dmg
Snapmaker-U1-Bridge-arm64.dmg.sha256
Snapmaker-U1-Bridge-x86_64.app
Snapmaker-U1-Bridge-x86_64.dmg
Snapmaker-U1-Bridge-x86_64.dmg.sha256
SHA256SUMS
```

应用内固定布局：

```text
Contents/
├── MacOS/
│   ├── SnapmakerU1Bridge
│   └── SnapmakerU1DialogHelper
└── Resources/
    ├── AppIcon.icns
    └── Payload/
        ├── runtime/bin/node
        ├── bridge-node/
        ├── bridge/web/
        └── profiles/
            ├── Snapmaker.json
            └── Snapmaker/
```

构建脚本按以下顺序执行门禁：校验 Node 官方摘要、用透明的 `Snapmaker U1_cover.png` 生成完整尺寸的 `AppIcon.icns`、编译单架构 Swift 可执行文件、安装锁定的生产依赖、组装 Payload、移除扩展属性、逐个 ad-hoc 签名、验证 App、生成 DMG、挂载并再次验证 DMG 内 App。

## 独立验证

```bash
./scripts/verify-macos.sh arm64
./scripts/verify-macos.sh x86_64
./scripts/verify-macos.sh all
./scripts/verify-macos.sh x86_64 /path/to/Snapmaker-U1-Bridge-x86_64.dmg
```

验证脚本检查：

- `file`/`lipo` 确认主程序、打印对话框、Node 及所有 Mach-O 只含目标架构；
- `otool` 确认三个核心可执行文件的最低系统版本是 macOS 11.0；
- `codesign --deep --strict` 确认应用及嵌套可执行文件签名完整；
- `Info.plist` 含架构防护、本地网络用途、`_snapmaker._tcp` Bonjour 服务和 Node 版本；
- `Info.plist` 正确声明 `AppIcon`，并且 `Resources/AppIcon.icns` 存在且非空；
- Bridge 生产依赖、WebUI、机器预设及运行时文件完整，且未带入 `esbuild` 或测试目录；
- 在 M 系列 Mac 上通过 `arch -x86_64` 实际运行 Intel Node，确认 Rosetta 路径有效。

ad-hoc 签名仅用于本地开发和测试，不等同于 Developer ID 签名或 Apple 公证。正式对外分发时，需要在同一组装流程中替换签名身份并增加 notarization/stapling，之后重新执行验证。

## Bambu Studio 预设回归

用官方 Bambu Studio 2.7.1.62 App 执行一次真实 CLI 切片：

```bash
./scripts/verify-bambustudio-profile.sh /path/to/BambuStudio.app
```

脚本只在临时目录中合并 U1 的 machine、0.20 Standard process 和 Snapmaker PLA Basic filament 继承链，并补充 `from=system`，不会安装或覆盖用户预设。它使用 App 自带的 `rounded_rectangle.stl` 切片，并断言 `result.json` 的 `return_code=0`，以及 G-code 中存在 Bambu Studio 2.7.1.62、`PRINT_START`、完整 `CONFIG_BLOCK` 和默认 Snapmaker PLA Basic profile 标记。CLI 已知可能向 stderr 输出 `Invalid T command(TIMELAPSE_*)`，只要结构化返回码和 G-code 验证通过，该警告不会被误判为失败。
