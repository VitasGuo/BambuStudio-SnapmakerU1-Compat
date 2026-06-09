## optimize_gcode — G-code 智能优化

### 描述

对已有 G-code 进行智能诊断和局部优化。AI 分析 G-code 统计数据，识别质量风险区域，生成针对性补丁计划，由确定性代码执行补丁。

这是 AI Lab 的核心功能。LLM 不从零生成 G-code，而是诊断已有 G-code 的问题并规划补丁——发挥 LLM 的分析能力，避免其生成不精确 G-code 的弱点。

### 优化能力

| 优化类型 | operation | 说明 |
|---------|-----------|------|
| 悬垂降速 | replace_speed | 悬垂区域自动降速到 25mm/s |
| 长旅行增回抽 | add_retract | 长距离空走增加回抽防拉丝 |
| 悬垂增风扇 | replace_fan | 悬垂层风扇全开加强冷却 |
| 首层温度调整 | modify_temperature | 首层温度微调改善粘附 |
| 插入指令 | insert_line | 在指定位置插入 G-code 指令 |
| 替换 Start G-code | replace_start_gcode | 替换为完整 U1 专用 Start G-code |
| 替换 End G-code | replace_end_gcode | 替换为完整 U1 专用 End G-code |
| 补充 SET_PRINT_STATS_INFO | add_layer_markers | 每层补充设备识别标记 |
| 补充 M73 进度 | add_m73_progress | 每层补充进度报告 |
| 每层 G92 E0 重置 | add_e_reset | 每层重置 E 值减少文件体积 |
| 补充辅助风扇 | add_aux_fans | 添加 M106 P2/P3 辅助风扇控制 |
| 变层高优化 | variable_layer_height | 平坦区域用厚层加速，曲面区域用薄层保精度 |

### 诊断流程

1. 提取 G-code 统计数据（层数/回抽/速度/温度/风扇/Start G-code/End G-code）
2. AI 分析统计数据，识别问题区域和优化机会
3. 生成 patch_plan（JSON 格式）
4. 确定性代码执行补丁
5. 返回优化报告

### 诊断维度

| 维度 | 检查项 | 常见问题 |
|------|--------|---------|
| 层标记 | 是否有 ;LAYER:N + SET_PRINT_STATS_INFO | BambuStudio G-code 缺失层标记 |
| 进度报告 | 是否有 M73 Pxx Rxx | 无进度报告导致触摸屏无进度 |
| E 值管理 | 是否每层 G92 E0 重置 | E 值膨胀导致文件体积 4x |
| 风扇控制 | 是否有 M106 P2/P3 辅助风扇 | 缺辅助风扇导致悬垂质量差 |
| Start G-code | 是否包含完整 U1 专用启动序列 | 简化 Start 导致首层问题 |
| End G-code | 是否包含风扇关闭 + 归位 | 缺 M106 P2 S0 导致腔体风扇不关 |
| 悬垂处理 | 悬垂区域是否降速+增风扇 | 悬垂未降速导致塌陷 |
| 回抽策略 | 长旅行是否有回抽 | 缺回抽导致拉丝 |
| 首层参数 | 首层速度/温度/风扇是否合理 | 首层过快导致附着力差 |

### 变层高优化

变层高策略从高级切片融入 G-code 优化：

- **原理**：平坦区域（如底面、顶面）用厚层（0.28-0.3mm）加速，曲面区域用薄层（0.12-0.16mm）保精度
- **实现**：AI 分析 G-code 中每层的特征（通过层高变化和路径复杂度推断），输出变层高方案
- **适用场景**：用户上传的 G-code 使用了统一层高，但模型有明显的平坦/曲面区分

### AI 输出格式

**重要：G-code 速度单位为 mm/min（不是 mm/s）**
- F30000 = 500 mm/s，F1800 = 30 mm/s
- replace_speed 的 original_speed 和 new_speed 必须使用 mm/min 单位（如 "F30000"、"F27000"）
- 不要使用 mm/s 单位（如 "500"、"450"），否则补丁将无法匹配

```json
{
  "diagnosis": "诊断描述",
  "issues_found": 3,
  "patch_plan": [
    {"operation": "replace_speed", "target": "overhang_regions", "original_speed": "F3000", "new_speed": "F1500", "reason": "悬垂区域减速"},
    {"operation": "add_retract", "target": "long_travels", "min_travel_length": 5.0, "retract_length": 1.2, "reason": "长距离空走增加回抽防拉丝"},
    {"operation": "replace_fan", "target": "overhang_layers", "new_fan_speed": 255, "reason": "悬垂层增加冷却"},
    {"operation": "replace_start_gcode", "reason": "替换为完整U1 Start G-code"},
    {"operation": "add_layer_markers", "reason": "补充 SET_PRINT_STATS_INFO 层标记"},
    {"operation": "add_m73_progress", "reason": "补充 M73 进度报告"},
    {"operation": "add_e_reset", "reason": "每层 G92 E0 重置E值"},
    {"operation": "add_aux_fans", "reason": "添加辅助风扇控制"}
  ],
  "summary": "优化总结"
}
```

### Snapmaker U1 专用知识

- **三风扇系统**：主风扇 M106 S（0-255）、腔体风扇 M106 P2 S（0-255）、排气风扇 M106 P3 S（0-255）
- **打印尺寸**：270 × 270 × 270mm
- **默认回抽量**：1.2mm（官方推荐 1.0-1.5mm）
- **Klipper 固件**：G-code 参数只接受数字 1/0，不接受字符串 "True"/"False"
