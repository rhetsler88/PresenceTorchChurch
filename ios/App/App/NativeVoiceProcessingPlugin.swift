import AVFoundation
import Capacitor

/// Configures iOS voice processing before WebView getUserMedia / Agora WebRTC.
@objc(NativeVoiceProcessingPlugin)
public class NativeVoiceProcessingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeVoiceProcessingPlugin"
    public let jsName = "NativeVoiceProcessing"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareListen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseListen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hasEarpieceConnected", returnType: CAPPluginReturnPromise),
    ]

    private var sessionActive = false
    private var listenActive = false

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

    @objc func prepareListen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AudioSessionCoordinator.retain("agora")
            self.listenActive = true
            call.resolve(["prepared": true])
        }
    }

    @objc func releaseListen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.listenActive else {
                call.resolve()
                return
            }
            self.listenActive = false
            AudioSessionCoordinator.release("agora")
            call.resolve()
        }
    }

    @objc func refresh(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AudioSessionCoordinator.refreshIfNeeded()
            call.resolve(["refreshed": true])
        }
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": true])
    }

    @objc func hasEarpieceConnected(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "connected": AudioSessionCoordinator.isEarpieceOrHeadsetConnected(),
            ])
        }
    }
}
