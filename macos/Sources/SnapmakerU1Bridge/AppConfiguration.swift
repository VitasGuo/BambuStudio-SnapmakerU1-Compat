import AppKit
import Foundation

enum AppConfiguration {
    static let productName = "Snapmaker U1 Bridge"
    static let bundleIdentifier = "com.snapmaker.u1bridge"
    static let bridgeVersion = "5.38.0"
    static let supportedBambuStudioVersion = [2, 7, 1, 62]
    static let supportedBambuStudioDisplayVersion = "2.7.1.62"
    static let bridgePort = 13_628
    static let launchAgentLabel = bundleIdentifier
}

enum AppPaths {
    private static let fileManager = FileManager.default

    static var home: URL {
        fileManager.homeDirectoryForCurrentUser
    }

    static var applicationSupport: URL {
        home.appendingPathComponent("Library/Application Support", isDirectory: true)
    }

    static var dataRoot: URL {
        applicationSupport.appendingPathComponent("SnapmakerU1Bridge", isDirectory: true)
    }

    static var bridgeDirectory: URL {
        dataRoot.appendingPathComponent("bridge", isDirectory: true)
    }

    static var nodeExecutable: URL {
        dataRoot.appendingPathComponent("runtime/bin/node", isDirectory: false)
    }

    static var bridgeEntryPoint: URL {
        bridgeDirectory.appendingPathComponent("server.js", isDirectory: false)
    }

    static var installedDialogHelper: URL {
        dataRoot.appendingPathComponent("bin/SnapmakerU1DialogHelper", isDirectory: false)
    }

    static var bridgeLog: URL {
        dataRoot.appendingPathComponent("bridge.log", isDirectory: false)
    }

    static var launchAgentLog: URL {
        dataRoot.appendingPathComponent("logs/launchagent.log", isDirectory: false)
    }

    static var launchAgent: URL {
        home.appendingPathComponent("Library/LaunchAgents/\(AppConfiguration.launchAgentLabel).plist")
    }

    static var bambuDataRoot: URL {
        applicationSupport.appendingPathComponent("BambuStudio", isDirectory: true)
    }

    static var bambuConfiguration: URL {
        bambuDataRoot.appendingPathComponent("BambuStudio.conf", isDirectory: false)
    }

    static var bambuSystemManifest: URL {
        bambuDataRoot.appendingPathComponent("system/Snapmaker.json")
    }

    static var bambuSystemProfiles: URL {
        bambuDataRoot.appendingPathComponent("system/Snapmaker", isDirectory: true)
    }

    static var bambuVendorAssets: URL {
        bambuDataRoot.appendingPathComponent("vendor/Snapmaker", isDirectory: true)
    }

    static var profileInstallManifest: URL {
        dataRoot.appendingPathComponent("config/profile-install.json")
    }

    static var payloadRoot: URL? {
        if let override = ProcessInfo.processInfo.environment["SNAPMAKER_U1_PAYLOAD"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        return Bundle.main.resourceURL?.appendingPathComponent("Payload", isDirectory: true)
    }

    static var bundledDialogHelper: URL? {
        let macOSDirectory = Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS", isDirectory: true)
        let primary = macOSDirectory.appendingPathComponent("SnapmakerU1DialogHelper")
        if fileManager.isExecutableFile(atPath: primary.path) { return primary }

        let legacy = Bundle.main.resourceURL?
            .appendingPathComponent("Helpers/U1PrintDialog", isDirectory: false)
        if let legacy, fileManager.isExecutableFile(atPath: legacy.path) { return legacy }
        return nil
    }
}

struct BambuStudioInstallation: Equatable {
    let applicationURL: URL
    let version: String

    var isSupported: Bool {
        VersionTools.components(from: version) == AppConfiguration.supportedBambuStudioVersion
    }

    static func detect() -> BambuStudioInstallation? {
        let fileManager = FileManager.default
        var candidates: [URL] = []
        if let override = ProcessInfo.processInfo.environment["SNAPMAKER_BAMBU_STUDIO_APP"], !override.isEmpty {
            candidates.append(URL(fileURLWithPath: override, isDirectory: true))
        }
        candidates.append(contentsOf: [
            URL(fileURLWithPath: "/Applications/BambuStudio.app"),
            URL(fileURLWithPath: "/Applications/Bambu Studio.app"),
            AppPaths.home.appendingPathComponent("Applications/BambuStudio.app"),
            AppPaths.home.appendingPathComponent("Applications/Bambu Studio.app")
        ])
        if let registered = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.bambulab.bambu-studio") {
            candidates.append(registered)
        }

        var seen = Set<String>()
        for candidate in candidates where seen.insert(candidate.standardizedFileURL.path).inserted {
            guard fileManager.fileExists(atPath: candidate.path),
                  let bundle = Bundle(url: candidate),
                  bundle.bundleIdentifier == "com.bambulab.bambu-studio" else { continue }
            let version = (bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
                ?? (bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
                ?? "unknown"
            return BambuStudioInstallation(applicationURL: candidate, version: version)
        }
        return nil
    }
}

enum VersionTools {
    static func components(from version: String) -> [Int] {
        version
            .components(separatedBy: CharacterSet.decimalDigits.inverted)
            .filter { !$0.isEmpty }
            .compactMap(Int.init)
    }
}

struct CommandResult {
    let status: Int32
    let stdout: String
    let stderr: String
}

enum ProcessRunner {
    @discardableResult
    static func run(_ executable: String, arguments: [String]) throws -> CommandResult {
        let process = Process()
        let output = Pipe()
        let error = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = output
        process.standardError = error
        try process.run()
        process.waitUntilExit()
        let stdout = String(data: output.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let stderr = String(data: error.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return CommandResult(status: process.terminationStatus, stdout: stdout, stderr: stderr)
    }
}

enum FileTools {
    private static let fileManager = FileManager.default

    static func ensureDirectory(_ url: URL) throws {
        try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
    }

    static func removeIfPresent(_ url: URL) throws {
        if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
    }

    /// Copies an item into a sibling staging path and swaps it into place. If the
    /// final move fails, the prior item is restored before the error is returned.
    static func copyAtomically(from source: URL, to destination: URL) throws {
        let parent = destination.deletingLastPathComponent()
        try ensureDirectory(parent)
        let token = UUID().uuidString
        let staged = parent.appendingPathComponent(".\(destination.lastPathComponent).staged-\(token)")
        let displaced = parent.appendingPathComponent(".\(destination.lastPathComponent).previous-\(token)")
        try removeIfPresent(staged)
        try removeIfPresent(displaced)
        try fileManager.copyItem(at: source, to: staged)

        let hadDestination = fileManager.fileExists(atPath: destination.path)
        if hadDestination {
            try fileManager.moveItem(at: destination, to: displaced)
        }
        do {
            try fileManager.moveItem(at: staged, to: destination)
            try? removeIfPresent(displaced)
        } catch {
            try? removeIfPresent(staged)
            if hadDestination, fileManager.fileExists(atPath: displaced.path) {
                try? fileManager.moveItem(at: displaced, to: destination)
            }
            throw error
        }
    }

    static func setExecutable(_ url: URL) throws {
        try fileManager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
    }
}

enum ArchitectureGuard {
    static var processArchitecture: String {
        #if arch(arm64)
        return "arm64"
        #elseif arch(x86_64)
        return "x86_64"
        #else
        return "unsupported"
        #endif
    }

    static var declaredArchitecture: String? {
        Bundle.main.object(forInfoDictionaryKey: "SnapmakerU1TargetArchitecture") as? String
    }

    static var validationError: String? {
        guard let declared = declaredArchitecture, !declared.isEmpty else { return nil }
        guard declared == "arm64" || declared == "x86_64" else {
            return "安装包声明了未知架构：\(declared)"
        }
        guard declared == processArchitecture else {
            return "此 App 是 \(declared) 版本，但当前进程架构为 \(processArchitecture)。请下载正确版本。"
        }
        return nil
    }

    static func enforceForGUI() {
        guard let error = validationError else { return }
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "无法启动 \(AppConfiguration.productName)"
        alert.informativeText = error
        alert.addButton(withTitle: "退出")
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }
}

enum CommandLineInterface {
    static func handleIfRequested() -> Never? {
        let arguments = Set(CommandLine.arguments.dropFirst())
        if arguments.contains("--version") {
            writeStandardOutput("\(AppConfiguration.productName) \(AppConfiguration.bridgeVersion)\n")
            Foundation.exit(EXIT_SUCCESS)
        }
        if arguments.contains("--self-test") {
            if let error = ArchitectureGuard.validationError {
                let object: [String: Any] = [
                    "ok": false,
                    "architecture": ArchitectureGuard.processArchitecture,
                    "error": error
                ]
                writeJSON(object)
                Foundation.exit(EXIT_FAILURE)
            }
            let object: [String: Any] = [
                "ok": true,
                "architecture": ArchitectureGuard.processArchitecture,
                "declaredArchitecture": ArchitectureGuard.declaredArchitecture ?? "unspecified",
                "minimumMacOS": "11.0",
                "version": AppConfiguration.bridgeVersion
            ]
            writeJSON(object)
            Foundation.exit(EXIT_SUCCESS)
        }
        return nil
    }

    private static func writeJSON(_ object: [String: Any]) {
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data("{\"ok\":false}".utf8)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }

    private static func writeStandardOutput(_ value: String) {
        FileHandle.standardOutput.write(Data(value.utf8))
    }
}
