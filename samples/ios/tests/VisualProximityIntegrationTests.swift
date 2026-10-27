import Foundation

@main struct VisualProximityIntegrationTests {
    static func main() {
        let detection = Detection(label: "chair", confidence: 0.99,
            bbox: .init(x: 0.1, y: 0.1, width: 0.7, height: 0.7),
            anchor: .init(x: 0.45, y: 0.8), inZone: true)
        func enriched(_ lidar: Bool?, time: Double = 100, depth: Float? = nil,
                      enabled: Bool = true, matched: Bool = true) -> Detection {
            let snapshot = depth.map { DepthSnapshot(width: 20, height: 20,
                meters: Array(repeating: $0, count: 400), capturedAt: time) }
            return detection.addingProximity(from: snapshot, lidarCapable: lidar,
                enabled: enabled, matchingFrame: matched, capturedAt: time, now: time + 0.1)
        }
        var unknown = Detection(label: "Possible unknown object", confidence: 0,
            bbox: detection.bbox, anchor: detection.anchor, inZone: true)
        precondition(unknown.isUnknownObject && !detection.isUnknownObject)
        precondition(unknown.isFreshAppearance(capturedAt: 100, now: 100.749))
        for now in [99.9, 100.75, 102.0, Double.nan, Double.infinity] {
            precondition(!unknown.isFreshAppearance(capturedAt: 100, now: now))
        }
        let nearMiss = Detection(label: "possible unknown object", confidence: 0,
            bbox: detection.bbox, anchor: detection.anchor, inZone: true)
        precondition(!nearMiss.isUnknownObject, "sentinel matching must be exact")
        for lidar in [false, true] {
            unknown.depthMeters = 0.5
            unknown.depthRequested = true
            unknown.depthExpiresAt = 100.75
            unknown.enrichProximity(lidarCapable: lidar, capturedAt: 100)
            precondition(unknown.depthMeters == nil && unknown.depthRequested != true)
            precondition(unknown.depthExpiresAt == nil && unknown.proximitySource == nil)
            precondition(unknown.visualProximityArea == nil && unknown.proximityExpiresAt == nil)
            precondition(unknown.freshProximitySource(at: 100.1) == nil)
            precondition(unknown.freshProximityDepth(at: 100.1) == nil)
            precondition(unknown.freshProximityBand(at: 100.1) == .unknown)
            precondition(unknown.depthLabel(at: 100.1) == nil)
            precondition(unknown.overlayLabel(at: 100.1) == "Possible unknown object\nAppearance contrast · unclassified")
            precondition(unknown.overlayLabel(at: 100.1, compact: true) == unknown.overlayLabel(at: 100.1))
        }
        precondition(detection.overlayLabel(at: 100.1).contains("99%"))
        var unknownPolicy = ProximityPolicy()
        let unknownOutput = unknownPolicy.update([unknown], settings: .init(), now: 100.1)
        precondition(ProximityAlertRoute.select(unknownOutput, now: 100.1, genericTriggered: true) == .detectionOnly(shouldAlert: true), "JS preconfirmation must not require another native frame")
        precondition(ProximityAlertRoute.select(unknownOutput, now: 100.1, genericTriggered: false) == .detectionOnly(shouldAlert: false))
        var policy = ProximityPolicy()
        let first = policy.update([enriched(false)], settings: .init(), now: 100.1)
        precondition(first[0].freshProximityBand(at: 100.1) == .near)
        precondition(ProximityFeedbackInput(target: first[0], modes: [.sound], now: 100.1) == nil)
        let second = policy.update([enriched(false, time: 100.2)], settings: .init(), now: 100.3)
        guard case .proximity(let target) = ProximityAlertRoute.select(second, now: 100.3, genericTriggered: false),
              let input = ProximityFeedbackInput(target: target, modes: [.sound, .vibration, .speech], now: 100.3)
        else { fatalError("two fresh visual observations must route to selected feedback") }
        precondition(target.depthMeters == nil && target.freshProximityDepth(at: 100.3) == nil)
        precondition(input.interval == 0.5 && input.sound && input.haptic && input.speech)
        precondition(input.message.contains("visual proximity estimate"))
        precondition(!input.message.contains("meters"))
        var cadence = ProximityCadence()
        let output = cadence.tick(input, at: 100.3)
        precondition(output.sound && output.haptic && output.message != nil)
        precondition(cadence.tick(input, at: 100.4).isEmpty)
        precondition(cadence.tick(input, at: 100.95).isEmpty, "expired visual result must stop output")
        precondition(ProximityFeedbackInput(target: target, modes: [.sound], now: 100.95) == nil)
        for fallback in [enriched(true), enriched(nil), enriched(true, depth: 1.5, enabled: false), enriched(true, depth: .nan)] {
            precondition(fallback.freshProximitySource(at: 100.1) == .visual, "unusable LiDAR must fall back to fresh box area")
            precondition(fallback.depthMeters == nil && fallback.freshProximityDepth(at: 100.1) == nil)
            precondition(abs(fallback.visualProximityArea! - 0.49) < 1e-12)
            precondition(fallback.freshProximitySource(at: 100.75) == nil, "visual fallback must expire with RGB frame")
        }
        precondition(enriched(false, matched: false).freshProximitySource(at: 100.1) == nil,
                     "an unproven RGB frame cannot supply a visual estimate")
        var measuredPolicy = ProximityPolicy()
        _ = measuredPolicy.update([enriched(true, depth: 2.5)], settings: .init(), now: 100.1)
        let measured = measuredPolicy.update([enriched(true, time: 100.2, depth: 2.5)], settings: .init(), now: 100.3)[0]
        precondition(measured.freshProximityBand(at: 100.3) == .far, "large box must not override measured LiDAR")
        let measuredInput = ProximityFeedbackInput(target: measured, modes: [.speech], now: 100.3)!
        precondition(!measuredInput.sound && !measuredInput.haptic && measuredInput.speech)
        precondition(measuredInput.message.contains("2.5") && !measuredInput.message.contains("visual proximity estimate"))
        var conflictingExpiry = measured
        conflictingExpiry.proximityExpiresAt = 101
        precondition(ProximityFeedbackInput(target: conflictingExpiry, modes: [.sound], now: 100.3)?.expiry == measured.depthExpiresAt,
                     "measured source expiry must control output, not another timestamp")
        var outsidePolicy = ProximityPolicy()
        _ = outsidePolicy.update([enriched(true, depth: 4)], settings: .init(), now: 100.1)
        let outside = outsidePolicy.update([enriched(true, time: 100.2, depth: 4)], settings: .init(), now: 100.3)[0]
        precondition(ProximityFeedbackInput(target: outside, modes: [.sound, .speech], now: 100.3) == nil,
                     "confirmed out-of-range target must not produce any proximity channel")
        print("PASS real visual/LiDAR enrichment → policy → routing → feedback; no fabricated meters")
    }
}
