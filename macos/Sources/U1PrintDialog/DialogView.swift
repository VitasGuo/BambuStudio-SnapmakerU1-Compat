import AppKit
import SwiftUI

struct DialogView: View {
    let input: DialogInput
    let onConfirm: (DialogOutput) -> Void
    let onCancel: () -> Void

    @State private var mappings: [Int]
    @State private var bedLeveling: Bool
    @State private var flowCalibration: Bool
    @State private var timelapse: Bool

    init(input: DialogInput, onConfirm: @escaping (DialogOutput) -> Void, onCancel: @escaping () -> Void) {
        self.input = input
        self.onConfirm = onConfirm
        self.onCancel = onCancel
        _mappings = State(initialValue: input.mappings)
        _bedLeveling = State(initialValue: input.bedLeveling)
        _flowCalibration = State(initialValue: input.flowCalibration)
        _timelapse = State(initialValue: input.timelapse)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    mappingSection
                    optionsSection
                }
                .padding(20)
            }
            Divider()
            footer
        }
        .frame(width: 640, height: 570)
        .background(Color(NSColor.windowBackgroundColor))
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "printer.fill")
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.accentColor)
                .frame(width: 40, height: 40)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text("确认打印")
                    .font(.title2.weight(.semibold))
                Text(input.filename)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .help(input.filename)
                    .accessibilityLabel("打印文件：\(input.filename)")
            }
            Spacer()
        }
        .padding(20)
    }

    private var mappingSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("四色槽位映射")
                .font(.headline)
            Text("为切片文件中的每个耗材指定 U1 的实际槽位。")
                .font(.caption)
                .foregroundColor(.secondary)
            VStack(spacing: 8) {
                ForEach(input.visibleGCodeFilaments) { filament in
                    mappingRow(filament)
                }
            }
            if let metadataError = input.usageMetadataError {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "xmark.octagon.fill")
                        .foregroundColor(.red)
                        .accessibilityHidden(true)
                    Text("无法安全确认耗材：\(metadataError)。请取消并从 Bambu Studio 重新发起打印。")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.red)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("无法开始打印：\(metadataError)。请取消并重新发起打印")
            }
            if input.usageMetadataError == nil && !hasCompleteMappings {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                        .accessibilityHidden(true)
                    Text("所有已使用耗材都必须选择物理槽位")
                        .font(.caption.weight(.medium))
                        .foregroundColor(.orange)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("映射不完整：所有已使用耗材都必须选择物理槽位")
            }
            if !emptyMappedMachineSlots.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "xmark.octagon.fill")
                        .foregroundColor(.red)
                        .accessibilityHidden(true)
                    Text(emptySlotWarning)
                        .font(.caption.weight(.medium))
                        .foregroundColor(.red)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("物理槽位为空：\(emptySlotWarning)")
            }
        }
    }

    private func mappingRow(_ filament: GCodeFilament) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(color(from: filament.color))
                    .frame(width: 18, height: 18)
                Circle()
                    .stroke(Color.primary.opacity(0.35), lineWidth: 1)
                    .frame(width: 18, height: 18)
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("G-code 耗材 \(filament.id + 1) · \(filament.displayName)")
                    .font(.subheadline.weight(.medium))
                Text(filament.color.isEmpty ? "颜色未标注" : "颜色 \(filament.color)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer(minLength: 8)
            Picker("映射到", selection: mappingBinding(for: filament.id)) {
                Text("不使用").tag(-1)
                ForEach(0..<4, id: \.self) { slot in
                    Text(physicalSlotLabel(slot)).tag(slot)
                }
            }
            .labelsHidden()
            .frame(width: 220)
            .accessibilityLabel("模型耗材 \(filament.id + 1) 映射槽位")
            .accessibilityValue(mappings[filament.id] < 0 ? "不使用" : "U1 槽位 \(mappings[filament.id] + 1)")
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 58)
        .background(Color(NSColor.controlBackgroundColor))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(NSColor.separatorColor), lineWidth: 1))
        .cornerRadius(8)
        .accessibilityElement(children: .contain)
    }

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("打印选项")
                .font(.headline)
            VStack(alignment: .leading, spacing: 6) {
                optionToggle("自动调平", detail: "打印前执行热床网格调平", value: $bedLeveling)
                optionToggle("流量校准", detail: "打印前执行耗材流量校准", value: $flowCalibration)
                optionToggle("延时摄影", detail: "打印期间记录延时摄影", value: $timelapse)
            }
        }
    }

    private func optionToggle(_ title: String, detail: String, value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(detail).font(.caption).foregroundColor(.secondary)
            }
        }
        .toggleStyle(SwitchToggleStyle())
        .frame(minHeight: 44)
        .accessibilityLabel(title)
        .accessibilityHint(detail)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Text("确认后打印任务会立即发送到 Snapmaker U1。")
                .font(.caption)
                .foregroundColor(.secondary)
            Spacer()
            Button("取消", action: onCancel)
                .frame(minWidth: 82, minHeight: 44)
                .keyboardShortcut(.cancelAction)
                .accessibilityHint("关闭窗口且不开始打印")
            Button(action: confirm) {
                Label("开始打印", systemImage: "play.fill")
                    .frame(minWidth: 110, minHeight: 44)
            }
            .keyboardShortcut(.defaultAction)
            .disabled(!canConfirm)
            .accessibilityHint(confirmAccessibilityHint)
        }
        .padding(16)
    }

    private func mappingBinding(for index: Int) -> Binding<Int> {
        Binding(
            get: { mappings[index] },
            set: { mappings[index] = $0 }
        )
    }

    private func physicalSlotLabel(_ slot: Int) -> String {
        let filament = input.machineFilaments[slot]
        let state = filament.loaded ? "已装载" : "空"
        return "U1 槽位 \(slot + 1) · \(filament.displayName) · \(state)"
    }

    private var hasCompleteMappings: Bool {
        !input.usedLogicalSlots.isEmpty && input.usedLogicalSlots.allSatisfy { index in
            mappings.indices.contains(index) && mappings[index] >= 0
        }
    }

    private var emptyMappedMachineSlots: [Int] {
        Array(Set(input.usedLogicalSlots.compactMap { index -> Int? in
            guard mappings.indices.contains(index) else { return nil }
            let slot = mappings[index]
            guard (0..<input.machineFilaments.count).contains(slot),
                  !input.machineFilaments[slot].loaded else { return nil }
            return slot
        })).sorted()
    }

    private var emptySlotWarning: String {
        let slots = emptyMappedMachineSlots.map { "U1 槽位 \($0 + 1)" }.joined(separator: "、")
        return "\(slots) 为空，请选择已装载耗材的物理槽位"
    }

    private var canConfirm: Bool {
        input.canConfirmPrint(using: mappings)
    }

    private var confirmAccessibilityHint: String {
        if let metadataError = input.usageMetadataError {
            return "无法开始打印：\(metadataError)。请取消并重新发起打印"
        }
        if !hasCompleteMappings { return "所有已使用耗材都必须选择物理槽位" }
        if !emptyMappedMachineSlots.isEmpty { return emptySlotWarning }
        return "按当前槽位映射和选项开始打印"
    }

    private func color(from value: String) -> Color {
        let fallback = Color.secondary.opacity(0.35)
        guard value.hasPrefix("#") else { return fallback }
        let text = String(value.dropFirst().prefix(6))
        guard text.count == 6, let number = UInt64(text, radix: 16) else { return fallback }
        return Color(
            red: Double((number >> 16) & 0xFF) / 255,
            green: Double((number >> 8) & 0xFF) / 255,
            blue: Double(number & 0xFF) / 255
        )
    }

    private func confirm() {
        // `.disabled` protects the UI, and this guard protects against any
        // future programmatic invocation or focus/keyboard regression.
        guard canConfirm else { return }
        onConfirm(DialogOutput(
            confirmed: true,
            mappings: mappings,
            usedLogicalSlots: input.usedLogicalSlots,
            bedLeveling: bedLeveling,
            flowCalibration: flowCalibration,
            timelapse: timelapse
        ))
    }
}
