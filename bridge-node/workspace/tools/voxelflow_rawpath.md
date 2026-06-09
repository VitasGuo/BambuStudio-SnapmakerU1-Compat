# voxelflow_rawpath — RawPath 数据解读工具

## 描述

RawPath 是 voxelflow CLI 切片输出的中间表示，包含每层的精确几何路径数据。它是你（AI）生成 G-code 的核心输入——你需要逐点解读这些坐标，计算段长度和 E 值，然后输出 G-code 指令。

## RawPath 完整数据结构

```json
{
  "raw_paths": [
    {
      "layer": 0,
      "z_height": 0.28,
      "perimeters": [
        {
          "type": "external",
          "points": [[10.0, 10.0], [30.0, 10.0], [30.0, 30.0], [10.0, 30.0], [10.0, 10.0]],
          "length": 80.0
        },
        {
          "type": "internal",
          "points": [[10.4, 10.4], [29.6, 10.4], [29.6, 29.6], [10.4, 29.6], [10.4, 10.4]],
          "length": 77.6
        }
      ],
      "infill": [
        {
          "pattern": "grid",
          "density": 0.15,
          "points": [[15.0, 10.4], [15.0, 29.6], [20.0, 10.4], [20.0, 29.6], [25.0, 10.4], [25.0, 29.6]],
          "length": 58.8
        }
      ],
      "support": []
    }
  ]
}
```

## 字段解读

### layer
- 类型: 整数，从 0 开始
- 含义: 层序号，0 = 首层
- 对应 Z 高度: `(layer + 1) × layer_height`（首层 layer=0 时 Z = layer_height）

### z_height
- 类型: 浮点数
- 含义: 该层的实际 Z 高度（mm）
- 首层可能比标准层高略高（如 0.28 vs 0.2）

### perimeters
- 类型: 数组
- 每项包含:
  - `type`: "external"（外墙）或 "internal"（内墙）
  - `points`: 闭合路径的坐标点序列 `[[x1,y1], [x2,y2], ...]`
  - `length`: 路径总长度（mm），可用于验证你的段长度计算

### infill
- 类型: 数组
- 每项包含:
  - `pattern`: 填充图案（grid/gyroid/lines/triangles）
  - `density`: 填充密度（0-1）
  - `points`: 填充线段的坐标点（成对出现，每对为一条线段）
  - `length`: 填充线段总长度

### support
- 类型: 数组
- 每项包含:
  - `type`: "tree" 或 "linear"
  - `points`: 支撑路径坐标点
  - `length`: 支撑路径总长度

## 坐标解读规则

### 闭合路径（perimeters）
- 首尾点相同 → 闭合轮廓
- 解读: 从 points[0] 开始，依次连接到 points[1], points[2], ..., 回到 points[0]
- 每相邻两点之间是一条直线段

### 线段路径（infill）
- 填充线段成对出现: points[0]→points[1] 是一条线，points[2]→points[3] 是另一条线
- 两条线之间是旅行移动（G0，不挤出）

### 路径间切换
- 同一 perimeter 内: 连续 G1（挤出移动）
- 不同 perimeter 之间: G0（旅行移动）+ 回抽
- perimeter → infill: G0 + 回抽
- infill → support: G0 + 回抽

## 从 RawPath 生成 G-code 的核心算法

```
对于每个 layer:
  1. 输出层注释: ;LAYER:{layer}
  2. Z 轴移动: G0 Z{z_height} F300

  对于每个 perimeter:
    3. 旅行到起点: G0 X{points[0][0]} Y{points[0][1]}
    4. 取消回抽: G1 E{E + retract_length} F{retract_speed * 60}
    5. 逐点生成:
       FOR i = 1 TO points.length - 1:
         seg_len = √((points[i][0] - points[i-1][0])² + (points[i][1] - points[i-1][1])²)
         E += seg_len × E_per_mm
         speed = get_speed(perimeter.type, layer)
         输出: G1 X{points[i][0]} Y{points[i][1]} E{round(E,3)} F{speed * 60}
    6. 回抽: G1 E{E - retract_length} F{retract_speed * 60}

  对于每个 infill:
    7. 旅行到第一条线段起点: G0 X{points[0][0]} Y{points[0][1]}
    8. 取消回抽
    9. 成对处理线段:
       FOR i = 0 TO points.length - 1 STEP 2:
         seg_len = √((points[i+1][0] - points[i][0])² + (points[i+1][1] - points[i][1])²)
         E += seg_len × E_per_mm
         输出: G1 X{points[i+1][0]} Y{points[i+1][1]} E{round(E,3)} F{infill_speed * 60}
         IF i + 2 < points.length:
           回抽 + 旅行到下一条线段起点 + 取消回抽

  对于每个 support:
    10. 同 perimeter 处理逻辑
```

## 验证方法

生成 G-code 后，用 RawPath 的 `length` 字段验证你的计算:

```
你的总路径长度 = Σ(所有段长度)
RawPath.length ≈ 你的总路径长度（允许 1% 误差）

你的总 E 值 ≈ RawPath.length × E_per_mm
```

如果偏差超过 5%，说明计算有误，需要逐段检查。
