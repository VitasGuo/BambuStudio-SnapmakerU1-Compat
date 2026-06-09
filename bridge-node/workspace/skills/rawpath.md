## rawpath — RawPath 中间表示

### 描述

RawPath 是 CLI 工具 `voxelflow` 输出的切片中间表示，与耗材解耦，可二次生成 G-code。

### 设计理念

```
传统切片器: 模型 → G-code（耦合了耗材参数）
VoxelFlow:  模型 → RawPath（纯几何路径）→ G-code（注入耗材参数）

优势:
├── 同一 RawPath 可用不同耗材参数生成 G-code
├── AI 可基于 RawPath 精确生成 G-code（无需自行计算几何路径）
├── 便于 G-code 审查和修补（路径数据可追溯）
└── 支持参数化重切片（更换耗材无需重新切片）
```

### 数据结构

```json
{
  "metadata": {
    "model_name": "example.stl",
    "layer_height": 0.2,
    "total_layers": 500,
    "bounding_box": {
      "size": [100, 100, 100]
    }
  },
  "raw_paths": [
    {
      "layer": 0,
      "z_height": 0.28,
      "perimeters": [
        {
          "type": "external",
          "points": [[0,0], [100,0], [100,100], [0,100], [0,0]],
          "length": 400.0,
          "closed": true
        },
        {
          "type": "internal",
          "points": [[0.4,0.4], [99.6,0.4], [99.6,99.6], [0.4,99.6], [0.4,0.4]],
          "length": 396.8,
          "closed": true
        }
      ],
      "infill": [
        {
          "pattern": "gyroid",
          "density": 0.15,
          "segments": [
            {"start": [5,5], "end": [95,5], "length": 90.0},
            {"start": [5,10], "end": [95,10], "length": 90.0}
          ],
          "total_length": 12345.6
        }
      ],
      "support": null
    }
  ]
}
```

### RawPath → G-code 转换

```
对于 RawPath 中的每层:
  1. 写入层注释 ;LAYER:{layer}
  2. Z 轴移动到 z_height
  3. 遍历 perimeters:
     ├── external → 使用外墙速度 + 标准 E/mm
     └── internal → 使用内墙速度 + 标准 E/mm
  4. 遍历 infill segments:
     └── 使用填充速度 + 标准 E/mm
  5. 遍历 support segments（如有）:
     └── 使用支撑速度 + 标准 E/mm
  6. 层结束: 回抽 + Z 抬升
```

### 使用场景

| 场景 | 说明 |
|------|------|
| 更换耗材 | 同一 RawPath，修改温度/风扇/E值参数重新生成 G-code |
| 速度调整 | 同一 RawPath，修改速度参数重新生成 G-code |
| 质量调试 | 修改特定层参数后重新生成，无需完整重切片 |
| AI 辅助 | AI 读取 RawPath 理解路径结构，精确生成 G-code |
