import Foundation

enum BridgeServiceError: LocalizedError {
    case payloadMissing(String)
    case invalidPrinterHost
    case invalidPrinterPort
    case bridgeUnavailable
    case noPrintersFound
    case scanFailed(String)
    case configurationRejected(String)
    case commandFailed(String)

    var errorDescription: String? {
        switch self {
        case .payloadMissing(let name):
            return "安装包缺少后台组件：\(name)。请重新下载完整 DMG。"
        case .invalidPrinterHost:
            return "打印机地址不能为空，且不能包含协议、路径或空格。"
        case .invalidPrinterPort:
            return "Moonraker 端口必须是 1–65535 的整数。"
        case .bridgeUnavailable:
            return "Bridge 尚未响应。请确认后台服务已经启动后重试。"
        case .noPrintersFound:
            return "未在局域网中发现 Snapmaker U1。请确认打印机已开机、Mac 与打印机位于同一网络，并允许本 App 访问本地网络后重新扫描。"
        case .scanFailed(let reason):
            return "局域网扫描失败：\(reason)"
        case .configurationRejected(let reason):
            return "Bridge 未保存配置：\(reason)"
        case .commandFailed(let reason):
            return reason
        }
    }
}

struct BridgeStatus: Equatable {
    var reachable = false
    var version = ""
    var printerHost = ""
    var printerPort = 80
    var hasAPIKey = false
    var printerReachable = false
    var klippyState = ""
    var moonrakerVersion = ""
    var error = ""
}

struct DiscoveredPrinter: Equatable {
    let name: String
    let host: String
    let port: Int
}

enum BridgeRuntimeInstaller {
    private static let fileManager = FileManager.default

    static var isInstalled: Bool {
        fileManager.isExecutableFile(atPath: AppPaths.nodeExecutable.path)
            && fileManager.fileExists(atPath: AppPaths.bridgeEntryPoint.path)
    }

    static func installOrUpdate() throws {
        guard let payload = AppPaths.payloadRoot else {
            throw BridgeServiceError.payloadMissing("Payload")
        }
        let runtimeSource = payload.appendingPathComponent("runtime", isDirectory: true)
        let bridgeSource = payload.appendingPathComponent("bridge-node", isDirectory: true)
        guard fileManager.fileExists(atPath: runtimeSource.path) else {
            throw BridgeServiceError.payloadMissing("runtime/")
        }
        guard fileManager.fileExists(atPath: bridgeSource.appendingPathComponent("server.js").path) else {
            throw BridgeServiceError.payloadMissing("bridge-node/server.js")
        }
        guard let helper = AppPaths.bundledDialogHelper else {
            throw BridgeServiceError.payloadMissing("SnapmakerU1DialogHelper")
        }

        try FileTools.ensureDirectory(AppPaths.dataRoot)
        try FileTools.ensureDirectory(AppPaths.dataRoot.appendingPathComponent("logs", isDirectory: true))
        try FileTools.ensureDirectory(AppPaths.dataRoot.appendingPathComponent("config", isDirectory: true))
        try FileTools.ensureDirectory(AppPaths.dataRoot.appendingPathComponent("bin", isDirectory: true))

        let transactionRoot = AppPaths.dataRoot
            .appendingPathComponent("tmp/runtime-\(UUID().uuidString)", isDirectory: true)
        let stagedBridge = transactionRoot.appendingPathComponent("prepared-bridge", isDirectory: true)
        let rollbackRoot = transactionRoot.appendingPathComponent("rollback", isDirectory: true)
        try FileTools.ensureDirectory(transactionRoot)
        try FileTools.ensureDirectory(rollbackRoot)
        defer { try? FileTools.removeIfPresent(transactionRoot) }
        try fileManager.copyItem(at: bridgeSource, to: stagedBridge)

        let webCandidates = [
            payload.appendingPathComponent("bridge/web", isDirectory: true),
            payload.appendingPathComponent("web", isDirectory: true)
        ]
        if let web = webCandidates.first(where: { fileManager.fileExists(atPath: $0.appendingPathComponent("webui.html").path) }) {
            let destination = stagedBridge.appendingPathComponent("web", isDirectory: true)
            try FileTools.removeIfPresent(destination)
            try fileManager.copyItem(at: web, to: destination)
        }

        let destinations = [
            AppPaths.dataRoot.appendingPathComponent("runtime", isDirectory: true),
            AppPaths.bridgeDirectory,
            AppPaths.installedDialogHelper
        ]
        try snapshot(destinations, into: rollbackRoot)
        do {
            try FileTools.copyAtomically(from: runtimeSource, to: destinations[0])
            try FileTools.copyAtomically(from: stagedBridge, to: destinations[1])
            try FileTools.setExecutable(AppPaths.nodeExecutable)
            try FileTools.copyAtomically(from: helper, to: destinations[2])
            try FileTools.setExecutable(AppPaths.installedDialogHelper)
        } catch {
            try? restoreSnapshot(from: rollbackRoot, destinations: destinations)
            throw error
        }
    }

    private static func snapshot(_ destinations: [URL], into root: URL) throws {
        for (index, destination) in destinations.enumerated() where fileManager.fileExists(atPath: destination.path) {
            try fileManager.copyItem(at: destination, to: root.appendingPathComponent(String(index)))
        }
    }

    private static func restoreSnapshot(from root: URL, destinations: [URL]) throws {
        for (index, destination) in destinations.enumerated() {
            try FileTools.removeIfPresent(destination)
            let backup = root.appendingPathComponent(String(index))
            if fileManager.fileExists(atPath: backup.path) {
                try FileTools.copyAtomically(from: backup, to: destination)
            }
        }
    }
}

enum LaunchAgentManager {
    private static let fileManager = FileManager.default

    static var isInstalled: Bool {
        fileManager.fileExists(atPath: AppPaths.launchAgent.path)
    }

    static var isLoaded: Bool {
        let domain = "gui/\(getuid())/\(AppConfiguration.launchAgentLabel)"
        guard let result = try? ProcessRunner.run("/bin/launchctl", arguments: ["print", domain]) else { return false }
        return result.status == 0
    }

    static func installAndStart() throws {
        let wasLoaded = isLoaded
        if wasLoaded { try bootOut() }
        do {
            try BridgeRuntimeInstaller.installOrUpdate()
            try writeLaunchAgent()
            try bootstrapAndKickstart()
        } catch {
            // The runtime installer restores its prior snapshot on copy failure.
            // For upgrades, make a best effort to put the available service online.
            if wasLoaded, isInstalled, BridgeRuntimeInstaller.isInstalled {
                if isLoaded { try? bootOut() }
                try? bootstrapAndKickstart()
            }
            throw error
        }
    }

    static func start() throws {
        if !BridgeRuntimeInstaller.isInstalled || !isInstalled {
            try installAndStart()
            return
        }
        let domain = "gui/\(getuid())"
        if !isLoaded {
            let bootstrap = try ProcessRunner.run("/bin/launchctl", arguments: ["bootstrap", domain, AppPaths.launchAgent.path])
            guard bootstrap.status == 0 else {
                throw BridgeServiceError.commandFailed("无法加载 Bridge：\(cleanError(bootstrap))")
            }
        }
        let result = try ProcessRunner.run(
            "/bin/launchctl",
            arguments: ["kickstart", "-k", "\(domain)/\(AppConfiguration.launchAgentLabel)"]
        )
        guard result.status == 0 else {
            throw BridgeServiceError.commandFailed("无法启动 Bridge：\(cleanError(result))")
        }
    }

    static func stop() throws {
        guard isLoaded else { return }
        try bootOut()
    }

    static func remove() throws {
        if isLoaded { try bootOut() }
        try FileTools.removeIfPresent(AppPaths.launchAgent)
    }

    private static func bootOut() throws {
        let target = "gui/\(getuid())/\(AppConfiguration.launchAgentLabel)"
        let result = try ProcessRunner.run("/bin/launchctl", arguments: ["bootout", target])
        if result.status != 0, isLoaded {
            throw BridgeServiceError.commandFailed("无法停止 Bridge：\(cleanError(result))")
        }
    }

    private static func writeLaunchAgent() throws {
        try FileTools.ensureDirectory(AppPaths.launchAgent.deletingLastPathComponent())
        try FileTools.ensureDirectory(AppPaths.launchAgentLog.deletingLastPathComponent())
        let environment: [String: String] = [
            "HOME": AppPaths.home.path,
            "PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
            "U1_BRIDGE_DATA_DIR": AppPaths.dataRoot.path,
            "SNAPMAKER_U1_BRIDGE_HOME": AppPaths.dataRoot.path,
            "U1_DIALOG_HELPER": AppPaths.installedDialogHelper.path
        ]
        let plist: [String: Any] = [
            "Label": AppConfiguration.launchAgentLabel,
            "ProgramArguments": [AppPaths.nodeExecutable.path, AppPaths.bridgeEntryPoint.path],
            "WorkingDirectory": AppPaths.bridgeDirectory.path,
            "RunAtLoad": true,
            "KeepAlive": ["SuccessfulExit": false],
            "ThrottleInterval": 10,
            "ProcessType": "Interactive",
            "EnvironmentVariables": environment,
            "StandardOutPath": AppPaths.launchAgentLog.path,
            "StandardErrorPath": AppPaths.launchAgentLog.path
        ]
        let data = try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0)
        try data.write(to: AppPaths.launchAgent, options: .atomic)
        try fileManager.setAttributes([.posixPermissions: 0o644], ofItemAtPath: AppPaths.launchAgent.path)
    }

    private static func bootstrapAndKickstart() throws {
        let domain = "gui/\(getuid())"
        let result = try ProcessRunner.run("/bin/launchctl", arguments: ["bootstrap", domain, AppPaths.launchAgent.path])
        guard result.status == 0 else {
            throw BridgeServiceError.commandFailed("无法加载登录启动项：\(cleanError(result))")
        }
        let kickstart = try ProcessRunner.run(
            "/bin/launchctl",
            arguments: ["kickstart", "-k", "\(domain)/\(AppConfiguration.launchAgentLabel)"]
        )
        guard kickstart.status == 0 else {
            throw BridgeServiceError.commandFailed("无法启动 Bridge：\(cleanError(kickstart))")
        }
    }

    private static func cleanError(_ result: CommandResult) -> String {
        let value = result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? "launchctl 返回 \(result.status)" : value
    }
}

enum BridgeClient {
    private static var baseURL: URL {
        URL(string: "http://127.0.0.1:\(AppConfiguration.bridgePort)")!
    }

    static func fetchStatus(timeout: TimeInterval = 4) -> BridgeStatus {
        if let data = try? request(path: "/api/bridge/status", timeout: timeout),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            let config = object["config"] as? [String: Any] ?? [:]
            return BridgeStatus(
                reachable: true,
                version: string(object["version"]),
                printerHost: string(config["host"]),
                printerPort: integer(config["port"]) ?? 80,
                hasAPIKey: boolean(config["has_apikey"]),
                printerReachable: boolean(object["printer_reachable"]),
                klippyState: string(object["klippy_state"]),
                moonrakerVersion: string(object["moonraker_version"]),
                error: string(object["error"])
            )
        }
        guard let data = try? request(path: "/api/bridge/config", timeout: timeout),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return BridgeStatus()
        }
        return BridgeStatus(
            reachable: true,
            version: string(object["version"]),
            printerHost: string(object["printer_host"]),
            printerPort: integer(object["printer_port"]) ?? 80,
            hasAPIKey: boolean(object["has_apikey"])
        )
    }

    static func scanPrinters(timeout: Int = 3) throws -> [DiscoveredPrinter] {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/bridge/scan"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "timeout", value: String(timeout))]
        guard let url = components.url else { throw BridgeServiceError.scanFailed("无法生成扫描地址") }
        let data = try request(url: url, timeout: TimeInterval(timeout + 5))
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw BridgeServiceError.scanFailed("响应格式无效")
        }
        if let error = object["error"] as? String, !error.isEmpty {
            throw BridgeServiceError.scanFailed(error)
        }
        let rawPrinters = object["printers"] as? [[String: Any]] ?? []
        var seen = Set<String>()
        return rawPrinters.prefix(50).compactMap { raw in
            let host = string(raw["ip"] ?? raw["host"])
            guard !host.isEmpty, seen.insert(host).inserted else { return nil }
            return DiscoveredPrinter(
                name: string(raw["name"]).isEmpty ? "Snapmaker U1" : string(raw["name"]),
                host: host,
                port: integer(raw["port"]) ?? 80
            )
        }
    }

    static func savePrinter(host: String, portText: String, apiKey: String) throws {
        let cleanedHost = host.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedHost.isEmpty,
              !cleanedHost.contains("://"),
              !cleanedHost.contains("/"),
              cleanedHost.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else {
            throw BridgeServiceError.invalidPrinterHost
        }
        guard let port = Int(portText), (1...65_535).contains(port) else {
            throw BridgeServiceError.invalidPrinterPort
        }
        let body = try JSONSerialization.data(withJSONObject: [
            "host": cleanedHost,
            "port": port,
            "apikey": apiKey
        ])
        var urlRequest = URLRequest(url: baseURL.appendingPathComponent("api/bridge/config"))
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = body
        let data = try request(urlRequest: urlRequest, timeout: 8)
        let response = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        guard boolean(response["ok"]) else {
            let message = string(response["error"])
            throw BridgeServiceError.configurationRejected(message.isEmpty ? "无响应" : message)
        }
    }

    private static func request(path: String, timeout: TimeInterval) throws -> Data {
        try request(url: baseURL.appendingPathComponent(path), timeout: timeout)
    }

    private static func request(url: URL, timeout: TimeInterval) throws -> Data {
        try request(urlRequest: URLRequest(url: url), timeout: timeout)
    }

    private static func request(urlRequest: URLRequest, timeout: TimeInterval) throws -> Data {
        let semaphore = DispatchSemaphore(value: 0)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout
        let session = URLSession(configuration: configuration)
        var responseData: Data?
        var responseError: Error?
        let task = session.dataTask(with: urlRequest) { data, response, error in
            defer { semaphore.signal() }
            responseError = error
            guard response is HTTPURLResponse else { return }
            responseData = data
        }
        task.resume()
        if semaphore.wait(timeout: .now() + timeout + 1) == .timedOut {
            task.cancel()
            throw BridgeServiceError.bridgeUnavailable
        }
        if let responseError { throw responseError }
        guard let responseData else { throw BridgeServiceError.bridgeUnavailable }
        return responseData
    }

    private static func string(_ value: Any?) -> String {
        value as? String ?? ""
    }

    private static func integer(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) }
        return nil
    }

    private static func boolean(_ value: Any?) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        return false
    }
}

enum FullUninstaller {
    static func uninstall() throws {
        guard !ProfileInstaller.isBambuStudioRunning else {
            throw ProfileInstallerError.bambuStudioRunning
        }
        try LaunchAgentManager.remove()
        try ProfileInstaller.uninstall()
        try FileTools.removeIfPresent(AppPaths.dataRoot)
    }
}
