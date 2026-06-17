## patch_gcode — G-code 修补

### 描述

对 G-code 进行局部修改，支持 5 种操作类型。

### 操作类型

#### 5.1 替换速度（replace_speed）

```
目标: 修改指定行或范围的速度值
格式: patch_gcode --operation replace_speed --target "F1500" --replacement "F1200" --range "L10-L50"
说明: 将第 10-50 行中 F1500 替换为 F1200

使用场景:
- 首层速度过快
- 特定区域需要降速（悬垂、桥接）
- 用户手动调整速度
```

#### 5.2 添加回抽（add_retract）

```
目标: 在指定位置前插入回抽指令
格式: patch_gcode --operation add_retract --before "LAYER:5" --length 0.8 --speed 40
说明: 在 LAYER:5 注释前插入回抽

插入内容:
  G1 E{current_E - 0.8} F2400  ; 回抽 0.8mm
  G0 Z{current_Z + 0.4} F300   ; Z 抬升
  ; [旅行移动]
  G0 Z{target_Z} F300           ; Z 下降
  G1 E{current_E} F2400         ; 恢复挤出

使用场景:
- 长距离旅行前缺少回抽
- 层间旅行缺少回抽
- 拉丝问题修复
```

#### 5.3 修改温度（modify_temperature）

```
目标: 修改热端或热床温度
格式: patch_gcode --operation modify_temperature --type hotend --value 215 --position start
说明: 将 Start G-code 中的热端温度修改为 215°C

使用场景:
- 耗材温度微调
- 首层温度调整
- 打印质量问题调试
```

#### 5.4 修改风扇（replace_fan）

```
目标: 修改风扇速度
格式: patch_gcode --operation replace_fan --value 128 --range "L10-L100"
说明: 将第 10-100 行范围内的风扇速度修改为 128（50%）

使用场景:
- 风扇速度调整
- 特定层风扇策略修改
- 过度冷却问题修复
```

#### 5.5 插入命令（insert_line）

```
目标: 在指定位置插入 G-code 指令
格式: patch_gcode --operation insert_line --command "M106 S255" --after "LAYER:3"
说明: 在 LAYER:3 注释后插入 M106 S255

使用场景:
- 添加自定义指令
- 插入暂停指令（M0/M25）
- 添加自定义标记
```

### 修补规则

1. 修补操作不改变行号顺序，仅修改或插入内容
2. 插入操作后，后续行号自动偏移
3. E 值修改时，必须重新计算后续所有 E 值
4. 速度修改时，F 值单位必须为 mm/min
5. 每次修补后应重新执行 `review_gcode` 验证
