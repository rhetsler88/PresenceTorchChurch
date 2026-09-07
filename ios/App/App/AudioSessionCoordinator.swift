import AVFoundation
import Capacitor
import Foundation

/// Single AVAudioSession owner for Agora listen, PTT publish, headset PTT, and
/// background keep-alive.
///
/// Listen uses `.playback` so the orange mic pill is not stuck on. PTT (`voice`)
/// switches to `.playAndRecord` + speaker once, then we leave the session alone.
/// Re-applying `setCategory` during an active WKWebView PeerConnection deadlocks
/// the main thread (frozen mic, then crash).
enum AudioSessionCoordinator {
    private static let lock = NSLock()
    private static var holders = Set<String>()
    private static var observing = false
    private static var applying = false
    private static var currentMode: SessionMode = .idle
    static var onNeedsReplay: ((String) -> Void)?

    private enum SessionMode {
        case idle
        case playback
        case record
    }

    static func startObserving() {
        lock.lock()
        let already = observing
        observing = true
        lock.unlock()
        guard !already else { return }

        NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { _ in
            routeToSpeakerIfRecording()
        }
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { notification in
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let type = raw.flatMap(AVAudioSession.InterruptionType.init(rawValue:))
            if type == .ended {
                routeToSpeakerIfRecording()
                onNeedsReplay?("interruption")
            }
        }
    }

    static func retain(_ holder: String) {
        startObserving()
        let next = mutateHolders { $0.insert(holder) }
        applyIfModeChanged(next)
    }

    static func release(_ holder: String, deactivateIfIdle: Bool = false) {
        let next = mutateHolders { $0.remove(holder) }
        if next == .idle {
            if deactivateIfIdle {
                deactivate()
            }
            lock.lock()
            currentMode = .idle
            lock.unlock()
            return
        }
        applyIfModeChanged(next)
    }

    /// Speaker override only — never `setCategory` (unsafe during WebRTC).
    static func refreshIfNeeded() {
        routeToSpeakerIfRecording()
    }

    private static func desiredMode(_ set: Set<String>) -> SessionMode {
        if set.isEmpty { return .idle }
        if set.contains("voice") { return .record }
        return .playback
    }

    private static func mutateHolders(_ body: (inout Set<String>) -> Void) -> SessionMode {
        lock.lock()
        body(&holders)
        let next = desiredMode(holders)
        lock.unlock()
        return next
    }

    private static func applyIfModeChanged(_ next: SessionMode) {
        lock.lock()
        let changed = currentMode != next
        lock.unlock()
        guard changed else { return }
        applySession(next)
    }

    private static func applySession(_ mode: SessionMode) {
        let work = {
            lock.lock()
            if applying {
                lock.unlock()
                return
            }
            applying = true
            lock.unlock()

            let session = AVAudioSession.sharedInstance()
            do {
                switch mode {
                case .idle:
                    break
                case .playback:
                    try session.setCategory(.playback, mode: .spokenAudio, options: [])
                    try session.setActive(true)
                case .record:
                    try session.setCategory(
                        .playAndRecord,
                        mode: .videoChat,
                        options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP]
                    )
                    try session.setActive(true)
                    routeToSpeaker(session)
                }
                lock.lock()
                currentMode = mode
                applying = false
                lock.unlock()
            } catch {
                lock.lock()
                applying = false
                lock.unlock()
                CAPLog.print("AudioSessionCoordinator error:", error.localizedDescription)
            }
        }

        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private static func routeToSpeakerIfRecording() {
        lock.lock()
        let recording = currentMode == .record
        lock.unlock()
        guard recording else { return }
        routeToSpeaker(AVAudioSession.sharedInstance())
    }

    private static func routeToSpeaker(_ session: AVAudioSession) {
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
