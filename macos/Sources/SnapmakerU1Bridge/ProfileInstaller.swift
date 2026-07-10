import AppKit
import Foundation

struct ProfileBackupManifest: Codable {
    let backupDirectory: String
    let hadSystemManifest: Bool
    let hadSystemProfiles: Bool
    let hadVendorAssets: Bool
    let installedAt: Date
    // Optional so manifests written by releases before BambuStudio.conf
    // activation support remain decodable during an in-place upgrade.
    let addedBambuModelActivation: Bool?
    let addedDefaultFilamentVisibility: Bool?
}

enum ProfileInstallerError: LocalizedError {
    case bambuStudioMissing
    case bambuStudioRunning
    case unsupportedBambuStudio(String)
    case payloadMissing(String)
    case invalidBackupManifest(String)
    case invalidBambuConfiguration(String)

    var errorDescription: String? {
        switch self {
        case .bambuStudioMissing:
            return "未检测到 Bambu Studio。请先安装官方 macOS 版 \(AppConfiguration.supportedBambuStudioDisplayVersion)。"
        case .bambuStudioRunning:
            return "Bambu Studio 正在运行。请先完全退出 Bambu Studio，再重试预设安装或卸载。"
        case .unsupportedBambuStudio(let version):
            return "当前 Bambu Studio 版本为 \(version)，仅支持 \(AppConfiguration.supportedBambuStudioDisplayVersion)。"
        case .payloadMissing(let item):
            return "安装包缺少预设资源：\(item)。请重新下载完整 DMG。"
        case .invalidBackupManifest(let reason):
            return "预设备份清单无效：\(reason)。为防止丢失原预设，本次操作已取消，现有文件未改动。"
        case .invalidBambuConfiguration(let reason):
            return "Bambu Studio 配置文件无效：\(reason)。为防止覆盖现有设置，本次操作已取消。"
        }
    }
}

enum ProfileInstaller {
    private static let fileManager = FileManager.default
    private static let assetExtensions = Set(["stl", "svg", "png"])
    private static let u1Vendor = "Snapmaker"
    private static let u1Model = "Snapmaker U1"
    private static let u1NozzleDiameter = "0.4"
    private static let modelActivationKeys = Set(["vendor", "model", "nozzle_diameter"])

    private struct ConfigurationUpdate {
        let changed: Bool
        let addedModelActivation: Bool
    }

    static var isInstalled: Bool {
        fileManager.fileExists(atPath: AppPaths.bambuSystemManifest.path)
            && fileManager.fileExists(atPath: AppPaths.bambuSystemProfiles.path)
            && fileManager.fileExists(atPath: AppPaths.profileInstallManifest.path)
            && hasRequiredBambuConfiguration
    }

    static var isBambuStudioRunning: Bool {
        #if SNAPMAKER_U1_TESTING
        if let override = bambuStudioRunningOverrideForTests { return override }
        #endif
        return NSWorkspace.shared.runningApplications.contains {
            $0.bundleIdentifier == "com.bambulab.bambu-studio" && !$0.isTerminated
        }
    }

    #if SNAPMAKER_U1_TESTING
    static var bambuStudioRunningOverrideForTests: Bool?
    #endif

    static func install() throws {
        guard !isBambuStudioRunning else {
            throw ProfileInstallerError.bambuStudioRunning
        }
        guard let bambu = BambuStudioInstallation.detect() else {
            throw ProfileInstallerError.bambuStudioMissing
        }
        guard bambu.isSupported else {
            throw ProfileInstallerError.unsupportedBambuStudio(bambu.version)
        }
        let sources = try profileSources()
        try FileTools.ensureDirectory(AppPaths.dataRoot.appendingPathComponent("config", isDirectory: true))

        let transactionRoot = AppPaths.dataRoot
            .appendingPathComponent("tmp/profile-\(UUID().uuidString)", isDirectory: true)
        let prepared = transactionRoot.appendingPathComponent("prepared", isDirectory: true)
        let rollback = transactionRoot.appendingPathComponent("rollback", isDirectory: true)
        try FileTools.ensureDirectory(prepared)
        try FileTools.ensureDirectory(rollback)
        defer { try? FileTools.removeIfPresent(transactionRoot) }

        let preparedManifest = prepared.appendingPathComponent("Snapmaker.json")
        let preparedProfiles = prepared.appendingPathComponent("Snapmaker", isDirectory: true)
        let preparedVendor = prepared.appendingPathComponent("vendor-Snapmaker", isDirectory: true)
        let preparedConfiguration = prepared.appendingPathComponent("BambuStudio.conf")
        try fileManager.copyItem(at: sources.manifest, to: preparedManifest)
        try fileManager.copyItem(at: sources.profiles, to: preparedProfiles)
        try prepareVendorAssets(from: sources.profiles, at: preparedVendor)
        try repairDefaultFilament(in: preparedProfiles)
        let configurationUpdate = try prepareBambuConfigurationForInstall(at: preparedConfiguration)

        let destinations = [
            AppPaths.bambuSystemManifest,
            AppPaths.bambuSystemProfiles,
            AppPaths.bambuVendorAssets,
            AppPaths.bambuConfiguration
        ]
        try snapshot(destinations, into: rollback)

        let alreadyManaged = fileManager.fileExists(atPath: AppPaths.profileInstallManifest.path)
        let originalManifest = alreadyManaged ? try loadInstallManifest() : try createOriginalBackup()
        let managedManifest = manifestByRecordingOwnership(
            originalManifest,
            modelAddedNow: configurationUpdate.addedModelActivation
        )

        do {
            try FileTools.copyAtomically(from: preparedManifest, to: AppPaths.bambuSystemManifest)
            try FileTools.copyAtomically(from: preparedProfiles, to: AppPaths.bambuSystemProfiles)
            try FileTools.copyAtomically(from: preparedVendor, to: AppPaths.bambuVendorAssets)
            if configurationUpdate.changed {
                try FileTools.copyAtomically(from: preparedConfiguration, to: AppPaths.bambuConfiguration)
            }
            try saveInstallManifest(managedManifest)
        } catch {
            try? restoreSnapshot(from: rollback, destinations: destinations)
            if !alreadyManaged {
                try? FileTools.removeIfPresent(URL(fileURLWithPath: originalManifest.backupDirectory))
                try? FileTools.removeIfPresent(AppPaths.profileInstallManifest)
            }
            throw error
        }
    }

    static func uninstall() throws {
        guard !isBambuStudioRunning else {
            throw ProfileInstallerError.bambuStudioRunning
        }
        guard fileManager.fileExists(atPath: AppPaths.profileInstallManifest.path) else {
            // Nothing recorded by this app: do not delete an installation we do not own.
            return
        }
        let manifest = try loadInstallManifest()
        let backup = try validatedBackupDirectory(for: manifest)
        try validateRequiredBackupItems(manifest, at: backup)

        let transactionRoot = AppPaths.dataRoot
            .appendingPathComponent("tmp/profile-uninstall-\(UUID().uuidString)", isDirectory: true)
        let prepared = transactionRoot.appendingPathComponent("prepared", isDirectory: true)
        let rollback = transactionRoot.appendingPathComponent("rollback", isDirectory: true)
        try FileTools.ensureDirectory(prepared)
        try FileTools.ensureDirectory(rollback)
        defer { try? FileTools.removeIfPresent(transactionRoot) }

        let preparedConfiguration = prepared.appendingPathComponent("BambuStudio.conf")
        let configurationUpdate = try prepareBambuConfigurationForUninstall(
            manifest,
            at: preparedConfiguration
        )
        let destinations = [
            AppPaths.bambuSystemManifest,
            AppPaths.bambuSystemProfiles,
            AppPaths.bambuVendorAssets,
            AppPaths.bambuConfiguration
        ]
        try snapshot(destinations, into: rollback)

        do {
            try FileTools.removeIfPresent(AppPaths.bambuSystemManifest)
            try FileTools.removeIfPresent(AppPaths.bambuSystemProfiles)
            try FileTools.removeIfPresent(AppPaths.bambuVendorAssets)

            if manifest.hadSystemManifest {
                try restoreBackupItem(backup.appendingPathComponent("Snapmaker.json"), to: AppPaths.bambuSystemManifest)
            }
            if manifest.hadSystemProfiles {
                try restoreBackupItem(backup.appendingPathComponent("Snapmaker"), to: AppPaths.bambuSystemProfiles)
            }
            if manifest.hadVendorAssets {
                try restoreBackupItem(backup.appendingPathComponent("vendor-Snapmaker"), to: AppPaths.bambuVendorAssets)
            }
            if configurationUpdate.changed {
                try FileTools.copyAtomically(from: preparedConfiguration, to: AppPaths.bambuConfiguration)
            }

            try FileTools.removeIfPresent(AppPaths.profileInstallManifest)
        } catch {
            try? restoreSnapshot(from: rollback, destinations: destinations)
            throw error
        }
        try? FileTools.removeIfPresent(backup)
    }

    private static func profileSources() throws -> (manifest: URL, profiles: URL) {
        guard let payload = AppPaths.payloadRoot else {
            throw ProfileInstallerError.payloadMissing("Payload")
        }
        let roots = [payload.appendingPathComponent("profiles", isDirectory: true), payload]
        for root in roots {
            let manifest = root.appendingPathComponent("Snapmaker.json")
            let profiles = root.appendingPathComponent("Snapmaker", isDirectory: true)
            if fileManager.fileExists(atPath: manifest.path), fileManager.fileExists(atPath: profiles.path) {
                return (manifest, profiles)
            }
        }
        throw ProfileInstallerError.payloadMissing("Snapmaker.json / Snapmaker/")
    }

    private static func prepareVendorAssets(from profiles: URL, at destination: URL) throws {
        try FileTools.ensureDirectory(destination)
        let contents = try fileManager.contentsOfDirectory(
            at: profiles,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        )
        for item in contents where assetExtensions.contains(item.pathExtension.lowercased()) {
            try fileManager.copyItem(at: item, to: destination.appendingPathComponent(item.lastPathComponent))
        }
    }

    private static func repairDefaultFilament(in profiles: URL) throws {
        let machine = profiles.appendingPathComponent("machine/Snapmaker U1 (0.4 nozzle).json")
        guard fileManager.fileExists(atPath: machine.path) else {
            throw ProfileInstallerError.payloadMissing("machine/Snapmaker U1 (0.4 nozzle).json")
        }
        let data = try Data(contentsOf: machine)
        guard var text = String(data: data, encoding: .utf8) else {
            throw CocoaError(.fileReadInapplicableStringEncoding)
        }
        text = text.replacingOccurrences(of: "Snapmaker PLA @U1", with: "Snapmaker PLA Basic @U1")
        try Data(text.utf8).write(to: machine, options: .atomic)
    }

    private static var hasRequiredBambuConfiguration: Bool {
        guard fileManager.fileExists(atPath: AppPaths.bambuConfiguration.path),
              let configuration = try? loadBambuConfiguration(),
              let models = try? arrayValue(named: "models", in: configuration) else {
            return false
        }
        return models.contains(where: isExactU1ModelActivation)
    }

    private static func prepareBambuConfigurationForInstall(at destination: URL) throws -> ConfigurationUpdate {
        var configuration = try loadBambuConfiguration()
        var models = try arrayValue(named: "models", in: configuration)

        let addedModel = !models.contains(where: isExactU1ModelActivation)
        if addedModel {
            models.append(u1ModelActivation)
            configuration["models"] = models
        }

        if addedModel {
            try writeBambuConfiguration(configuration, to: destination)
        }
        return ConfigurationUpdate(
            changed: addedModel,
            addedModelActivation: addedModel
        )
    }

    private static func prepareBambuConfigurationForUninstall(
        _ manifest: ProfileBackupManifest,
        at destination: URL
    ) throws -> ConfigurationUpdate {
        let removeModel = manifest.addedBambuModelActivation == true
        guard removeModel,
              fileManager.fileExists(atPath: AppPaths.bambuConfiguration.path) else {
            return ConfigurationUpdate(
                changed: false,
                addedModelActivation: false
            )
        }

        var configuration = try loadBambuConfiguration()
        var changed = false
        if removeModel {
            var models = try arrayValue(named: "models", in: configuration)
            if let index = models.firstIndex(where: isExactU1ModelActivation) {
                models.remove(at: index)
                configuration["models"] = models
                changed = true
            }
        }

        if changed {
            try writeBambuConfiguration(configuration, to: destination)
        }
        return ConfigurationUpdate(
            changed: changed,
            addedModelActivation: false
        )
    }

    private static var u1ModelActivation: [String: Any] {
        [
            "model": u1Model,
            "nozzle_diameter": u1NozzleDiameter,
            "vendor": u1Vendor
        ]
    }

    private static func isMatchingU1ModelActivation(_ value: Any) -> Bool {
        guard let object = value as? [String: Any] else { return false }
        return object["vendor"] as? String == u1Vendor
            && object["model"] as? String == u1Model
            && object["nozzle_diameter"] as? String == u1NozzleDiameter
    }

    private static func isExactU1ModelActivation(_ value: Any) -> Bool {
        guard let object = value as? [String: Any],
              Set(object.keys) == modelActivationKeys else { return false }
        return isMatchingU1ModelActivation(object)
    }

    private static func arrayValue(named key: String, in configuration: [String: Any]) throws -> [Any] {
        guard let value = configuration[key] else { return [] }
        guard let array = value as? [Any] else {
            throw ProfileInstallerError.invalidBambuConfiguration("\(key) 必须是数组")
        }
        return array
    }

    private static func loadBambuConfiguration() throws -> [String: Any] {
        guard fileManager.fileExists(atPath: AppPaths.bambuConfiguration.path) else { return [:] }
        do {
            let data = try Data(contentsOf: AppPaths.bambuConfiguration)
            let object = try JSONSerialization.jsonObject(with: data)
            guard let configuration = object as? [String: Any] else {
                throw ProfileInstallerError.invalidBambuConfiguration("根节点必须是 JSON 对象")
            }
            return configuration
        } catch let error as ProfileInstallerError {
            throw error
        } catch {
            throw ProfileInstallerError.invalidBambuConfiguration(error.localizedDescription)
        }
    }

    private static func writeBambuConfiguration(_ configuration: [String: Any], to destination: URL) throws {
        do {
            guard JSONSerialization.isValidJSONObject(configuration) else {
                throw ProfileInstallerError.invalidBambuConfiguration("包含无法序列化的字段")
            }
            var data = try JSONSerialization.data(
                withJSONObject: configuration,
                options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            )
            data.append(0x0A)
            try data.write(to: destination, options: .atomic)

            if fileManager.fileExists(atPath: AppPaths.bambuConfiguration.path),
               let permissions = try fileManager.attributesOfItem(
                   atPath: AppPaths.bambuConfiguration.path
               )[.posixPermissions] {
                try fileManager.setAttributes([.posixPermissions: permissions], ofItemAtPath: destination.path)
            }
        } catch let error as ProfileInstallerError {
            throw error
        } catch {
            throw ProfileInstallerError.invalidBambuConfiguration(error.localizedDescription)
        }
    }

    private static func manifestByRecordingOwnership(
        _ manifest: ProfileBackupManifest,
        modelAddedNow: Bool
    ) -> ProfileBackupManifest {
        ProfileBackupManifest(
            backupDirectory: manifest.backupDirectory,
            hadSystemManifest: manifest.hadSystemManifest,
            hadSystemProfiles: manifest.hadSystemProfiles,
            hadVendorAssets: manifest.hadVendorAssets,
            installedAt: manifest.installedAt,
            addedBambuModelActivation: manifest.addedBambuModelActivation ?? modelAddedNow,
            addedDefaultFilamentVisibility: manifest.addedDefaultFilamentVisibility
        )
    }

    private static func createOriginalBackup() throws -> ProfileBackupManifest {
        let formatter = ISO8601DateFormatter()
        let backup = AppPaths.dataRoot
            .appendingPathComponent("backups/profiles/\(formatter.string(from: Date()))-\(UUID().uuidString.prefix(8))", isDirectory: true)
        try FileTools.ensureDirectory(backup)
        let hadManifest = fileManager.fileExists(atPath: AppPaths.bambuSystemManifest.path)
        let hadProfiles = fileManager.fileExists(atPath: AppPaths.bambuSystemProfiles.path)
        let hadVendor = fileManager.fileExists(atPath: AppPaths.bambuVendorAssets.path)
        if hadManifest {
            try fileManager.copyItem(at: AppPaths.bambuSystemManifest, to: backup.appendingPathComponent("Snapmaker.json"))
        }
        if hadProfiles {
            try fileManager.copyItem(at: AppPaths.bambuSystemProfiles, to: backup.appendingPathComponent("Snapmaker"))
        }
        if hadVendor {
            try fileManager.copyItem(at: AppPaths.bambuVendorAssets, to: backup.appendingPathComponent("vendor-Snapmaker"))
        }
        return ProfileBackupManifest(
            backupDirectory: backup.path,
            hadSystemManifest: hadManifest,
            hadSystemProfiles: hadProfiles,
            hadVendorAssets: hadVendor,
            installedAt: Date(),
            addedBambuModelActivation: nil,
            addedDefaultFilamentVisibility: nil
        )
    }

    private static func saveInstallManifest(_ manifest: ProfileBackupManifest) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        try FileTools.ensureDirectory(AppPaths.profileInstallManifest.deletingLastPathComponent())
        try encoder.encode(manifest).write(to: AppPaths.profileInstallManifest, options: .atomic)
    }

    private static func loadInstallManifest() throws -> ProfileBackupManifest {
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let manifest = try decoder.decode(ProfileBackupManifest.self, from: Data(contentsOf: AppPaths.profileInstallManifest))
            let backup = try validatedBackupDirectory(for: manifest)
            try validateRequiredBackupItems(manifest, at: backup)
            return manifest
        } catch let error as ProfileInstallerError {
            throw error
        } catch {
            throw ProfileInstallerError.invalidBackupManifest(error.localizedDescription)
        }
    }

    private static func validatedBackupDirectory(for manifest: ProfileBackupManifest) throws -> URL {
        let allowedRoot = AppPaths.dataRoot
            .appendingPathComponent("backups/profiles", isDirectory: true)
            .standardizedFileURL
        let candidate = URL(fileURLWithPath: manifest.backupDirectory, isDirectory: true).standardizedFileURL
        guard candidate.path.hasPrefix(allowedRoot.path + "/") else {
            throw ProfileInstallerError.invalidBackupManifest("备份路径不在本 App 的 backups/profiles 目录中")
        }
        return candidate
    }

    private static func validateRequiredBackupItems(_ manifest: ProfileBackupManifest, at backup: URL) throws {
        let required: [(Bool, String)] = [
            (manifest.hadSystemManifest, "Snapmaker.json"),
            (manifest.hadSystemProfiles, "Snapmaker"),
            (manifest.hadVendorAssets, "vendor-Snapmaker")
        ]
        for (needed, name) in required where needed {
            guard fileManager.fileExists(atPath: backup.appendingPathComponent(name).path) else {
                throw ProfileInstallerError.invalidBackupManifest("缺少必需备份 \(name)")
            }
        }
    }

    private static func restoreBackupItem(_ source: URL, to destination: URL) throws {
        guard fileManager.fileExists(atPath: source.path) else { return }
        try FileTools.copyAtomically(from: source, to: destination)
    }

    private static func snapshot(_ destinations: [URL], into root: URL) throws {
        for (index, destination) in destinations.enumerated() where fileManager.fileExists(atPath: destination.path) {
            try fileManager.copyItem(at: destination, to: root.appendingPathComponent(String(index)))
        }
    }

    private static func restoreSnapshot(from root: URL, destinations: [URL]) throws {
        for (index, destination) in destinations.enumerated() {
            try FileTools.removeIfPresent(destination)
            let source = root.appendingPathComponent(String(index))
            if fileManager.fileExists(atPath: source.path) {
                try FileTools.copyAtomically(from: source, to: destination)
            }
        }
    }
}
