import AVFoundation
import Capacitor

/// Configures iOS voice processing before WebView getUserMedia (AVAudioSession voiceChat + voice processing).
@objc(NativeVoiceProcessingPlugin)
public class NativeVoiceProcessingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeVoiceProcessingPlugin"
    public let jsName = "NativeVoiceProcessing"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    ]

    private var sessionActive = false
    private var previousCategory: AVAudioSession.Category?
    private var previousMode: AVAudioSession.Mode?
    private var previousCategoryOptions: AVAudioSession.CategoryOptions?

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            do {
                if !self.sessionActive {
                    self.previousCategory = session.category
                    self.previousMode = session.mode
                    self.previousCategoryOptions = session.categoryOptions
                }
                try session.setCategory(
                    .playAndRecord,
                    mode: .voiceChat,
                    .allowBluetoothHFP                )
                try session.setActive(true)
                self.sessionActive = true
                call.resolve([
                    "enabled": true,
                    "voiceProcessing": true,
                ])
            } catch {
                call.reject("Failed to enable voice processing", nil, error)
            }
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.sessionActive else {
                call.resolve()
                return
            }
            self.sessionActive = false
            let session = AVAudioSession.sharedInstance()
            do {
                if let category = self.previousCategory, let mode = self.previousMode {
                    try session.setCategory(
                        category,
                        mode: mode,
                        options: self.previousCategoryOptions ?? []
                    )
                }
                try session.setActive(false, options: [.notifyOthersOnDeactivation])
            } catch {
                CAPLog.print("NativeVoiceProcessing disable error:", error.localizedDescription)
            }
            self.previousCategory = nil
            self.previousMode = nil
            self.previousCategoryOptions = nil
            call.resolve()
        }
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": true])
    }
}
