import Capacitor
import Foundation
import GoogleSignIn
import UIKit
import UserNotifications

enum SessionPrefs {
    private static let googleSignInKey = "google_signin_pending"
    private static let activeSessionKey = "active_session"
    private static let sensitiveOperationKey = "sensitive_operation_pending"
    private static let idleLogoutDeadlineKey = "idle_logout_deadline_ms"
    private static let forceLogoutKey = "force_logout_on_next_start"
    private static let sessionBackgroundedKey = "session_backgrounded_with_active_session"

    private static var defaults: UserDefaults {
        .standard
    }

    static func setGoogleSignInPending(_ pending: Bool) {
        defaults.set(pending, forKey: googleSignInKey)
    }

    static func setActiveSession(_ active: Bool) {
        defaults.set(active, forKey: activeSessionKey)
    }

    static func setSensitiveOperationPending(_ pending: Bool) {
        defaults.set(pending, forKey: sensitiveOperationKey)
    }

    static func setIdleLogoutDeadlineMs(_ deadlineMs: Double) {
        defaults.set(deadlineMs, forKey: idleLogoutDeadlineKey)
    }

    static func getIdleLogoutDeadlineMs() -> Double {
        defaults.double(forKey: idleLogoutDeadlineKey)
    }

    /// Durable swipe-away / kill flag — survives WebView teardown.
    static func markForceLogoutOnNextStart() {
        defaults.set(true, forKey: forceLogoutKey)
        defaults.set(false, forKey: activeSessionKey)
        defaults.set(0, forKey: idleLogoutDeadlineKey)
        defaults.synchronize()
    }

    static func consumeForceLogoutOnNextStart() -> Bool {
        guard defaults.bool(forKey: forceLogoutKey) else {
            return false
        }
        defaults.removeObject(forKey: forceLogoutKey)
        defaults.set(false, forKey: activeSessionKey)
        defaults.synchronize()
        return true
    }

    static func clearForceLogoutOnNextStart() {
        defaults.removeObject(forKey: forceLogoutKey)
        defaults.synchronize()
    }

    /// Set when the app backgrounds with a live session; cleared on a normal foreground return.
    static func markSessionBackgrounded() {
        defaults.set(true, forKey: sessionBackgroundedKey)
    }

    static func clearSessionBackgrounded() {
        defaults.removeObject(forKey: sessionBackgroundedKey)
    }

    /// App was backgrounded and relaunched without a clean foreground return (swipe-away / kill).
    static func consumeUncleanBackgroundExit() -> Bool {
        guard defaults.bool(forKey: sessionBackgroundedKey) else {
            return false
        }
        defaults.removeObject(forKey: sessionBackgroundedKey)
        defaults.synchronize()
        return true
    }

    static func shouldAllowSessionLogout() -> Bool {
        if defaults.bool(forKey: sensitiveOperationKey) {
            return false
        }
        if defaults.bool(forKey: googleSignInKey) {
            return false
        }
        return defaults.bool(forKey: activeSessionKey)
    }
}

@objc(SessionGuardPlugin)
public class SessionGuardPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionGuardPlugin"
    public let jsName = "SessionGuard"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setGoogleSignInPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSensitiveOperationPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIdleLogoutDeadline", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeForceLogoutOnNextStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "revokeGoogleSignInSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearTextMessageNotifications", returnType: CAPPluginReturnPromise),
    ]

    @objc func setGoogleSignInPending(_ call: CAPPluginCall) {
        let pending = call.getBool("pending") ?? false
        SessionPrefs.setGoogleSignInPending(pending)
        call.resolve()
    }

    @objc func setActiveSession(_ call: CAPPluginCall) {
        let active = call.getBool("active") ?? false
        SessionPrefs.setActiveSession(active)
        if !active {
            SessionPrefs.clearForceLogoutOnNextStart()
            SessionPrefs.clearSessionBackgrounded()
            BackgroundLogoutScheduler.shared.cancel()
        }
        call.resolve()
    }

    @objc func setSensitiveOperationPending(_ call: CAPPluginCall) {
        let pending = call.getBool("pending") ?? false
        SessionPrefs.setSensitiveOperationPending(pending)
        call.resolve()
    }

    @objc func setIdleLogoutDeadline(_ call: CAPPluginCall) {
        let deadlineMs = call.getDouble("deadlineMs") ?? 0
        SessionPrefs.setIdleLogoutDeadlineMs(deadlineMs)

        let nowMs = Date().timeIntervalSince1970 * 1000
        if deadlineMs > nowMs {
            BackgroundLogoutScheduler.shared.scheduleAt(deadlineMs)
        } else {
            BackgroundLogoutScheduler.shared.cancel()
        }

        call.resolve()
    }

    @objc func consumeForceLogoutOnNextStart(_ call: CAPPluginCall) {
        let pending = SessionPrefs.consumeForceLogoutOnNextStart()
        call.resolve(["pending": pending])
    }

    @objc func revokeGoogleSignInSession(_ call: CAPPluginCall) {
        GIDSignIn.sharedInstance.signOut()
        call.resolve()
    }

    @objc func clearTextMessageNotifications(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getDeliveredNotifications { notifications in
            let ids = notifications.compactMap { notification -> String? in
                let content = notification.request.content
                if content.threadIdentifier.hasPrefix("text_message_") {
                    return notification.request.identifier
                }
                if content.userInfo["type"] as? String == "text_message" {
                    return notification.request.identifier
                }
                return nil
            }
            if !ids.isEmpty {
                UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
            }
            DispatchQueue.main.async {
                UIApplication.shared.applicationIconBadgeNumber = 0
            }
            call.resolve()
        }
    }
}
