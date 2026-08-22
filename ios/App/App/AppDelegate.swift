import Capacitor
import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let viewController = window?.rootViewController as? CAPBridgeViewController {
            SessionGuardBridge.bridgeViewController = viewController
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        guard SessionPrefs.shouldAllowSessionLogout() else { return }

        let deadline = SessionPrefs.getIdleLogoutDeadlineMs()
        let nowMs = Date().timeIntervalSince1970 * 1000
        if deadline > nowMs {
            BackgroundLogoutScheduler.shared.scheduleAt(deadline)
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        BackgroundLogoutScheduler.shared.cancel()
        BackgroundLogoutScheduler.shared.checkDeadlineOnForeground()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        if SessionGuardBridge.bridgeViewController == nil,
           let viewController = window?.rootViewController as? CAPBridgeViewController {
            SessionGuardBridge.bridgeViewController = viewController
        }
        BackgroundLogoutScheduler.shared.checkDeadlineOnForeground()
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
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
