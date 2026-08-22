import Capacitor
import Foundation
import UIKit

/// Schedules native idle sign-out at a JS-computed deadline.
/// Uses a dispatch timer while the app process is alive; AppDelegate re-checks on foreground.
final class BackgroundLogoutScheduler {
    static let shared = BackgroundLogoutScheduler()

    private var timer: DispatchSourceTimer?
    private let queue = DispatchQueue(label: "church.presencetorch.background-logout")

    private init() {}

    func scheduleAt(_ deadlineMs: Double) {
        cancel()

        guard deadlineMs > 0 else { return }

        let nowMs = Date().timeIntervalSince1970 * 1000
        if deadlineMs <= nowMs {
            DispatchQueue.main.async {
                SessionGuardBridge.notifyBackgroundLogoutTimeout()
            }
            return
        }

        let delaySeconds = (deadlineMs - nowMs) / 1000.0
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + delaySeconds)
        timer.setEventHandler { [weak self] in
            self?.timer = nil
            DispatchQueue.main.async {
                SessionGuardBridge.notifyBackgroundLogoutTimeout()
            }
        }
        timer.resume()
        self.timer = timer
    }

    func cancel() {
        timer?.cancel()
        timer = nil
    }

    func checkDeadlineOnForeground() {
        let deadline = SessionPrefs.getIdleLogoutDeadlineMs()
        guard deadline > 0 else { return }

        let nowMs = Date().timeIntervalSince1970 * 1000
        if nowMs >= deadline {
            SessionGuardBridge.notifyBackgroundLogoutTimeout()
        }
    }
}

enum SessionGuardBridge {
    static weak var bridgeViewController: CAPBridgeViewController?

    static func notifyBackgroundLogoutTimeout() {
        guard SessionPrefs.shouldAllowSessionLogout() else { return }

        let deadline = SessionPrefs.getIdleLogoutDeadlineMs()
        let nowMs = Date().timeIntervalSince1970 * 1000
        if deadline > 0 && nowMs < deadline {
            return
        }

        evaluateImmediateLogout()
    }

    static func evaluateImmediateLogout() {
        guard SessionPrefs.shouldAllowSessionLogout() else { return }
        guard let webView = bridgeViewController?.webView else { return }

        webView.evaluateJavaScript(
            "window.__ptcImmediateLogout && window.__ptcImmediateLogout()",
            completionHandler: nil
        )
    }
}
