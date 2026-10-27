import Foundation

/// A throughput ceiling, not a promised frame rate: capture and inference remain serial.
enum ScanCadence {
    static let minimumInterval: TimeInterval = 0.1

    /// Called after inference completes. Slow inference adds no cadence wait, while
    /// recovery retains its full retry delay before another frame is requested.
    static func delay(elapsed: TimeInterval, retryDelay: TimeInterval) -> TimeInterval {
        max(retryDelay, max(0, minimumInterval - elapsed))
    }
}
