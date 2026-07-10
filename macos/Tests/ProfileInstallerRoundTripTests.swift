import Foundation

@main
enum ProfileInstallerRoundTripTests {
    private static let fileManager = FileManager.default
    private static var failures: [String] = []

    private static let originalManifest = Data("{\"name\":\"original-snapmaker\"}\n".utf8)
    private static let originalProfileMarker = Data("original profiles\n".utf8)
    private static let originalVendorMarker = Data("original vendor assets\n".utf8)
    private static let defaultFilament = "Snapmaker PLA Basic @U1"
    private static let u1Model: [String: Any] = [
        "model": "Snapmaker U1",
        "nozzle_diameter": "0.4",
        "vendor": "Snapmaker"
    ]
    private static let bblModel: [String: Any] = [
        "model": "Bambu Lab A1",
        "nozzle_diameter": "0.4",
        "vendor": "BBL"
    ]

    static func main() {
        do {
            try prepareHarness()
        } catch {
            FileHandle.standardError.write(Data("FAIL: test harness setup threw: \(error)\n".utf8))
            Foundation.exit(EXIT_FAILURE)
        }

        run("owned activation round trip and repeat install", testOwnedActivationRoundTrip)
        run("preexisting activation ownership remains false", testPreexistingActivationOwnership)
        run("missing top-level filaments remains missing", testMissingFilamentsKey)
        run("legacy manifest upgrades with optional ownership", testLegacyManifestUpgrade)
        run("uninstall removes only one exact owned entry", testExactOwnedRemoval)
        run("invalid Bambu configuration leaves original profiles untouched", testInvalidConfigurationRollback)

        try? resetSandbox()
        if failures.isEmpty {
            print("ProfileInstaller round-trip tests: passed")
            Foundation.exit(EXIT_SUCCESS)
        }
        for failure in failures {
            FileHandle.standardError.write(Data("FAIL: \(failure)\n".utf8))
        }
        Foundation.exit(EXIT_FAILURE)
    }

    private static func run(_ name: String, _ test: () throws -> Void) {
        do {
            try resetSandbox()
            try test()
        } catch {
            failures.append("\(name) threw: \(error)")
        }
    }

    private static func prepareHarness() throws {
        guard let expectedHome = ProcessInfo.processInfo.environment["SNAPMAKER_U1_TEST_HOME"],
              URL(fileURLWithPath: expectedHome).standardizedFileURL == AppPaths.home.standardizedFileURL else {
            throw TestError("SNAPMAKER_U1_TEST_HOME must match the isolated CFFIXED_USER_HOME")
        }
        guard AppPaths.home.path != FileManager.default.homeDirectoryForCurrentUser.path
                || AppPaths.home.path.contains("snapmaker-u1-profile-tests") else {
            throw TestError("refusing to run profile tests against a non-isolated home directory")
        }

        let payload = ProcessInfo.processInfo.environment["SNAPMAKER_U1_PAYLOAD"]
            ?? fileManager.currentDirectoryPath
        guard fileManager.fileExists(atPath: URL(fileURLWithPath: payload).appendingPathComponent("Snapmaker.json").path)
                || fileManager.fileExists(
                    atPath: URL(fileURLWithPath: payload).appendingPathComponent("profiles/Snapmaker.json").path
                ) else {
            throw TestError("SNAPMAKER_U1_PAYLOAD does not contain Snapmaker profiles")
        }
        setenv("SNAPMAKER_U1_PAYLOAD", payload, 1)

        let fakeApp = AppPaths.home.appendingPathComponent("Applications/BambuStudio.app", isDirectory: true)
        let contents = fakeApp.appendingPathComponent("Contents", isDirectory: true)
        let executable = contents.appendingPathComponent("MacOS/BambuStudio")
        try FileTools.ensureDirectory(executable.deletingLastPathComponent())
        let plist: [String: Any] = [
            "CFBundleExecutable": "BambuStudio",
            "CFBundleIdentifier": "com.bambulab.bambu-studio",
            "CFBundleName": "BambuStudio",
            "CFBundlePackageType": "APPL",
            "CFBundleShortVersionString": "02.07.01.62"
        ]
        let plistData = try PropertyListSerialization.data(
            fromPropertyList: plist,
            format: .xml,
            options: 0
        )
        try plistData.write(to: contents.appendingPathComponent("Info.plist"), options: .atomic)
        try Data("#!/bin/sh\nexit 0\n".utf8).write(to: executable, options: .atomic)
        try FileTools.setExecutable(executable)
        setenv("SNAPMAKER_BAMBU_STUDIO_APP", fakeApp.path, 1)
        ProfileInstaller.bambuStudioRunningOverrideForTests = false
    }

    private static func resetSandbox() throws {
        try FileTools.removeIfPresent(AppPaths.applicationSupport)
        try FileTools.ensureDirectory(AppPaths.applicationSupport)
        ProfileInstaller.bambuStudioRunningOverrideForTests = false
    }

    private static func testOwnedActivationRoundTrip() throws {
        try prepareOriginalProfiles()
        let originalFilaments: [Any] = [
            "Generic PLA @BBL A1",
            "Bambu PLA Basic @U1",
            "Generic PLA @BBL A1"
        ]
        try writeConfiguration([
            "header": "BambuStudio 02.07.01.62",
            "models": [bblModel],
            "filaments": originalFilaments,
            "unrelated": ["preserve": true]
        ])

        try ProfileInstaller.install()
        verifyInstalledProfiles()
        expect(ProfileInstaller.isInstalled, "install should require and detect the exact U1 model activation")
        expect(modelCount() == 1, "first install should add exactly one U1 model activation")
        expect(
            jsonSemanticallyEqual(filamentsValue(), originalFilaments),
            "install must preserve the top-level filaments array exactly"
        )
        expect(defaultFilamentCount() == 0, "missing Snapmaker default filament must remain missing")
        expect(ProfileInstaller.isInstalled, "missing top-level Snapmaker default filament must not make installation incomplete")
        var manifest = try readInstallManifest()
        expect(manifest.addedBambuModelActivation == true, "first install should own the model activation it adds")
        expect(manifest.addedDefaultFilamentVisibility == nil, "new installs must not claim top-level filament ownership")

        try ProfileInstaller.install()
        expect(modelCount() == 1, "repeat install must not duplicate the U1 model activation")
        expect(
            jsonSemanticallyEqual(filamentsValue(), originalFilaments),
            "repeat install must preserve the top-level filaments array exactly"
        )
        manifest = try readInstallManifest()
        expect(manifest.addedBambuModelActivation == true, "repeat install must preserve first model ownership")
        expect(manifest.addedDefaultFilamentVisibility == nil, "repeat install must not create filament ownership")

        var configuration = try readConfiguration()
        var models = configuration["models"] as? [Any] ?? []
        models.append([
            "model": "User Added Printer",
            "nozzle_diameter": "0.6",
            "vendor": "User Vendor"
        ])
        configuration["models"] = models
        var filaments = configuration["filaments"] as? [Any] ?? []
        filaments.append("User Added Filament")
        configuration["filaments"] = filaments
        let filamentsBeforeUninstall = filaments
        configuration["post_install_value"] = "must survive uninstall"
        try writeConfiguration(configuration)

        try ProfileInstaller.uninstall()
        verifyOriginalProfilesRestored()
        expect(modelCount() == 0, "uninstall should remove the model activation owned by this app")
        let after = try readConfiguration()
        expect(
            jsonSemanticallyEqual(after["filaments"], filamentsBeforeUninstall),
            "uninstall must not rewrite or remove any top-level filament entry"
        )
        expect(after["post_install_value"] as? String == "must survive uninstall", "uninstall must preserve settings added later")
        expect(containsModel(vendor: "BBL", model: "Bambu Lab A1", nozzle: "0.4", in: after), "uninstall must preserve existing BBL models")
        expect(containsModel(vendor: "User Vendor", model: "User Added Printer", nozzle: "0.6", in: after), "uninstall must preserve user-added models")
        expect((after["filaments"] as? [Any])?.contains { ($0 as? String) == "User Added Filament" } == true, "uninstall must preserve user-added filaments")
    }

    private static func testPreexistingActivationOwnership() throws {
        try prepareOriginalProfiles()
        let originalFilaments: [Any] = ["Generic PLA @BBL A1", defaultFilament]
        try writeConfiguration([
            "models": [bblModel, u1Model],
            "filaments": originalFilaments
        ])

        try ProfileInstaller.install()
        var manifest = try readInstallManifest()
        expect(manifest.addedBambuModelActivation == false, "preexisting U1 model activation must not become app-owned")
        expect(manifest.addedDefaultFilamentVisibility == nil, "preexisting filaments must not create an ownership record")
        expect(jsonSemanticallyEqual(filamentsValue(), originalFilaments), "install must preserve preexisting filaments")

        var configuration = try readConfiguration()
        configuration["models"] = (configuration["models"] as? [Any] ?? []).filter { !isU1Model($0) }
        try writeConfiguration(configuration)

        try ProfileInstaller.install()
        manifest = try readInstallManifest()
        expect(manifest.addedBambuModelActivation == false, "repeat install must preserve initial false model ownership")
        expect(modelCount() == 1, "repeat install should repair a missing activation without changing ownership")
        expect(jsonSemanticallyEqual(filamentsValue(), originalFilaments), "repeat install must preserve filaments")

        try ProfileInstaller.uninstall()
        expect(modelCount() == 1, "uninstall must retain activation that was preexisting on first install")
        expect(jsonSemanticallyEqual(filamentsValue(), originalFilaments), "uninstall must preserve filaments")
        verifyOriginalProfilesRestored()
    }

    private static func testMissingFilamentsKey() throws {
        try prepareOriginalProfiles()
        try writeConfiguration([
            "models": [bblModel],
            "unrelated": "keep"
        ])

        try ProfileInstaller.install()
        var configuration = try readConfiguration()
        expect(configuration["filaments"] == nil, "install must not create a missing top-level filaments key")
        expect(ProfileInstaller.isInstalled, "missing top-level filaments key must still report installed")
        try ProfileInstaller.install()
        configuration = try readConfiguration()
        expect(configuration["filaments"] == nil, "repeat install must not create a top-level filaments key")
        try ProfileInstaller.uninstall()
        configuration = try readConfiguration()
        expect(configuration["filaments"] == nil, "uninstall must not create a top-level filaments key")
        expect(configuration["unrelated"] as? String == "keep", "uninstall must preserve unrelated configuration")
    }

    private static func testLegacyManifestUpgrade() throws {
        try prepareOriginalProfiles()
        let originalFilaments: [Any] = [defaultFilament, "Generic PLA @BBL A1", defaultFilament]
        try writeConfiguration([
            "models": [bblModel],
            "filaments": originalFilaments
        ])
        try ProfileInstaller.install()

        var legacy = try readJSONObject(at: AppPaths.profileInstallManifest)
        legacy.removeValue(forKey: "addedBambuModelActivation")
        legacy["addedDefaultFilamentVisibility"] = true
        try writeJSONObject(legacy, to: AppPaths.profileInstallManifest)

        var configuration = try readConfiguration()
        configuration["models"] = (configuration["models"] as? [Any] ?? []).filter { !isU1Model($0) }
        try writeConfiguration(configuration)

        try ProfileInstaller.install()
        var manifest = try readInstallManifest()
        expect(manifest.addedBambuModelActivation == true, "legacy manifest upgrade should own the missing model it adds")
        expect(manifest.addedDefaultFilamentVisibility == true, "legacy filament ownership field should remain decodable and preserved")
        expect(jsonSemanticallyEqual(filamentsValue(), originalFilaments), "legacy upgrade must ignore top-level filaments")
        try ProfileInstaller.install()
        manifest = try readInstallManifest()
        expect(manifest.addedBambuModelActivation == true, "post-upgrade repeat install should preserve model ownership")
        expect(manifest.addedDefaultFilamentVisibility == true, "repeat install should preserve the legacy optional field")

        try ProfileInstaller.uninstall()
        expect(modelCount() == 0, "legacy-upgrade-owned model should be removed")
        expect(
            jsonSemanticallyEqual(filamentsValue(), originalFilaments),
            "uninstall must ignore filaments even when a legacy manifest says it owned one"
        )
        verifyOriginalProfilesRestored()
    }

    private static func testExactOwnedRemoval() throws {
        try prepareOriginalProfiles()
        try writeConfiguration([
            "models": [bblModel]
        ])
        try ProfileInstaller.install()

        var configuration = try readConfiguration()
        var models = configuration["models"] as? [Any] ?? []
        models.append(u1Model)
        configuration["models"] = models
        try writeConfiguration(configuration)

        try ProfileInstaller.uninstall()
        expect(modelCount() == 1, "uninstall should remove only one exact model entry that it owned")
        let after = try readConfiguration()
        expect(after["filaments"] == nil, "exact model removal must not create filaments")
    }

    private static func testInvalidConfigurationRollback() throws {
        try prepareOriginalProfiles()
        let invalid = Data("{ this is not valid JSON\n".utf8)
        try FileTools.ensureDirectory(AppPaths.bambuConfiguration.deletingLastPathComponent())
        try invalid.write(to: AppPaths.bambuConfiguration, options: .atomic)

        var didThrow = false
        do {
            try ProfileInstaller.install()
        } catch ProfileInstallerError.invalidBambuConfiguration {
            didThrow = true
        }
        expect(didThrow, "invalid BambuStudio.conf should abort installation")
        expect((try? Data(contentsOf: AppPaths.bambuSystemManifest)) == originalManifest, "invalid configuration must leave original manifest untouched")
        expect((try? Data(contentsOf: AppPaths.bambuSystemProfiles.appendingPathComponent("original-marker.txt"))) == originalProfileMarker, "invalid configuration must leave original profile directory untouched")
        expect((try? Data(contentsOf: AppPaths.bambuVendorAssets.appendingPathComponent("original-marker.txt"))) == originalVendorMarker, "invalid configuration must leave original vendor assets untouched")
        expect((try? Data(contentsOf: AppPaths.bambuConfiguration)) == invalid, "invalid configuration must remain byte-for-byte unchanged")
        expect(!fileManager.fileExists(atPath: AppPaths.profileInstallManifest.path), "failed install must not create an ownership manifest")
        expect(!ProfileInstaller.isInstalled, "invalid configuration must not report the profile as installed")
    }

    private static func prepareOriginalProfiles() throws {
        try FileTools.ensureDirectory(AppPaths.bambuSystemManifest.deletingLastPathComponent())
        try FileTools.ensureDirectory(AppPaths.bambuSystemProfiles)
        try FileTools.ensureDirectory(AppPaths.bambuVendorAssets)
        try originalManifest.write(to: AppPaths.bambuSystemManifest, options: .atomic)
        try originalProfileMarker.write(
            to: AppPaths.bambuSystemProfiles.appendingPathComponent("original-marker.txt"),
            options: .atomic
        )
        try originalVendorMarker.write(
            to: AppPaths.bambuVendorAssets.appendingPathComponent("original-marker.txt"),
            options: .atomic
        )
    }

    private static func verifyInstalledProfiles() {
        let machine = AppPaths.bambuSystemProfiles
            .appendingPathComponent("machine/Snapmaker U1 (0.4 nozzle).json")
        expect(fileManager.fileExists(atPath: machine.path), "installed U1 machine profile is missing")
        if let text = try? String(contentsOf: machine, encoding: .utf8) {
            expect(text.contains(defaultFilament), "installed profile should use the corrected default PLA name")
        } else {
            failures.append("installed U1 machine profile could not be read")
        }
        expect(
            !fileManager.fileExists(
                atPath: AppPaths.bambuSystemProfiles.appendingPathComponent("original-marker.txt").path
            ),
            "managed install should replace the prior Snapmaker profile directory"
        )
    }

    private static func verifyOriginalProfilesRestored() {
        expect(
            (try? Data(contentsOf: AppPaths.bambuSystemManifest)) == originalManifest,
            "uninstall should restore the original system manifest byte-for-byte"
        )
        expect(
            (try? Data(contentsOf: AppPaths.bambuSystemProfiles.appendingPathComponent("original-marker.txt")))
                == originalProfileMarker,
            "uninstall should restore the original profile directory"
        )
        expect(
            (try? Data(contentsOf: AppPaths.bambuVendorAssets.appendingPathComponent("original-marker.txt")))
                == originalVendorMarker,
            "uninstall should restore the original vendor assets"
        )
        expect(
            !fileManager.fileExists(atPath: AppPaths.profileInstallManifest.path),
            "uninstall should remove the managed install manifest"
        )
    }

    private static func readInstallManifest() throws -> ProfileBackupManifest {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(
            ProfileBackupManifest.self,
            from: Data(contentsOf: AppPaths.profileInstallManifest)
        )
    }

    private static func readConfiguration() throws -> [String: Any] {
        try readJSONObject(at: AppPaths.bambuConfiguration)
    }

    private static func writeConfiguration(_ object: [String: Any]) throws {
        try FileTools.ensureDirectory(AppPaths.bambuConfiguration.deletingLastPathComponent())
        try writeJSONObject(object, to: AppPaths.bambuConfiguration)
    }

    private static func readJSONObject(at url: URL) throws -> [String: Any] {
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        guard let object = value as? [String: Any] else {
            throw TestError("expected JSON object at \(url.path)")
        }
        return object
    }

    private static func writeJSONObject(_ object: [String: Any], to url: URL) throws {
        var data = try JSONSerialization.data(
            withJSONObject: object,
            options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )
        data.append(0x0A)
        try data.write(to: url, options: .atomic)
    }

    private static func modelCount() -> Int {
        guard let configuration = try? readConfiguration(),
              let models = configuration["models"] as? [Any] else { return 0 }
        return models.filter(isU1Model).count
    }

    private static func defaultFilamentCount() -> Int {
        guard let configuration = try? readConfiguration(),
              let filaments = configuration["filaments"] as? [Any] else { return 0 }
        return filaments.filter { ($0 as? String) == defaultFilament }.count
    }

    private static func filamentsValue() -> Any? {
        (try? readConfiguration())?["filaments"]
    }

    private static func jsonSemanticallyEqual(_ lhs: Any?, _ rhs: Any?) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil):
            return true
        case let (lhs?, rhs?):
            guard JSONSerialization.isValidJSONObject(["value": lhs]),
                  JSONSerialization.isValidJSONObject(["value": rhs]),
                  let leftData = try? JSONSerialization.data(
                      withJSONObject: ["value": lhs],
                      options: [.sortedKeys]
                  ),
                  let rightData = try? JSONSerialization.data(
                      withJSONObject: ["value": rhs],
                      options: [.sortedKeys]
                  ) else { return false }
            return leftData == rightData
        default:
            return false
        }
    }

    private static func isU1Model(_ value: Any) -> Bool {
        guard let object = value as? [String: Any] else { return false }
        return object["vendor"] as? String == "Snapmaker"
            && object["model"] as? String == "Snapmaker U1"
            && object["nozzle_diameter"] as? String == "0.4"
    }

    private static func containsModel(
        vendor: String,
        model: String,
        nozzle: String,
        in configuration: [String: Any]
    ) -> Bool {
        guard let models = configuration["models"] as? [Any] else { return false }
        return models.contains { value in
            guard let object = value as? [String: Any] else { return false }
            return object["vendor"] as? String == vendor
                && object["model"] as? String == model
                && object["nozzle_diameter"] as? String == nozzle
        }
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { failures.append(message) }
    }

    private struct TestError: LocalizedError {
        let message: String

        init(_ message: String) {
            self.message = message
        }

        var errorDescription: String? { message }
    }
}
