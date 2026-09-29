import Capacitor
import Foundation

@objc(PttTonesPlugin)
public class PttTonesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PttTonesPlugin"
    public let jsName = "PttTones"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "playClearTone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playBusyTone", returnType: CAPPluginReturnPromise),
    ]

    @objc func playClearTone(_ call: CAPPluginCall) {
        NativePttTonePlayer.shared.playClear {
            call.resolve()
        }
    }

    @objc func playBusyTone(_ call: CAPPluginCall) {
        NativePttTonePlayer.shared.playBusy {
            call.resolve()
        }
    }
}
