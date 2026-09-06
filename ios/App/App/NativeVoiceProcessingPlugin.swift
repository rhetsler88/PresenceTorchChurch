import AVFoundation
import Capacitor

/// Configures iOS voice processing before WebView getUserMedia (AVAudioSession voiceChat).
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

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AudioSessionCoordinator.retain("voice")
            self.sessionActive = true
            call.resolve([
                "enabled": true,
                "voiceProcessing": true,
            ])
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.sessionActive else {
                call.resolve()
                return
            }
            self.sessionActive = false
            // Keep the shared session alive so Agora remote playback continues.
            AudioSessionCoordinator.release("voice")
            call.resolve()
        }
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": true])
    }
}
