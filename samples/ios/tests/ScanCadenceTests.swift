import Foundation

@main
struct ScanCadenceTests {
    static func main() {
        func expect(_ elapsed: Double, retry: Double = 0, _ expected: Double) {
            let delay = ScanCadence.delay(elapsed: elapsed, retryDelay: retry)
            precondition(abs(delay - expected) < 0.000000001, "elapsed=\(elapsed), retry=\(retry): \(delay) != \(expected)")
        }
        expect(0, 0.1)
        expect(0.04, 0.06)
        expect(0.1, 0)
        expect(0.25, 0)
        expect(2.5, 0)
        expect(0.04, retry: 1, 1)
        expect(2.5, retry: 1, 1)
        // Serial capture/inference cycles cannot outrun the cap or add delay to slow inference.
        for elapsed in [0.0, 0.02, 0.09, 0.1, 0.2, 1.0] {
            let cycle = elapsed + ScanCadence.delay(elapsed: elapsed, retryDelay: 0)
            precondition(abs(cycle - max(0.1, elapsed)) < 0.000000001)
        }
        print("PASS 100ms cadence cap, inference-bound throughput and retry backoff")
    }
}
