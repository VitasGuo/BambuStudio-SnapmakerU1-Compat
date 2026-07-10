import SwiftUI

@main
struct SnapmakerU1BridgeApp: App {
    @StateObject private var model: AppModel

    init() {
        _ = CommandLineInterface.handleIfRequested()
        ArchitectureGuard.enforceForGUI()
        _model = StateObject(wrappedValue: AppModel())
    }

    var body: some Scene {
        WindowGroup {
            ContentView(model: model)
        }
        .commands {
            CommandGroup(after: .appInfo) {
                Button("重新检测状态") {
                    model.refresh()
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
        }
    }
}
