import Capacitor
import UIKit

/// Registers App-target Capacitor plugins the same way Android's MainActivity does.
/// `npx cap sync` only puts npm plugins in packageClassList, so these never auto-load on iOS.
class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SessionGuardPlugin())
        bridge?.registerPluginInstance(HeadsetPTTPlugin())
        bridge?.registerPluginInstance(BackgroundAudioPlugin())
        bridge?.registerPluginInstance(NativeVoiceProcessingPlugin())
    }
}
