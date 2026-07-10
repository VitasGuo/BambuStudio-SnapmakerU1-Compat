import AppKit
import SwiftUI

final class DialogApplicationDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let input: DialogInput
    private let emitter: DialogResultEmitter
    private var window: NSWindow?
    private var completed = false

    init(input: DialogInput, emitter: DialogResultEmitter) {
        self.input = input
        self.emitter = emitter
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.regular)
        let rootView = DialogView(
            input: input,
            onConfirm: { [weak self] output in self?.complete(output) },
            onCancel: { [weak self] in self?.complete(.cancelled) }
        )
        let hostingView = NSHostingView(rootView: rootView)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 570),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Snapmaker U1 · 确认打印"
        window.contentView = hostingView
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        self.window = window
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        complete(.cancelled)
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func complete(_ output: DialogOutput) {
        guard !completed else { return }
        completed = true
        emitter.emit(output)
        window?.delegate = nil
        window?.close()
        NSApplication.shared.terminate(nil)
    }
}

@main
enum U1PrintDialogMain {
    static func main() {
        do {
            let data = FileHandle.standardInput.readDataToEndOfFile()
            guard !data.isEmpty else { throw DialogProtocolError.emptyInput }
            let input = try DialogInput.decode(data)
            let emitter = DialogResultEmitter()
            let application = NSApplication.shared
            let delegate = DialogApplicationDelegate(input: input, emitter: emitter)
            application.delegate = delegate
            application.run()
        } catch {
            FileHandle.standardError.write(Data("SnapmakerU1DialogHelper: \(error.localizedDescription)\n".utf8))
            let emitter = DialogResultEmitter()
            emitter.emit(.cancelled)
            Foundation.exit(EXIT_FAILURE)
        }
    }
}
