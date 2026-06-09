## slice_strategy — 切片策略决策

### 描述

基于模型分析结果，通过决策树确定最优切片参数组合。

### 输入

`analyze_model` 的输出报告。

### 决策树

```
slice_strategy(model_analysis):
  ├── 悬垂 > 30%
  │   ├── 悬垂面积大且连续 → Linear 支撑
  │   ├── 悬垂面积小且分散 → Tree 支撑
  │   └── 悬垂角度 > 60° → Tree 支撑 + 接口层加厚
  │
  ├── 薄壁 > 20%
  │   ├── 壁厚 < 0.6mm → 层高降至 0.12mm
  │   ├── 壁厚 0.6-0.8mm → 层高降至 0.16mm
  │   └── 壁厚 0.8-1.2mm → 层高降至 0.2mm + 线宽 0.36mm
  │
  ├── 桥接区域存在
  │   ├── 桥接长度 > 20mm → 减速至 20mm/s + 风扇全开
  │   ├── 桥接长度 10-20mm → 减速至 25mm/s + 风扇全开
  │   └── 桥接长度 < 10mm → 减速至 30mm/s + 风扇 80%
  │
  ├── 模型体积 > 100cm³
  │   └── 填充密度降至 10% + Gyroid 图案
  │
  ├── 模型高度 > 200mm
  │   └── 添加 Brim（5mm）+ 降低首层速度
  │
  └── 默认策略
      ├── 层高: 0.2mm
      ├── 外墙: 3 圈
      ├── 填充: 15% Gyroid
      └── 支撑: 无
```

### 输出

```json
{
  "layer_height": 0.2,
  "first_layer_height": 0.28,
  "line_width": 0.4,
  "first_layer_line_width": 0.44,
  "perimeters": 3,
  "infill_density": 0.15,
  "infill_pattern": "gyroid",
  "support_type": "tree",
  "support_angle_threshold": 45,
  "support_interface_gap": 0.2,
  "brim_width": 0,
  "temperatures": {
    "hotend": 210,
    "bed": 60
  },
  "speeds": {
    "first_layer": 25,
    "perimeter": 45,
    "infill": 100,
    "support": 70,
    "bridge": 25,
    "travel": 200
  },
  "cooling": {
    "fan_first_layer": 0,
    "fan_normal": 255,
    "fan_bridge": 255
  },
  "retraction": {
    "length": 0.8,
    "speed": 40
  }
}
```
