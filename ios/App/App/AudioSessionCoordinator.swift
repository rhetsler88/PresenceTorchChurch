import AVFoundation
import Capacitor
import Foundation

/// Single AVAudioSession owner for Agora listen, PTT publish, headset PTT, and
/// background keep-alive. Android's NativeVoiceProcessing uses
/// MODE_IN_COMMUNICATION + speakerphone; this is the iOS equivalent.
///
/// Do not deactivate the session while any holder is active — `setActive(false)`
/// tears down WKWebView WebRTC playback.
///
/// WebKit resets the session to the earpiece when a PeerConnection starts.
/// Re-apply speaker on a timer and on route/interruption notifications.
enum AudioSessionCoordinator {
    private static let queue = DispatchQueue(label: "church.presencetorch.audio-session")
    private static var holders = Set<String>()
    private static var observing = false
    private static var refreshTimer: Timer?
    static var onNeedsReplay: ((String) -> Void)?

    static func startObserving() {
        queue.sync {
            guard !observing else { return }
            observing = true
            let center = NotificationCenter.default
            center.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: nil,
                queue: .main
            ) { _ in
                refreshIfNeeded()
                onNeedsReplay?("route")
            }
            center.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: nil,
                queue: .main
            ) { notification in
                let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                let type = raw.flatMap(AVAudioSession.InterruptionType.init(rawValue:))
                if type == .ended {
                    refreshIfNeeded()
                    onNeedsReplay?("interruption")
                }
            }
        }
    }

    static func retain(_ holder: String) {
        startObserving()
        queue.sync {
            holders.insert(holder)
            applyVoiceSession()
            startRefreshTimerLocked()
        }
    }

    static func release(_ holder: String, deactivateIfIdle: Bool = false) {
        queue.sync {
            holders.remove(holder)
            if holders.isEmpty {
                stopRefreshTimerLocked()
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
            // videoChat + defaultToSpeaker matches Android speakerphone PTT.
            // voiceChat prefers the earpiece and sounds like "no audio".
            try session.setCategory(
                .playAndRecord,
                mode: .videoChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP]
            )
            try session.setActive(true)
            routeToSpeakerUnlessBluetooth(session)
        } catch {
            CAPLog.print("AudioSessionCoordinator error:", error.localizedDescription)
        }
    }

    private static func startRefreshTimerLocked() {
        DispatchQueue.main.async {
            guard refreshTimer == nil else { return }
            refreshTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                refreshIfNeeded()
            }
            if let timer = refreshTimer {
                RunLoop.main.add(timer, forMode: .common)
            }
        }
    }

    private static func stopRefreshTimerLocked() {
        DispatchQueue.main.async {
            refreshTimer?.invalidate()
            refreshTimer = nil
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
