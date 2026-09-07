import Capacitor
import GoogleSignIn
import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window?.backgroundColor = UIColor(red: 10 / 255, green: 15 / 255, blue: 26 / 255, alpha: 1)
        if SessionPrefs.consumeUncleanBackgroundExit() {
            SessionPrefs.markForceLogoutOnNextStart()
        }
        SessionGuardBridge.bindBridgeIfNeeded()
        AudioSessionCoordinator.startObserving()
        AudioSessionCoordinator.onNeedsReplay = { reason in
            let escaped = reason.replacingOccurrences(of: "'", with: "")
            SessionGuardBridge.resolveBridgeViewController()?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('ptt-audio-session', { detail: { reason: '\(escaped)' } }));",
                completionHandler: nil
            )
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        guard SessionPrefs.shouldAllowSessionLogout() else { return }

        let deadline = SessionPrefs.getIdleLogoutDeadlineMs()
        let nowMs = Date().timeIntervalSince1970 * 1000
        if deadline > nowMs {
            BackgroundLogoutScheduler.shared.scheduleAt(deadline)
        }
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        guard SessionPrefs.shouldAllowSessionLogout() else { return }

        SessionPrefs.markSessionBackgrounded()

        let deadline = SessionPrefs.getIdleLogoutDeadlineMs()
        let nowMs = Date().timeIntervalSince1970 * 1000
        if deadline > nowMs {
            BackgroundLogoutScheduler.shared.scheduleAt(deadline)
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        BackgroundLogoutScheduler.shared.cancel()
        SessionPrefs.clearSessionBackgrounded()
        BackgroundLogoutScheduler.shared.checkDeadlineOnForeground()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        SessionGuardBridge.bindBridgeIfNeeded()
        SessionGuardBridge.flushPendingLogoutIfNeeded()
        BackgroundLogoutScheduler.shared.checkDeadlineOnForeground()
        AudioSessionCoordinator.refreshIfNeeded()
        SessionGuardBridge.resolveBridgeViewController()?.webView?.evaluateJavaScript(
            "window.dispatchEvent(new Event('resume'));",
            completionHandler: nil
        )
    }

    func applicationWillTerminate(_ application: UIApplication) {
        if SessionPrefs.shouldAllowSessionLogout() {
            SessionPrefs.markForceLogoutOnNextStart()
        }
        notifyImmediateLogout()
    }

    private func notifyImmediateLogout() {
        SessionGuardBridge.evaluateImmediateLogout()
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
