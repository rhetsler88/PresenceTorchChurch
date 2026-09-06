import AVFoundation
import Capacitor

/// Single AVAudioSession owner for Agora listen, PTT publish, headset PTT, and
/// background keep-alive. Android's NativeVoiceProcessing uses
/// MODE_IN_COMMUNICATION + speakerphone; this is the iOS equivalent.
///
/// Do not deactivate the session while any holder is active — `setActive(false)`
/// tears down WKWebView WebRTC playback.
enum AudioSessionCoordinator {
    private static let queue = DispatchQueue(label: "church.presencetorch.audio-session")
    private static var holders = Set<String>()

    static func retain(_ holder: String) {
        queue.sync {
            holders.insert(holder)
            applyVoiceSession()
        }
    }

    static func release(_ holder: String, deactivateIfIdle: Bool = false) {
        queue.sync {
            holders.remove(holder)
            if holders.isEmpty {
                if deactivateIfIdle {
                    deactivate()
                }
                return
            }
            applyVoiceSession()
        }
    }

    static func refreshIfNeeded() {
        queue.sync {
            if !holders.isEmpty {
                applyVoiceSession()
            }
        }
    }

    static func applyVoiceSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP]
            )
            try session.setActive(true)
            routeToSpeakerUnlessBluetooth(session)
        } catch {
            CAPLog.print("AudioSessionCoordinator error:", error.localizedDescription)
        }
    }

    private static func routeToSpeakerUnlessBluetooth(_ session: AVAudioSession) {
        let bluetoothTypes: Set<AVAudioSession.Port> = [
            .bluetoothHFP,
            .bluetoothA2DP,
            .bluetoothLE,
        ]
        let usingBluetooth = session.currentRoute.outputs.contains { bluetoothTypes.contains($0.portType) }
        guard !usingBluetooth else { return }
        do {
            try session.overrideOutputAudioPort(.speaker)
        } catch {
            CAPLog.print("AudioSessionCoordinator speaker route error:", error.localizedDescription)
        }
    }

    private static func deactivate() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            CAPLog.print("AudioSessionCoordinator deactivate error:", error.localizedDescription)
        }
    }
}
