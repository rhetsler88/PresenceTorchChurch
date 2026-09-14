import AVFoundation
import Capacitor
import MediaPlayer

@objc(HeadsetPTTPlugin)
public class HeadsetPTTPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HeadsetPTTPlugin"
    public let jsName = "HeadsetPTT"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTransmitting", returnType: CAPPluginReturnPromise),
    ]

    private var isListening = false
    private var pttHeld = false

    @objc func startListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.activateAudioSession()
            self.registerRemoteCommands()
            self.isListening = true
            UIApplication.shared.beginReceivingRemoteControlEvents()
            self.bridge?.viewController?.becomeFirstResponder()
            call.resolve()
        }
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.isListening = false
            self.pttHeld = false
            self.unregisterRemoteCommands()
            self.clearNowPlayingInfo()
            AudioSessionCoordinator.release("headset")
            call.resolve()
        }
    }

    @objc func setTransmitting(_ call: CAPPluginCall) {
        call.resolve()
    }

    private func activateAudioSession() {
        AudioSessionCoordinator.retain("headset")

        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = "Presence Torch PTT"
        // Rate 0 — remote commands only; do not look like active media (avoids route steal).
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = 0.0
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    private func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func registerRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()

        commandCenter.playCommand.isEnabled = true
        commandCenter.pauseCommand.isEnabled = true
        commandCenter.togglePlayPauseCommand.isEnabled = true
        commandCenter.stopCommand.isEnabled = true
        commandCenter.nextTrackCommand.isEnabled = true
        commandCenter.previousTrackCommand.isEnabled = true

        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.handlePress()
            return .success
        }
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.handleRelease()
            return .success
        }
        commandCenter.stopCommand.addTarget { [weak self] _ in
            self?.handleRelease()
            return .success
        }
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.handleMomentaryPress()
            return .success
        }
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            self?.handleMomentaryPress()
            return .success
        }
        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            self?.handleMomentaryPress()
            return .success
        }
    }

    private func unregisterRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.playCommand.removeTarget(nil)
        commandCenter.pauseCommand.removeTarget(nil)
        commandCenter.togglePlayPauseCommand.removeTarget(nil)
        commandCenter.stopCommand.removeTarget(nil)
        commandCenter.nextTrackCommand.removeTarget(nil)
        commandCenter.previousTrackCommand.removeTarget(nil)
        commandCenter.playCommand.isEnabled = false
        commandCenter.pauseCommand.isEnabled = false
        commandCenter.togglePlayPauseCommand.isEnabled = false
        commandCenter.stopCommand.isEnabled = false
        commandCenter.nextTrackCommand.isEnabled = false
        commandCenter.previousTrackCommand.isEnabled = false
    }

    private func handlePress() {
        guard isListening else { return }
        pttHeld = true
        notifyListeners("pttDown", data: [:])
    }

    private func handleRelease() {
        guard isListening else { return }
        pttHeld = false
        notifyListeners("pttUp", data: [:])
    }

    private func handleMomentaryPress() {
        guard isListening else { return }
        notifyListeners("pttDown", data: [:])
        notifyListeners("pttUp", data: [:])
    }
}
