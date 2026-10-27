import Foundation

// Notification framework doubles for executable service tests, not iOS delivery acceptance.
struct UNAuthorizationOptions: OptionSet { let rawValue: Int; static let alert = Self(rawValue: 1); static let sound = Self(rawValue: 2); static let badge = Self(rawValue: 4) }
struct UNNotificationPresentationOptions: OptionSet { let rawValue: Int; static let banner = Self(rawValue: 1); static let list = Self(rawValue: 2); static let sound = Self(rawValue: 4) }
enum AuthorizationStatus { case authorized, provisional, ephemeral, denied, notDetermined }
enum NotificationSetting { case enabled, disabled }
struct UNNotificationSettings { var authorizationStatus: AuthorizationStatus; var timeSensitiveSetting: NotificationSetting }
enum InterruptionLevel { case active, timeSensitive }
enum NotificationSound { case `default` }
class UNMutableNotificationContent { var title = ""; var body = ""; var interruptionLevel = InterruptionLevel.active; var sound: NotificationSound?; var relevanceScore: Double = 0 }
struct UNNotificationRequest { var identifier: String; var content: UNMutableNotificationContent; var trigger: Int? }
struct UNNotification {}
protocol UNUserNotificationCenterDelegate: AnyObject {}
final class UNUserNotificationCenter {
    weak var delegate: (any UNUserNotificationCenterDelegate)?
    var settings = UNNotificationSettings(authorizationStatus: .denied, timeSensitiveSetting: .disabled)
    var requests: [UNNotificationRequest] = []
    var permissionRequests = 0
    static func current() -> UNUserNotificationCenter { UNUserNotificationCenter() }
    func notificationSettings() async -> UNNotificationSettings { settings }
    func requestAuthorization(options: UNAuthorizationOptions) async throws -> Bool { permissionRequests += 1; return settings.authorizationStatus == .authorized }
    func add(_ request: UNNotificationRequest, withCompletionHandler completion: (Error?) -> Void) { requests.append(request); completion(nil) }
}
enum PiPDiagnostics { static func log(_ event: String, _ detail: String) {}; static func error(_ event: String, _ error: Error) {} }

@main struct CriticalAlertsTests {
    @MainActor static func drain() async { for _ in 0..<20 { await Task.yield() } }
    @MainActor static func main() async {
        let center = UNUserNotificationCenter()
        var now: TimeInterval = 100
        let service = CriticalAlerts(center: center, clock: { now })
        precondition(center.delegate === service)
        var presentation: UNNotificationPresentationOptions = []
        service.userNotificationCenter(center, willPresent: UNNotification()) { presentation = $0 }
        precondition(presentation == [.banner, .list, .sound])
        service.requestAuthorization(); await drain()
        precondition(!service.isAuthorized && center.permissionRequests == 1)
        service.postNearAlert(label: "chair"); precondition(center.requests.isEmpty)
        center.settings.authorizationStatus = .authorized
        service.refreshAuthorization(); await drain()
        precondition(service.achievedLevel == .active && center.permissionRequests == 1)
        service.postNearAlert(label: "chair"); service.postNearAlert(label: "chair")
        precondition(center.requests.count == 1 && center.requests[0].trigger == nil)
        now += 3; service.postNearAlert(label: "chair"); precondition(center.requests.count == 2)
        center.settings.timeSensitiveSetting = .enabled
        service.refreshAuthorization(); await drain()
        precondition(service.achievedLevel == .timeSensitive)
        service.postTestAlert(); await drain()
        precondition(center.requests.count == 3)
        precondition(center.requests.last!.content.title == "Clarity test notification")
        precondition(center.requests.last!.content.body.contains("not an obstacle warning"))
        center.settings.authorizationStatus = .denied
        service.refreshAuthorization(); await drain()
        precondition(service.achievedLevel == .unauthorized && !service.isTimeSensitiveAuthorized)
        now += 3; service.postNearAlert(label: "chair"); service.postTestAlert(); await drain()
        precondition(center.requests.count == 3)
        print("PASS notification service: delegate, permission changes, throttle, test channel")
    }
}
