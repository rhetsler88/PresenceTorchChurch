import Foundation
import Capacitor

enum SessionPrefs {
    private static let googleSignInKey = "google_signin_pending"
    private static let activeSessionKey = "active_session"
    private static let sensitiveOperationKey = "sensitive_operation_pending"

    static func setGoogleSignInPending(_ pending: Bool) {
        UserDefaults.standard.set(pending, forKey: googleSignInKey)
    }

    static func setActiveSession(_ active: Bool) {
        UserDefaults.standard.set(active, forKey: activeSessionKey)
    }

    static func setSensitiveOperationPending(_ pending: Bool) {
        UserDefaults.standard.set(pending, forKey: sensitiveOperationKey)
    }

    static func shouldAllowSessionLogout() -> Bool {
        if UserDefaults.standard.bool(forKey: sensitiveOperationKey) {
            return false
        }
        if UserDefaults.standard.bool(forKey: googleSignInKey) {
            return false
        }
        return UserDefaults.standard.bool(forKey: activeSessionKey)
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
    ]

    @objc func setGoogleSignInPending(_ call: CAPPluginCall) {
        let pending = call.getBool("pending") ?? false
        SessionPrefs.setGoogleSignInPending(pending)
        call.resolve()
    }

    @objc func setActiveSession(_ call: CAPPluginCall) {
        let active = call.getBool("active") ?? false
        SessionPrefs.setActiveSession(active)
        call.resolve()
    }

    @objc func setSensitiveOperationPending(_ call: CAPPluginCall) {
        let pending = call.getBool("pending") ?? false
        SessionPrefs.setSensitiveOperationPending(pending)
        call.resolve()
    }
}
