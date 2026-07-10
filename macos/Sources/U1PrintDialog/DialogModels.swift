import Foundation

struct GCodeFilament: Identifiable {
    let id: Int
    let type: String
    let name: String
    let color: String
    let used: Bool

    var displayName: String {
        if !name.isEmpty, name.caseInsensitiveCompare(type) != .orderedSame {
            return "\(type) · \(name)"
        }
        return type
    }
}

struct MachineFilament: Identifiable {
    let id: Int
    let type: String
    let subtype: String
    let loaded: Bool
    let state: String

    var displayName: String {
        let base = type.isEmpty ? "--" : type
        if !subtype.isEmpty, subtype.caseInsensitiveCompare(base) != .orderedSame {
            return "\(base) \(subtype)"
        }
        return base
    }
}

struct DialogInput {
    let protocolVersion: Int
    let filename: String
    let gcodeFilaments: [GCodeFilament]
    let machineFilaments: [MachineFilament]
    let mappings: [Int]
    let bedLeveling: Bool
    let flowCalibration: Bool
    let timelapse: Bool
    let usageMetadataError: String?

    var hasValidUsageMetadata: Bool {
        usageMetadataError == nil && !usedLogicalSlots.isEmpty
    }

    var visibleGCodeFilaments: [GCodeFilament] {
        let used = gcodeFilaments.filter(\.used)
        return used.isEmpty ? gcodeFilaments : used
    }

    var usedLogicalSlots: Set<Int> {
        Set(gcodeFilaments.filter(\.used).map(\.id))
    }

    func canConfirmPrint(using candidateMappings: [Int]) -> Bool {
        guard hasValidUsageMetadata else { return false }
        return usedLogicalSlots.allSatisfy { logicalSlot in
            guard candidateMappings.indices.contains(logicalSlot) else { return false }
            let physicalSlot = candidateMappings[logicalSlot]
            return machineFilaments.indices.contains(physicalSlot)
                && machineFilaments[physicalSlot].loaded
        }
    }

    static func decode(_ data: Data) throws -> DialogInput {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw DialogProtocolError.invalidRoot
        }

        let legacy = object["filaments"] as? [[String: Any]] ?? []
        let rawGCode: [[String: Any]]
        let usageSourceError: String?
        if object.keys.contains("gcodeFilaments") {
            if let parsed = object["gcodeFilaments"] as? [[String: Any]] {
                rawGCode = parsed
                usageSourceError = nil
            } else {
                rawGCode = []
                usageSourceError = "gcodeFilaments 格式无效"
            }
        } else if object.keys.contains("filaments") {
            if let parsed = object["filaments"] as? [[String: Any]] {
                rawGCode = parsed
                usageSourceError = nil
            } else {
                rawGCode = []
                usageSourceError = "filaments 格式无效"
            }
        } else {
            rawGCode = []
            usageSourceError = nil
        }
        let usageMetadataError = usageSourceError ?? validateUsageMetadata(rawGCode)
        var gcodeFilaments = rawGCode.prefix(4).enumerated().map { index, raw in
            let type = nonEmptyString(raw["type"] ?? raw["filamentType"] ?? raw["label"], default: "--")
            let name = nonEmptyString(raw["name"] ?? raw["subtype"] ?? raw["filamentName"], default: "")
            let color = normalizedColor(raw["color"] ?? raw["colour"])
            // Never infer logical G-code usage from machine occupancy (`exist`)
            // or field presence. The Node payload must state `used` explicitly.
            let used = explicitBoolean(raw["used"]) ?? false
            return GCodeFilament(id: index, type: type, name: name, color: color, used: used)
        }
        if gcodeFilaments.isEmpty {
            gcodeFilaments = [GCodeFilament(id: 0, type: "--", name: "", color: "", used: false)]
        }

        let newMachine = object["machineFilaments"] as? [[String: Any]]
        let compatibilityMachine = object["physicalFilaments"] as? [[String: Any]]
        let rawMachine = newMachine ?? compatibilityMachine ?? legacy
        var machineFilaments: [MachineFilament] = []
        for slot in 0..<4 {
            let raw = slot < rawMachine.count ? rawMachine[slot] : [:]
            let type = nonEmptyString(raw["type"] ?? raw["filamentType"] ?? raw["label"], default: "--")
            let subtype = nonEmptyString(raw["subtype"] ?? raw["name"] ?? raw["filamentSubtype"], default: "")
            let loaded = boolean(raw["loaded"] ?? raw["exist"], default: false)
            let state = nonEmptyString(raw["state"], default: loaded ? "已装载" : "空")
            machineFilaments.append(MachineFilament(id: slot, type: type, subtype: subtype, loaded: loaded, state: state))
        }

        let defaultMappings = gcodeFilaments.map { filament -> Int in
            guard filament.used else { return -1 }
            if let exact = machineFilaments.first(where: {
                $0.loaded
                    && $0.type.caseInsensitiveCompare(filament.type) == .orderedSame
                    && !$0.subtype.isEmpty
                    && $0.subtype.caseInsensitiveCompare(filament.name) == .orderedSame
            }) { return exact.id }
            if let typeMatch = machineFilaments.first(where: {
                $0.loaded && $0.type.caseInsensitiveCompare(filament.type) == .orderedSame
            }) { return typeMatch.id }
            if filament.id < 4, machineFilaments[filament.id].loaded { return filament.id }
            return -1
        }
        var mappings = integerArray(object["mappings"]) ?? defaultMappings
        if mappings.count != gcodeFilaments.count || mappings.contains(where: { !(-1..<4).contains($0) }) {
            mappings = defaultMappings
        }

        return DialogInput(
            protocolVersion: integer(object["protocolVersion"]) ?? 1,
            filename: nonEmptyString(object["filename"], default: "未命名打印任务"),
            gcodeFilaments: gcodeFilaments,
            machineFilaments: machineFilaments,
            mappings: mappings,
            bedLeveling: boolean(object["auto_bed_leveling"] ?? object["bedLeveling"], default: true),
            flowCalibration: boolean(object["flow_calibrate"] ?? object["flowCalibration"], default: true),
            timelapse: boolean(object["time_lapse_camera"] ?? object["timelapse"], default: true),
            usageMetadataError: usageMetadataError
        )
    }

    private static func validateUsageMetadata(_ rawGCode: [[String: Any]]) -> String? {
        guard !rawGCode.isEmpty else {
            return "未收到 G-code 耗材元数据"
        }
        guard rawGCode.count <= 4 else {
            return "G-code 耗材槽数超过 U1 支持的 4 槽"
        }
        for (index, raw) in rawGCode.enumerated() {
            guard explicitBoolean(raw["used"]) != nil else {
                return "G-code 耗材 \(index + 1) 缺少明确的 used 标记"
            }
        }

        let usedEntries = rawGCode.enumerated().filter { explicitBoolean($0.element["used"]) == true }
        guard !usedEntries.isEmpty else {
            return "G-code 元数据未标记任何已使用耗材"
        }
        for (index, raw) in usedEntries {
            let type = nonEmptyString(raw["type"] ?? raw["filamentType"], default: "")
            let name = nonEmptyString(raw["name"] ?? raw["subtype"] ?? raw["filamentName"] ?? raw["label"], default: "")
            guard isMeaningfulMetadata(type) || isMeaningfulMetadata(name) else {
                return "G-code 耗材 \(index + 1) 缺少类型或名称元数据"
            }
        }
        return nil
    }

    private static func isMeaningfulMetadata(_ value: String) -> Bool {
        !value.isEmpty && value != "--" && value.lowercased() != "unknown"
    }

    private static func nonEmptyString(_ value: Any?, default fallback: String) -> String {
        if let string = value as? String {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        return fallback
    }

    private static func normalizedColor(_ value: Any?) -> String {
        guard var color = value as? String else { return "" }
        color = color.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if !color.isEmpty, !color.hasPrefix("#") { color = "#" + color }
        let hex = color.dropFirst()
        guard (hex.count == 6 || hex.count == 8), hex.allSatisfy({ $0.isHexDigit }) else { return "" }
        return color
    }

    private static func integer(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return nil
    }

    private static func integerArray(_ value: Any?) -> [Int]? {
        guard let raw = value as? [Any] else { return nil }
        let mapped = raw.compactMap(integer)
        return mapped.count == raw.count ? mapped : nil
    }

    private static func explicitBoolean(_ value: Any?) -> Bool? {
        if let value = value as? Bool { return value }
        if let number = value as? NSNumber {
            let integer = number.intValue
            return integer == 0 ? false : (integer == 1 ? true : nil)
        }
        if let string = value as? String {
            switch string.lowercased() {
            case "1", "true": return true
            case "0", "false": return false
            default: return nil
            }
        }
        return nil
    }

    private static func boolean(_ value: Any?, default fallback: Bool) -> Bool {
        if let value = value as? Bool { return value }
        if let number = value as? NSNumber { return number.boolValue }
        if let string = value as? String {
            switch string.lowercased() {
            case "1", "true", "yes", "on": return true
            case "0", "false", "no", "off": return false
            default: break
            }
        }
        return fallback
    }
}

enum DialogProtocolError: LocalizedError {
    case emptyInput
    case invalidRoot

    var errorDescription: String? {
        switch self {
        case .emptyInput: return "stdin 中没有 JSON 请求"
        case .invalidRoot: return "JSON 根对象必须是字典"
        }
    }
}

struct DialogOutput {
    let confirmed: Bool
    let mappings: [Int]
    let usedLogicalSlots: Set<Int>
    let bedLeveling: Bool
    let flowCalibration: Bool
    let timelapse: Bool

    var jsonObject: [String: Any] {
        let activeMappings = mappings.enumerated().filter {
            usedLogicalSlots.contains($0.offset) && $0.element >= 0
        }
        let selected = Array(Set(activeMappings.map(\.element))).sorted()
        return [
            "protocolVersion": 1,
            "confirmed": confirmed,
            "mappings": mappings,
            "mappingTable": activeMappings.map { [$0.offset, $0.element] },
            "bedLeveling": bedLeveling,
            "flowCalibration": flowCalibration,
            "timelapse": timelapse,
            // Legacy names keep the helper independently useful with older bridges.
            "auto_bed_leveling": bedLeveling,
            "flow_calibrate": flowCalibration,
            "time_lapse_camera": timelapse,
            "selected_extruders": selected
        ]
    }

    static var cancelled: DialogOutput {
        DialogOutput(
            confirmed: false,
            mappings: [],
            usedLogicalSlots: [],
            bedLeveling: false,
            flowCalibration: false,
            timelapse: false
        )
    }
}

final class DialogResultEmitter {
    private var hasEmitted = false

    @discardableResult
    func emit(_ output: DialogOutput) -> Bool {
        guard !hasEmitted else { return false }
        hasEmitted = true
        let data = (try? JSONSerialization.data(withJSONObject: output.jsonObject, options: [.sortedKeys]))
            ?? Data("{\"confirmed\":false}".utf8)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
        try? FileHandle.standardOutput.synchronize()
        return true
    }
}
