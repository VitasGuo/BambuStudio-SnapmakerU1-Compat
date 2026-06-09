# voxelflow_analyze — 模型分析工具

## 描述
CLI 工具 `voxelflow --analyze-only` 用于分析 STL/3MF 模型文件，输出模型几何特征 JSON。

## 调用方式
```bash
voxelflow --analyze-only -i <model_path>
```

## 输入
- model_path: STL 或 3MF 文件路径

## 输出
JSON 格式的模型分析结果，包含：
- bounding_box: 包围盒 {min, max, size}
- facets: 面片信息 {total, degenerate}
- volume: 体积 (mm³)
- surface_area: 表面积 (mm²)
- overhang_analysis: 悬垂分析 {max_angle, overhang_area_ratio, critical_regions}
- thin_wall_analysis: 薄壁分析 {min_thickness, thin_area_ratio}
- bridge_analysis: 桥接分析 {max_bridge_length, bridge_area_ratio}
- orientation_suggestion: 定向建议 {optimal_rotation, reason}

## 约束
- 输出为 JSON 格式，必须通过 JSON.parse 解析
- 3MF 文件自动识别并输出多色信息
- 大文件（>100MB）分析可能需要较长时间
