# BambuStudio-SnapmakerU1-Compat 项目进度

## v2.1 (2026-05-14)

### 新增：Generic 通用耗材支持

**问题**：U1 只能添加 Snapmaker 兼容的耗材，不能添加通用耗材或 Bambu Studio 预设的耗材。

**原因**：BambuStudio 通过 `compatible_printers` 字段过滤耗材列表，只有明确列出 `"Snapmaker U1 (0.4 nozzle)"` 的耗材才会在 U1 的耗材选择中显示。兼容包之前只包含 4 个 Snapmaker 品牌耗材。

**解决方案**：从 BambuStudio 源码中提取 Generic 耗材配置，添加到兼容包中。

**新增文件**（12 个）：

| 文件 | 说明 | 继承关系 |
|------|------|----------|
| `fdm_filament_common_generic.json` | 通用耗材公共基础配置 | - |
| `fdm_filament_pla_generic.json` | 通用 PLA 基础配置 | → fdm_filament_common_generic |
| `fdm_filament_pet_generic.json` | 通用 PETG 基础配置 | → fdm_filament_common_generic |
| `fdm_filament_abs_generic.json` | 通用 ABS 基础配置 | → fdm_filament_common_generic |
| `fdm_filament_tpu_generic.json` | 通用 TPU 基础配置 | → fdm_filament_common_generic |
| `Generic PLA @base.json` | 通用 PLA 中间层 | → fdm_filament_pla_generic |
| `Generic PLA.json` | 通用 PLA（用户可见） | → Generic PLA @base |
| `Generic PETG @base.json` | 通用 PETG 中间层 | → fdm_filament_pet_generic |
| `Generic PETG.json` | 通用 PETG（用户可见） | → Generic PETG @base |
| `Generic ABS @base.json` | 通用 ABS 中间层 | → fdm_filament_abs_generic |
| `Generic ABS.json` | 通用 ABS（用户可见） | → Generic ABS @base |
| `Generic TPU.json` | 通用 TPU（用户可见） | → fdm_filament_tpu_generic |

**修改文件**：

| 文件 | 修改内容 |
|------|----------|
| `Snapmaker.json` | 版本号 02.00.00.02 → 02.00.01.00；filament_list 新增 12 个 Generic 耗材条目 |
| `Snapmaker/machine/Snapmaker U1.json` | default_materials 新增 Generic PLA/PETG/ABS/TPU |
| `install.ps1` | 版本号 v2.0 → v2.1；验证步骤增加 Generic PLA.json 检查 |
| `README.md` | 版本历史新增 v2.1；更新耗材选择建议；更新文件数说明 |

**关于 Bambu Lab 品牌耗材**：Bambu Lab 耗材（如 Bambu PLA）的 `compatible_printers` 只列了 Bambu Lab 打印机，且包含 AMS 专用设置（如 `filament_long_retractions_when_cut`），不适合直接用于 U1。Generic 通用耗材预设采用保守调优，兼容性更广，推荐 U1 用户使用 Generic 预设搭配任意品牌耗材。

## v2.0 (2026-05-14)

- 支持局域网直连打印（OctoPrint 协议）
- 修复 OrcaSlicer 不兼容字段
- install/uninstall 脚本完善

## v1.0 (2026-05-13)

- 初始版本，基于 Snapmaker Orca 官方 U1 配置
