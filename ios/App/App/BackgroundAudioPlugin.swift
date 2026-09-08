import AVFoundation
import Capacitor
import MediaPlayer
import UIKit

/// Keeps the app alive for PTT playback while backgrounded or screen-off.
///
/// Do not start AVAudioEngine here. It takes VoiceProcessingIO and mutes
/// WKWebView WebRTC / HTML audio — the reason iOS live listen was silent.
/// Foreground: session only. Background: mixable silent AVAudioPlayer.
@objc(BackgroundAudioPlugin)
public class BackgroundAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundAudioPlugin"
    public let jsName = "BackgroundAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSession", returnType: CAPPluginReturnPromise),
    ]

    private var sessionActive = false
    private var currentBody = "1 channel active"
    private var silentPlayer: AVAudioPlayer?
    private var lifecycleObservers: [NSObjectProtocol] = []

    deinit {
        lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    @objc func startSession(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Presence Torch"
        let body = call.getString("body") ?? "1 channel active"

        DispatchQueue.main.async {
            self.currentBody = body
            self.activatePlaybackSession(title: title)
            call.resolve()
        }
    }

    @objc func updateSession(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Presence Torch"
        let body = call.getString("body") ?? self.currentBody

        DispatchQueue.main.async {
            self.currentBody = body
            if self.sessionActive {
                self.updateNowPlayingInfo(title: title)
            }
            call.resolve()
        }
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.deactivatePlaybackSession()
            call.resolve()
        }
    }

    private func activatePlaybackSession(title: String) {
        if sessionActive {
            return
        }

        AudioSessionCoordinator.retain("background")
        observeAppLifecycle()
        if UIApplication.shared.applicationState != .active {
            AudioSessionCoordinator.refreshIfNeeded()
            startSilentLoop()
        }
        sessionActive = true
    }

    private func deactivatePlaybackSession() {
        guard sessionActive else { return }

        stopSilentLoop()
        AudioSessionCoordinator.release("background")
        sessionActive = false
    }

    private func observeAppLifecycle() {
        guard lifecycleObservers.isEmpty else { return }
        let center = NotificationCenter.default
        lifecycleObservers.append(center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self, self.sessionActive else { return }
            AudioSessionCoordinator.refreshIfNeeded()
            self.startSilentLoop()
        })
        lifecycleObservers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.stopSilentLoop()
            AudioSessionCoordinator.refreshIfNeeded()
        })
    }

    private func updateNowPlayingInfo(title: String) {
        // Leave MPNowPlayingInfoCenter to HeadsetPTT so wired headset buttons keep working.
    }

    private func startSilentLoop() {
        if silentPlayer?.isPlaying == true {
            return
        }
        stopSilentLoop()

        do {
            let player = try AVAudioPlayer(data: Self.silentWavData)
            player.numberOfLoops = -1
            player.volume = 0.01
            player.prepareToPlay()
            player.play()
            silentPlayer = player
        } catch {
            CAPLog.print("BackgroundAudio silent player error:", error.localizedDescription)
        }
    }

    private func stopSilentLoop() {
        silentPlayer?.stop()
        silentPlayer = nil
    }

    /// 1s of 8 kHz mono silence — keeps UIBackgroundModes=audio without AVAudioEngine.
    private static let silentWavData: Data = {
        let sampleRate = 8000
        let frames = sampleRate
        let dataSize = frames * 2
        var data = Data()
        data.reserveCapacity(44 + dataSize)

        func appendLittleEndian<T: FixedWidthInteger>(_ value: T) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }

        data.append(contentsOf: [0x52, 0x49, 0x46, 0x46]) // RIFF
        appendLittleEndian(UInt32(36 + dataSize))
        data.append(contentsOf: [0x57, 0x41, 0x56, 0x45]) // WAVE
        data.append(contentsOf: [0x66, 0x6D, 0x74, 0x20]) // fmt
        appendLittleEndian(UInt32(16))
        appendLittleEndian(UInt16(1))
        appendLittleEndian(UInt16(1))
        appendLittleEndian(UInt32(sampleRate))
        appendLittleEndian(UInt32(sampleRate * 2))
        appendLittleEndian(UInt16(2))
        appendLittleEndian(UInt16(16))
        data.append(contentsOf: [0x64, 0x61, 0x74, 0x61]) // data
        appendLittleEndian(UInt32(dataSize))
        data.append(Data(count: dataSize))
        return data
    }()
}
