import AppKit
import Combine
import Foundation

enum NoticeTone {
    case information
    case success
    case warning
    case error
}

enum NoticeRecovery: Equatable {
    case refresh
    case scanNetwork
}

struct AppNotice: Equatable {
    let tone: NoticeTone
    let title: String
    let detail: String
    var recovery: NoticeRecovery? = nil
}

final class AppModel: ObservableObject {
    @Published var bambuStudio: BambuStudioInstallation?
    @Published var profilesInstalled = false
    @Published var runtimeInstalled = false
    @Published var launchAgentInstalled = false
    @Published var launchAgentLoaded = false
    @Published var bridgeStatus = BridgeStatus()
    @Published var printerHost = ""
    @Published var printerPort = "80"
    @Published var printerAPIKey = ""
    @Published var isBusy = false
    @Published var notice: AppNotice?

    private var refreshTimer: Timer?
    private var populatedPrinterFields = false

    init() {
        refresh()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 6, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    deinit {
        refreshTimer?.invalidate()
    }

    var overallReady: Bool {
        bambuStudio?.isSupported == true
            && profilesInstalled
            && bridgeStatus.reachable
            && bridgeStatus.printerReachable
    }

    var overallTitle: String {
        if overallReady { return "已就绪" }
        if let bambuStudio, !bambuStudio.isSupported { return "Bambu Studio 版本不兼容" }
        if bambuStudio == nil { return "需要安装 Bambu Studio" }
        return "需要完成设置"
    }

    var overallDetail: String {
        if overallReady {
            return "预设、后台 Bridge 和打印机连接均已配置。"
        }
        if let bambuStudio, !bambuStudio.isSupported {
            return "检测到 \(bambuStudio.version)，请安装 \(AppConfiguration.supportedBambuStudioDisplayVersion) 后再安装预设。"
        }
        if bambuStudio == nil {
            return "未检测到 Bambu Studio \(AppConfiguration.supportedBambuStudioDisplayVersion)。"
        }
        if !profilesInstalled { return "请安装 Snapmaker U1 用户预设。" }
        if !bridgeStatus.reachable { return "请安装并启动 Bridge 后台服务。" }
        if bridgeStatus.printerHost.isEmpty { return "请填写并保存打印机地址。" }
        if !bridgeStatus.printerReachable {
            return "打印机已配置，但当前无法连接。请检查打印机电源和局域网。"
        }
        return "请检查下方状态。"
    }

    func refresh() {
        let detectedBambu = BambuStudioInstallation.detect()
        let detectedProfiles = ProfileInstaller.isInstalled
        let detectedRuntime = BridgeRuntimeInstaller.isInstalled
        let detectedAgent = LaunchAgentManager.isInstalled
        let detectedLoaded = LaunchAgentManager.isLoaded
        DispatchQueue.main.async { [weak self] in
            self?.bambuStudio = detectedBambu
            self?.profilesInstalled = detectedProfiles
            self?.runtimeInstalled = detectedRuntime
            self?.launchAgentInstalled = detectedAgent
            self?.launchAgentLoaded = detectedLoaded
        }

        DispatchQueue.global(qos: .utility).async { [weak self] in
            let status = BridgeClient.fetchStatus()
            DispatchQueue.main.async {
                guard let self else { return }
                self.bridgeStatus = status
                if status.reachable, !self.populatedPrinterFields {
                    self.printerHost = status.printerHost
                    self.printerPort = String(status.printerPort)
                    self.populatedPrinterFields = true
                }
            }
        }
    }

    func installProfiles() {
        perform(successTitle: "预设已安装", recoveryDetail: "如果 Bambu Studio 正在运行，请退出并重新打开它。") {
            try ProfileInstaller.install()
        }
    }

    func confirmAndUninstallProfiles() {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "卸载 Snapmaker U1 预设？"
        alert.informativeText = "只会移除此 App 管理的文件；安装前已有的 Snapmaker 预设会从备份恢复。"
        alert.addButton(withTitle: "卸载")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        perform(successTitle: "预设已卸载", recoveryDetail: "原有预设（如有）已经恢复。") {
            try ProfileInstaller.uninstall()
        }
    }

    func installAndStartBridge() {
        perform(successTitle: "Bridge 已安装并启动", recoveryDetail: "后台服务会在登录后自动运行。") {
            try LaunchAgentManager.installAndStart()
            Thread.sleep(forTimeInterval: 1)
        }
    }

    func startBridge() {
        perform(successTitle: "Bridge 已启动", recoveryDetail: "如果状态仍显示离线，请稍候并重新检测。") {
            try LaunchAgentManager.start()
            Thread.sleep(forTimeInterval: 1)
        }
    }

    func stopBridge() {
        perform(successTitle: "Bridge 已停止", recoveryDetail: "登录启动项仍然保留，可随时重新启动。") {
            try LaunchAgentManager.stop()
        }
    }

    func confirmAndRemoveLaunchAgent() {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "移除登录启动项？"
        alert.informativeText = "Bridge 会立即停止。已安装的运行时、预设和打印机配置不会删除。"
        alert.addButton(withTitle: "移除")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        perform(successTitle: "登录启动项已移除", recoveryDetail: "运行时和配置仍保留在 Application Support。") {
            try LaunchAgentManager.remove()
        }
    }

    func confirmAndFullyUninstall() {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "完整卸载 Snapmaker U1 Bridge？"
        alert.informativeText = "将停止并移除登录启动项，恢复安装前的 Bambu Studio 预设，然后删除运行时、打印机配置和日志。App 本体会保留，可稍后拖入废纸篓。"
        alert.addButton(withTitle: "完整卸载")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        perform(successTitle: "已完整卸载", recoveryDetail: "后台服务、预设和运行数据已移除。如不再使用，可将 App 拖入废纸篓。") {
            try FullUninstaller.uninstall()
        }
    }

    func savePrinterConfiguration() {
        let host = printerHost
        let port = printerPort
        let key = printerAPIKey
        perform(successTitle: "打印机配置已保存", recoveryDetail: "Bridge 会立即使用新的 Moonraker 地址。") {
            if !BridgeClient.fetchStatus().reachable {
                try LaunchAgentManager.start()
                Thread.sleep(forTimeInterval: 1.5)
            }
            try BridgeClient.savePrinter(host: host, portText: port, apiKey: key)
        }
    }

    func scanLocalNetwork() {
        guard !isBusy else { return }
        isBusy = true
        notice = nil
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                if !BridgeClient.fetchStatus().reachable {
                    try LaunchAgentManager.start()
                    Thread.sleep(forTimeInterval: 1.5)
                }
                let printers = try BridgeClient.scanPrinters(timeout: 3)
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.isBusy = false
                    if printers.isEmpty {
                        self.notice = AppNotice(
                            tone: .warning,
                            title: "未发现打印机",
                            detail: BridgeServiceError.noPrintersFound.errorDescription ?? "请检查局域网后重新扫描。",
                            recovery: .scanNetwork
                        )
                    } else if printers.count == 1, let printer = printers.first {
                        self.applyDiscoveredPrinter(printer)
                    } else {
                        self.presentPrinterPicker(printers)
                    }
                    self.refresh()
                }
            } catch {
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.isBusy = false
                    self.notice = AppNotice(
                        tone: .error,
                        title: "扫描失败",
                        detail: (error as? LocalizedError)?.errorDescription ?? error.localizedDescription,
                        recovery: .scanNetwork
                    )
                    self.refresh()
                }
            }
        }
    }

    func openWebUI() {
        guard let url = URL(string: "http://127.0.0.1:\(AppConfiguration.bridgePort)") else { return }
        NSWorkspace.shared.open(url)
    }

    func openLog() {
        if FileManager.default.fileExists(atPath: AppPaths.bridgeLog.path) {
            NSWorkspace.shared.open(AppPaths.bridgeLog)
        } else if FileManager.default.fileExists(atPath: AppPaths.launchAgentLog.path) {
            NSWorkspace.shared.open(AppPaths.launchAgentLog)
        } else {
            revealDataDirectory()
            notice = AppNotice(
                tone: .information,
                title: "尚无日志文件",
                detail: "已打开运行数据目录。启动 Bridge 后会自动生成日志。"
            )
        }
    }

    func revealDataDirectory() {
        try? FileTools.ensureDirectory(AppPaths.dataRoot)
        NSWorkspace.shared.activateFileViewerSelecting([AppPaths.dataRoot])
    }

    func openSupportedBambuStudioRelease() {
        guard let url = URL(string: "https://github.com/bambulab/BambuStudio/releases/tag/v02.07.01.62") else { return }
        NSWorkspace.shared.open(url)
    }

    func dismissNotice() {
        notice = nil
    }

    func recoverFromNotice() {
        let recovery = notice?.recovery
        notice = nil
        switch recovery {
        case .scanNetwork: scanLocalNetwork()
        case .refresh: refresh()
        case .none: break
        }
    }

    private func applyDiscoveredPrinter(_ printer: DiscoveredPrinter) {
        printerHost = printer.host
        printerPort = String(printer.port)
        populatedPrinterFields = true
        notice = AppNotice(
            tone: .success,
            title: "已选择 \(printer.name)",
            detail: "已填入 \(printer.host):\(printer.port)。请检查后点击“保存并连接”。"
        )
    }

    private func presentPrinterPicker(_ printers: [DiscoveredPrinter]) {
        let picker = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 360, height: 32), pullsDown: false)
        picker.addItems(withTitles: printers.map { "\($0.name)  —  \($0.host):\($0.port)" })
        picker.setAccessibilityLabel("选择扫描到的 Snapmaker 打印机")

        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "发现 \(printers.count) 台打印机"
        alert.informativeText = "选择要配置的 Snapmaker U1。选择后仍需点击“保存并连接”。"
        alert.accessoryView = picker
        alert.addButton(withTitle: "选择")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let index = picker.indexOfSelectedItem
        guard printers.indices.contains(index) else { return }
        applyDiscoveredPrinter(printers[index])
    }

    private func perform(successTitle: String, recoveryDetail: String, operation: @escaping () throws -> Void) {
        guard !isBusy else { return }
        isBusy = true
        notice = nil
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                try operation()
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.isBusy = false
                    self.notice = AppNotice(tone: .success, title: successTitle, detail: recoveryDetail)
                    self.refresh()
                }
            } catch {
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.isBusy = false
                    self.notice = AppNotice(
                        tone: .error,
                        title: "操作失败",
                        detail: (error as? LocalizedError)?.errorDescription ?? error.localizedDescription,
                        recovery: .refresh
                    )
                    self.refresh()
                }
            }
        }
    }
}
