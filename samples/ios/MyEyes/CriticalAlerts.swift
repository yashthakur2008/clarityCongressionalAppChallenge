import Foundation
import UserNotifications
import UIKit

/// Which attention level the app is actually able to use, never which one was wished for.
enum CriticalAlertLevel: String {
    case timeSensitive
    case active
    case unauthorized

    var title: String {
        switch self {
        case .timeSensitive: return "Time sensitive alerts"
        case .active: return "Standard alerts"
        case .unauthorized: return "Notifications off"
        }
    }
}

/// Standard local notifications that reach the user while another app is in the foreground.
///
/// Deliberately entitlement-light. `.critical` interruption and `defaultCriticalSound` need the
/// special `com.apple.developer.usernotifications.critical-alerts` entitlement that Apple grants
/// only by request, so this type never asks for `.criticalAlert` and never claims to bypass
/// silent mode or Do Not Disturb. `.timeSensitive` needs only the Time Sensitive Notifications
/// capability; when that is absent iOS silently downgrades delivery to `.active`, which is a fine
/// outcome and cannot fail at runtime.
@MainActor
final class CriticalAlerts: NSObject, UNUserNotificationCenterDelegate {
    static let throttleInterval: TimeInterval = 3

    private(set) var isAuthorized = false
    /// True only when the system reports time-sensitive delivery is permitted for this app.
    private(set) var isTimeSensitiveAuthorized = false
    private var lastPosted: [String: TimeInterval] = [:]
    private var didRequest = false
    private let center: UNUserNotificationCenter?
    private let clock: @MainActor () -> TimeInterval

    var achievedLevel: CriticalAlertLevel {
        guard isAuthorized else { return .unauthorized }
        return isTimeSensitiveAuthorized ? .timeSensitive : .active
    }

    init(center: UNUserNotificationCenter? = CriticalAlerts.defaultCenter(),
         clock: @escaping @MainActor () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.center = center
        self.clock = clock
        super.init()
        // The center retains its delegate weakly. AlertPlayer retains this service.
        center?.delegate = self
        NotificationCenter.default.addObserver(self, selector: #selector(refreshAuthorization),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // iOS otherwise suppresses notifications while the scanner is in the foreground.
        completionHandler([.banner, .list, .sound])
    }

    /// `current()` traps in processes without a bundled app (unit test hosts, command line tools).
    nonisolated static func defaultCenter() -> UNUserNotificationCenter? {
        Bundle.main.bundleIdentifier == nil ? nil : UNUserNotificationCenter.current()
    }

    nonisolated static func clampVolume(_ volume: Float) -> Float {
        min(max(volume, 0), 1)
    }

    /// Plain alert, sound and badge options only. No special entitlement is involved.
    func requestAuthorization() {
        guard let center, !didRequest else { return }
        didRequest = true
        Task { @MainActor in
            do {
                _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            } catch {
                PiPDiagnostics.error("notify.authorize.failure", error)
                didRequest = false
                isAuthorized = false
                isTimeSensitiveAuthorized = false
                return
            }
            let settings = await center.notificationSettings()
            apply(settings)
            PiPDiagnostics.log("notify.authorize", "level=\(achievedLevel.rawValue)")
        }
    }

    private func apply(_ settings: UNNotificationSettings) {
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: isAuthorized = true
        default: isAuthorized = false
        }
        isTimeSensitiveAuthorized = isAuthorized && settings.timeSensitiveSetting == .enabled
    }

    /// Users can grant or revoke permission in Settings without restarting this process.
    @objc private func refreshAuthorization() {
        guard let center else { return }
        Task { @MainActor in
            apply(await center.notificationSettings())
            PiPDiagnostics.log("notify.refresh", "level=\(achievedLevel.rawValue)")
        }
    }

    /// At most one alert every three seconds per label, so a steady NEAR target cannot spam.
    func postNearAlert(label: String) {
        guard let center, isAuthorized else { return }
        let now = clock()
        guard now.isFinite else { return }
        if let previous = lastPosted[label], now >= previous, now - previous < Self.throttleInterval { return }
        lastPosted[label] = now

        let content = UNMutableNotificationContent()
        content.title = "Object very close"
        content.body = "\(label) is very close. Stop and check your surroundings."
        // Downgrades to .active by itself when the capability is missing. Never a runtime failure.
        content.interruptionLevel = isTimeSensitiveAuthorized ? .timeSensitive : .active
        content.sound = .default
        content.relevanceScore = 1
        addNotificationRequest(center: center, content: content, label: label)
    }

    func postTestAlert() {
        guard let center else { return }
        Task { @MainActor in
            // Test immediately after returning from Settings must use current permission.
            apply(await center.notificationSettings())
            guard isAuthorized else { return }
            let content = UNMutableNotificationContent()
            content.title = "Clarity test notification"
            content.body = "Notifications are enabled. This is a test, not an obstacle warning."
            content.interruptionLevel = isTimeSensitiveAuthorized ? .timeSensitive : .active
            content.sound = .default
            let request = UNNotificationRequest(identifier: "clarity.test.\(UUID().uuidString)", content: content, trigger: nil)
            center.add(request) { error in
                if let error { PiPDiagnostics.error("notify.test.failure", error) }
            }
        }
    }

    private func addNotificationRequest(center: UNUserNotificationCenter, content: UNMutableNotificationContent, label: String) {
        // nil trigger delivers immediately; a zero-interval trigger would be rejected.
        let request = UNNotificationRequest(identifier: "proximity.near.\(label).\(UUID().uuidString)", content: content, trigger: nil)
        center.add(request) { error in
            if let error { PiPDiagnostics.error("notify.post.failure", error) }
        }
    }

    func reset() { lastPosted.removeAll() }
}
