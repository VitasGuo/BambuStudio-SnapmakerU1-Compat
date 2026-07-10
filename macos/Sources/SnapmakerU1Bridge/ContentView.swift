import AppKit
import SwiftUI

struct ContentView: View {
    @ObservedObject var model: AppModel

    private let columns = [
        GridItem(.flexible(minimum: 300), spacing: 16),
        GridItem(.flexible(minimum: 300), spacing: 16)
    ]

    var body: some View {
        ZStack {
            Color(NSColor.windowBackgroundColor).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    overallStatus
                    if let notice = model.notice {
                        NoticeView(notice: notice, onDismiss: model.dismissNotice, onRecover: model.recoverFromNotice)
                    }
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 16) {
                        installationCard
                        bridgeCard
                    }
                    printerCard
                    supportFooter
                }
                .padding(24)
                .frame(maxWidth: 980)
                .frame(maxWidth: .infinity)
            }

            if model.isBusy {
                Color.black.opacity(0.08).ignoresSafeArea()
                ProgressView("正在处理…")
                    .padding(.horizontal, 28)
                    .padding(.vertical, 20)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(12)
                    .shadow(radius: 12)
                    .accessibilityLabel("操作正在进行")
            }
        }
        .frame(minWidth: 760, minHeight: 680)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: "printer.fill")
                .font(.system(size: 28, weight: .semibold))
                .foregroundColor(.accentColor)
                .frame(width: 44, height: 44)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(AppConfiguration.productName)
                    .font(.system(size: 24, weight: .semibold))
                Text("Bambu Studio 与 Snapmaker U1 的本地连接助手")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Button(action: model.refresh) {
                Label("重新检测", systemImage: "arrow.clockwise")
                    .frame(minHeight: 44)
            }
            .disabled(model.isBusy)
            .accessibilityHint("重新检测 Bambu Studio、预设和 Bridge 状态")
        }
    }

    private var overallStatus: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: model.overallReady ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 22))
                .foregroundColor(model.overallReady ? .green : .orange)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(model.overallTitle)
                    .font(.headline)
                Text(model.overallDetail)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            StatusBadge(text: model.overallReady ? "可打印" : "待设置", tone: model.overallReady ? .success : .warning)
        }
        .padding(16)
        .background(Color(NSColor.controlBackgroundColor))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(model.overallReady ? Color.green.opacity(0.45) : Color.orange.opacity(0.5), lineWidth: 1)
        )
        .cornerRadius(12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("总体状态，\(model.overallTitle)。\(model.overallDetail)")
    }

    private var installationCard: some View {
        SectionCard(title: "Bambu Studio 与预设", systemImage: "shippingbox.fill") {
            VStack(alignment: .leading, spacing: 12) {
                statusRow(
                    title: "Bambu Studio",
                    detail: bambuVersionDetail,
                    isGood: model.bambuStudio?.isSupported == true
                )
                Divider()
                statusRow(
                    title: "Snapmaker U1 预设",
                    detail: model.profilesInstalled ? "已安装到当前用户目录" : "尚未安装",
                    isGood: model.profilesInstalled
                )
                HStack(spacing: 10) {
                    Button(action: model.installProfiles) {
                        Label(model.profilesInstalled ? "更新预设" : "安装预设", systemImage: "square.and.arrow.down")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(model.isBusy || model.bambuStudio?.isSupported != true)
                    .accessibilityHint("将 Snapmaker U1 预设安装到 Bambu Studio 用户目录，不会修改 BambuStudio.app")

                    Button(action: model.confirmAndUninstallProfiles) {
                        Label("卸载", systemImage: "trash")
                            .frame(minHeight: 44)
                    }
                    .disabled(model.isBusy || !model.profilesInstalled)
                    .accessibilityHint("移除本工具管理的预设并恢复安装前备份")
                }
                if model.bambuStudio?.isSupported != true {
                    Button(action: model.openSupportedBambuStudioRelease) {
                        Label("获取 Bambu Studio \(AppConfiguration.supportedBambuStudioDisplayVersion)", systemImage: "arrow.up.right.square")
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(LinkButtonStyle())
                    .accessibilityHint("在浏览器中打开官方 GitHub 发布页面")
                }
                Text("预设位于 ~/Library/Application Support/BambuStudio；官方 App 本体和代码签名不会被修改。")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var bridgeCard: some View {
        SectionCard(title: "Bridge 后台服务", systemImage: "bolt.horizontal.circle.fill") {
            VStack(alignment: .leading, spacing: 12) {
                statusRow(
                    title: "服务状态",
                    detail: bridgeStatusDetail,
                    isGood: model.bridgeStatus.reachable
                )
                statusRow(
                    title: "登录时启动",
                    detail: model.launchAgentInstalled
                        ? (model.launchAgentLoaded ? "已安装并已加载" : "已安装，当前未加载")
                        : "尚未安装",
                    isGood: model.launchAgentInstalled
                )
                HStack(spacing: 10) {
                    Button(action: model.installAndStartBridge) {
                        Label(model.runtimeInstalled ? "更新并启动" : "安装并启动", systemImage: "play.fill")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .disabled(model.isBusy)
                    .accessibilityHint("安装对应架构的运行时、创建用户登录启动项并启动 Bridge")

                    Button(action: model.stopBridge) {
                        Label("停止", systemImage: "stop.fill")
                            .frame(minHeight: 44)
                    }
                    .disabled(model.isBusy || !model.launchAgentLoaded)
                    .accessibilityHint("停止 Bridge，但保留登录启动项")
                }
                HStack(spacing: 10) {
                    Button(action: model.startBridge) {
                        Label("重新启动", systemImage: "arrow.clockwise")
                            .frame(minHeight: 44)
                    }
                    .disabled(model.isBusy || !model.runtimeInstalled)
                    Button(action: model.confirmAndRemoveLaunchAgent) {
                        Label("移除自启动", systemImage: "minus.circle")
                            .frame(minHeight: 44)
                    }
                    .disabled(model.isBusy || !model.launchAgentInstalled)
                }
            }
        }
    }

    private var printerCard: some View {
        SectionCard(title: "打印机连接", systemImage: "network") {
            VStack(alignment: .leading, spacing: 14) {
                statusRow(
                    title: "连接状态",
                    detail: printerConnectionDetail,
                    isGood: model.bridgeStatus.printerReachable
                )
                Divider()
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("打印机 IP 或主机名")
                            .font(.subheadline.weight(.medium))
                        TextField("例如 192.168.1.12", text: $model.printerHost)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .accessibilityLabel("打印机 IP 或主机名")
                            .accessibilityHint("不要输入 http 协议或路径")
                    }
                    .frame(maxWidth: .infinity)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Moonraker 端口")
                            .font(.subheadline.weight(.medium))
                        TextField("80", text: $model.printerPort)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .frame(width: 120)
                            .accessibilityLabel("Moonraker 端口")
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("API Key（可选）")
                            .font(.subheadline.weight(.medium))
                        SecureField(model.bridgeStatus.hasAPIKey ? "留空将清除现有密钥" : "未配置", text: $model.printerAPIKey)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .frame(minWidth: 190)
                            .accessibilityLabel("Moonraker API Key")
                            .accessibilityHint("留空会清除已经保存的密钥")
                    }
                }
                HStack(spacing: 10) {
                    Button(action: model.scanLocalNetwork) {
                        Label("扫描局域网", systemImage: "magnifyingglass")
                            .frame(minHeight: 44)
                    }
                    .disabled(model.isBusy)
                    .accessibilityHint("启动 Bridge 并扫描同一局域网中的 Snapmaker U1；不会自动保存")

                    Button(action: model.savePrinterConfiguration) {
                        Label("保存并连接", systemImage: "checkmark.circle")
                            .frame(minWidth: 130, minHeight: 44)
                    }
                    .disabled(model.isBusy || model.printerHost.trimmingCharacters(in: .whitespaces).isEmpty)
                    .keyboardShortcut(.defaultAction)
                    .accessibilityHint("保存打印机配置并让 Bridge 立即使用")

                    Button(action: model.openWebUI) {
                        Label("打开 WebUI", systemImage: "safari")
                            .frame(minHeight: 44)
                    }
                    .disabled(!model.bridgeStatus.reachable)
                    .accessibilityHint("在默认浏览器中打开本机 Bridge 控制页面")
                    Spacer()
                    StatusBadge(
                        text: printerConnectionBadgeText,
                        tone: model.bridgeStatus.printerReachable ? .success : .warning
                    )
                }
                Text("打印机应与 Mac 位于同一局域网。首次连接时 macOS 可能询问“本地网络”权限，请选择允许。")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
    }

    private var supportFooter: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            HStack(spacing: 12) {
                Button(action: model.openLog) {
                    Label("打开日志", systemImage: "doc.text")
                        .frame(minHeight: 44)
                }
                .accessibilityHint("打开 Bridge 日志；尚无日志时打开数据目录")
                Button(action: model.revealDataDirectory) {
                    Label("显示运行数据", systemImage: "folder")
                        .frame(minHeight: 44)
                }
                .accessibilityHint("在访达中显示配置、备份和日志目录")
                Spacer()
                Button(action: model.confirmAndFullyUninstall) {
                    Label("完整卸载", systemImage: "trash.fill")
                        .frame(minHeight: 44)
                        .foregroundColor(.red)
                }
                .disabled(model.isBusy)
                .accessibilityHint("停止服务、恢复原预设并删除运行数据；App 本体保留")
                Text("Bridge \(AppConfiguration.bridgeVersion) · macOS 11+")
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.secondary)
            }
            Text("恢复方式：预设卸载会恢复安装前备份；移除自启动不会删除打印机配置。")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var bambuVersionDetail: String {
        guard let bambu = model.bambuStudio else { return "未检测到" }
        return bambu.isSupported ? "\(bambu.version)（受支持）" : "\(bambu.version)（需要 \(AppConfiguration.supportedBambuStudioDisplayVersion)）"
    }

    private var bridgeStatusDetail: String {
        if model.bridgeStatus.reachable {
            return model.bridgeStatus.version.isEmpty ? "正在运行" : "正在运行 · v\(model.bridgeStatus.version)"
        }
        return model.runtimeInstalled ? "已安装，当前无响应" : "尚未安装"
    }

    private var printerConnectionBadgeText: String {
        guard !model.bridgeStatus.printerHost.isEmpty else { return "未配置打印机" }
        let endpoint = "\(model.bridgeStatus.printerHost):\(model.bridgeStatus.printerPort)"
        if model.bridgeStatus.printerReachable {
            let klippy = model.bridgeStatus.klippyState.isEmpty ? "已连接" : "Klippy \(model.bridgeStatus.klippyState)"
            return "\(klippy) · \(endpoint)"
        }
        return "已配置但离线 · \(endpoint)"
    }

    private var printerConnectionDetail: String {
        guard model.bridgeStatus.reachable else { return "Bridge 尚未运行" }
        guard !model.bridgeStatus.printerHost.isEmpty else { return "尚未配置打印机" }
        if model.bridgeStatus.printerReachable {
            var details = ["已连接 \(model.bridgeStatus.printerHost):\(model.bridgeStatus.printerPort)"]
            if !model.bridgeStatus.klippyState.isEmpty { details.append("Klippy \(model.bridgeStatus.klippyState)") }
            if !model.bridgeStatus.moonrakerVersion.isEmpty { details.append("Moonraker \(model.bridgeStatus.moonrakerVersion)") }
            return details.joined(separator: " · ")
        }
        let reason = model.bridgeStatus.error.isEmpty ? "请检查电源和局域网" : model.bridgeStatus.error
        return "已配置但打印机离线：\(reason)"
    }

    private func statusRow(title: String, detail: String, isGood: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: isGood ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .foregroundColor(isGood ? .green : .orange)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.medium))
                Text(detail)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title)，\(detail)")
    }
}

private struct SectionCard<Content: View>: View {
    let title: String
    let systemImage: String
    let content: Content

    init(title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.systemImage = systemImage
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .foregroundColor(.primary)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(Color(NSColor.controlBackgroundColor))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color(NSColor.separatorColor), lineWidth: 1)
        )
        .cornerRadius(12)
    }
}

private enum BadgeTone {
    case success
    case warning
    case neutral

    var color: Color {
        switch self {
        case .success: return .green
        case .warning: return .orange
        case .neutral: return .secondary
        }
    }
}

private struct StatusBadge: View {
    let text: String
    let tone: BadgeTone

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(tone.color)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            Text(text)
                .font(.caption.weight(.medium))
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .foregroundColor(tone.color)
        .background(tone.color.opacity(0.12))
        .cornerRadius(12)
        .accessibilityLabel("状态：\(text)")
    }
}

private struct NoticeView: View {
    let notice: AppNotice
    let onDismiss: () -> Void
    let onRecover: () -> Void

    private var color: Color {
        switch notice.tone {
        case .information: return .accentColor
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }

    private var icon: String {
        switch notice.tone {
        case .information: return "info.circle.fill"
        case .success: return "checkmark.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .error: return "xmark.octagon.fill"
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .foregroundColor(color)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(notice.title).font(.subheadline.weight(.semibold))
                Text(notice.detail)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if notice.recovery != nil {
                Button(recoveryTitle, action: onRecover)
                    .frame(minHeight: 44)
                    .accessibilityHint(recoveryHint)
            }
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(BorderlessButtonStyle())
            .accessibilityLabel("关闭消息")
        }
        .padding(12)
        .background(color.opacity(0.1))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(color.opacity(0.35), lineWidth: 1))
        .cornerRadius(10)
        .accessibilityElement(children: .contain)
    }

    private var recoveryTitle: String {
        notice.recovery == .scanNetwork ? "重新扫描" : "重新检测"
    }

    private var recoveryHint: String {
        notice.recovery == .scanNetwork ? "再次扫描局域网中的 Snapmaker U1" : "重新检测当前状态"
    }
}
