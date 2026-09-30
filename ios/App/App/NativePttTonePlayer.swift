import AVFoundation
import Capacitor
import Foundation

/// Clear (800 Hz ×2) and busy tones for PTT — works when WKWebView audio is suspended.
final class NativePttTonePlayer {
    static let shared = NativePttTonePlayer()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
    private var wired = false

    private init() {}

    func playClear(completion: (() -> Void)? = nil) {
        playBeep(frequency: 800, duration: 0.12) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) {
                self.playBeep(frequency: 800, duration: 0.12, completion: completion)
            }
        }
    }

    func playBusy(completion: (() -> Void)? = nil) {
        playBeep(frequency: 300, duration: 0.6, completion: completion)
    }

    private func playBeep(frequency: Double, duration: Double, completion: (() -> Void)? = nil) {
        DispatchQueue.main.async {
            do {
                try self.ensureEngineRunning()
                let buffer = self.makeSineBuffer(frequency: frequency, duration: duration)
                self.player.scheduleBuffer(buffer, at: nil, options: []) {}
                if !self.player.isPlaying {
                    self.player.play()
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + duration + 0.02) {
                    completion?()
                }
            } catch {
                CAPLog.print("NativePttTonePlayer error:", error.localizedDescription)
                completion?()
            }
        }
    }

    private func ensureEngineRunning() throws {
        if !wired {
            engine.attach(player)
            engine.connect(player, to: engine.mainMixerNode, format: format)
            wired = true
        }
        if !engine.isRunning {
            try engine.start()
        }
    }

    private func makeSineBuffer(frequency: Double, duration: Double) -> AVAudioPCMBuffer {
        let frameCount = AVAudioFrameCount(duration * format.sampleRate)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
        buffer.frameLength = frameCount
        guard let channel = buffer.floatChannelData?[0] else { return buffer }
        let twoPi = 2.0 * Double.pi
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / format.sampleRate
            let attack = min(1.0, t / 0.01)
            let release = min(1.0, (duration - t) / 0.01)
            let envelope = min(attack, release)
            channel[frame] = Float(sin(twoPi * frequency * t) * 0.35 * envelope)
        }
        return buffer
    }
}
