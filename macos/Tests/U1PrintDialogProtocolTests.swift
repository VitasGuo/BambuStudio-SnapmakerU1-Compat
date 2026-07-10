import Foundation

@main
enum U1PrintDialogProtocolTests {
    private static var failures: [String] = []

    static func main() {
        testValidNodePayload()
        testMissingPayloadFailsClosed()
        testMissingUsedMarkerFailsClosed()
        testMalformedPreferredPayloadDoesNotFallBack()
        testNoUsedFilamentsFailsClosed()
        testMissingUsedFilamentMetadataFailsClosed()
        testLegacyFieldWithExplicitUsedIsAccepted()
        testMappingTableContainsOnlyUsedLogicalSlots()

        if failures.isEmpty {
            print("U1PrintDialog protocol tests: 8 passed")
            Foundation.exit(EXIT_SUCCESS)
        }
        for failure in failures {
            FileHandle.standardError.write(Data("FAIL: \(failure)\n".utf8))
        }
        Foundation.exit(EXIT_FAILURE)
    }

    private static func testValidNodePayload() {
        let input = decode([
            "filename": "valid.gcode",
            "gcodeFilaments": [
                ["type": "PLA", "name": "Basic", "color": "#FFFFFF", "used": true],
                ["type": "PETG", "name": "HF", "color": "#000000", "used": false]
            ],
            "machineFilaments": machineFilaments,
            "mappings": [0, -1]
        ])
        expect(input?.usageMetadataError == nil, "valid Node payload should pass metadata validation")
        expect(input?.hasValidUsageMetadata == true, "valid Node payload should allow mapping validation")
        expect(input?.usedLogicalSlots == Set([0]), "only explicitly used logical slot should be active")
        expect(input?.canConfirmPrint(using: input?.mappings ?? []) == true, "valid loaded mapping should allow confirmation")
    }

    private static func testMissingPayloadFailsClosed() {
        let input = decode(["filename": "missing.gcode", "machineFilaments": machineFilaments])
        expect(input?.hasValidUsageMetadata == false, "missing G-code filament payload must fail closed")
        expect(input?.usedLogicalSlots.isEmpty == true, "missing payload must not invent a used slot")
        expect(input?.canConfirmPrint(using: [0]) == false, "missing payload must never confirm")
    }

    private static func testMissingUsedMarkerFailsClosed() {
        let input = decode([
            "gcodeFilaments": [["type": "PLA", "name": "Basic"]],
            "machineFilaments": machineFilaments,
            "mappings": [0]
        ])
        expect(input?.hasValidUsageMetadata == false, "missing used marker must fail closed")
        expect(input?.usageMetadataError?.contains("used") == true, "missing used marker should explain the failure")
        expect(input?.canConfirmPrint(using: [0]) == false, "missing used marker must never confirm")
    }

    private static func testNoUsedFilamentsFailsClosed() {
        let input = decode([
            "gcodeFilaments": [["type": "PLA", "name": "Basic", "used": false]],
            "machineFilaments": machineFilaments,
            "mappings": [-1]
        ])
        expect(input?.hasValidUsageMetadata == false, "all-false used markers must fail closed")
        expect(input?.usedLogicalSlots.isEmpty == true, "all-false payload must have no active logical slots")
        expect(input?.canConfirmPrint(using: [0]) == false, "empty used slot set must never confirm")
    }

    private static func testMalformedPreferredPayloadDoesNotFallBack() {
        let input = decode([
            "gcodeFilaments": "invalid",
            "filaments": [["label": "PLA", "used": true]],
            "machineFilaments": machineFilaments,
            "mappings": [0]
        ])
        expect(input?.hasValidUsageMetadata == false, "malformed preferred payload must not fall back to legacy data")
        expect(input?.usageMetadataError?.contains("格式无效") == true, "malformed payload should explain its format error")
        expect(input?.canConfirmPrint(using: [0]) == false, "malformed preferred payload must never confirm")
    }

    private static func testMissingUsedFilamentMetadataFailsClosed() {
        let input = decode([
            "gcodeFilaments": [["color": "#FFFFFF", "used": true]],
            "machineFilaments": machineFilaments,
            "mappings": [0]
        ])
        expect(input?.hasValidUsageMetadata == false, "used filament without type/name must fail closed")
        expect(input?.canConfirmPrint(using: [0]) == false, "missing used filament metadata must never confirm")
    }

    private static func testLegacyFieldWithExplicitUsedIsAccepted() {
        let input = decode([
            "filaments": [["label": "PLA Basic", "used": true]],
            "machineFilaments": machineFilaments,
            "mappings": [0]
        ])
        expect(input?.hasValidUsageMetadata == true, "legacy filaments key remains compatible when used is explicit")
        expect(input?.canConfirmPrint(using: input?.mappings ?? []) == true, "valid legacy payload should still confirm")
    }

    private static func testMappingTableContainsOnlyUsedLogicalSlots() {
        let output = DialogOutput(
            confirmed: true,
            mappings: [2, 1, -1, -1],
            usedLogicalSlots: Set([0]),
            bedLeveling: true,
            flowCalibration: false,
            timelapse: false
        )
        expect(
            (output.jsonObject["mappingTable"] as? [[Int]]) == [[0, 2]],
            "mappingTable must exclude unused logical slots"
        )
    }

    private static var machineFilaments: [[String: Any]] {
        [
            ["type": "PLA", "subtype": "Basic", "loaded": true],
            ["type": "PETG", "subtype": "HF", "loaded": true],
            ["type": "", "subtype": "", "loaded": false],
            ["type": "", "subtype": "", "loaded": false]
        ]
    }

    private static func decode(_ object: [String: Any]) -> DialogInput? {
        do {
            let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
            return try DialogInput.decode(data)
        } catch {
            failures.append("decode unexpectedly threw: \(error)")
            return nil
        }
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() { failures.append(message) }
    }
}
