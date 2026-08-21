import AVFoundation
import Capacitor
import MediaPlayer

/// Keeps the app alive for Storage-relay PTT playback while backgrounded or screen-off.
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
    private var silentEngine: AVAudioEngine?
    private var silentPlayer: AVAudioPlayerNode?

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
            updateNowPlayingInfo(title: title)
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .default,
                options: [.mixWithOthers, .allowBluetooth, .allowBluetoothA2DP]
            )
            try session.setActive(true)
        } catch {
            CAPLog.print("BackgroundAudio session error:", error.localizedDescription)
        }

        startSilentLoop()
        updateNowPlayingInfo(title: title)
        sessionActive = true
    }

    private func deactivatePlaybackSession() {
        guard sessionActive else { return }

        stopSilentLoop()
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil

        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            CAPLog.print("BackgroundAudio deactivate error:", error.localizedDescription)
        }

        sessionActive = false
    }

    private func updateNowPlayingInfo(title: String) {
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = title
        info[MPMediaItemPropertyArtist] = currentBody
        info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func startSilentLoop() {
        stopSilentLoop()

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1) else {
            return
        }

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)

        let frameCount = AVAudioFrameCount(format.sampleRate)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
            return
        }
        buffer.frameLength = frameCount

        do {
            try engine.start()
            player.scheduleBuffer(buffer, at: nil, options: .loops, completionHandler: nil)
            player.play()
            silentEngine = engine
            silentPlayer = player
        } catch {
            CAPLog.print("BackgroundAudio silent loop error:", error.localizedDescription)
        }
    }

    private func stopSilentLoop() {
        silentPlayer?.stop()
        silentEngine?.stop()
        silentPlayer = nil
        silentEngine = nil
    }
}
