# voxelflow_slice — 切片工具

## 描述
CLI 工具 `voxelflow` 执行完整切片，输出 RawPath（精确几何路径）和基础 G-code。

## 调用方式
```bash
voxelflow -i <model_path> -o <output_path> [options]
```

## 参数
| 参数 | 说明 | 默认值 |
|------|------|--------|
| --layer-height | 层高 (mm) | 0.2 |
| --walls | 壁数 | 2 |
| --infill | 填充密度 (0-1) | 0.15 |
| --speed | 打印速度 (mm/s) | 60 |
| --printer | 打印机配置 | snapmaker_u1 |
| --filament | 耗材类型 | - |
| --save-rawpath | 保存 RawPath 到指定路径 | - |

## 输出
- RawPath: 切片中间表示（与耗材解耦的精确路径数据）
- G-code: 基础 G-code 输出

## 约束
- RawPath 是精确的几何路径数据，AI 不需要自行计算路径
- 同一 RawPath 可用不同耗材参数重新生成 G-code
- 支撑路径由 CLI 生成，AI 不直接生成支撑路径
