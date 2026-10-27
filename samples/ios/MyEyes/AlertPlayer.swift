import AVFoundation
import CoreHaptics
import UIKit

/// Retain completed framework objects until their identity check reaches the main actor.
/// Only object identity is inspected; playback remains on the main actor.
private struct CompletedAudioObject: @unchecked Sendable {
    let object: AnyObject
}

@MainActor
final class AlertPlayer: NSObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    private let speech = AVSpeechSynthesizer()
    private let haptics = UINotificationFeedbackGenerator()
    private var player: AVAudioPlayer?
    private var activePlayer: ObjectIdentifier?
    private var activeUtterance: ObjectIdentifier?
    private let proximityHaptic = UIImpactFeedbackGenerator(style: .medium)
    private let nearHaptic = UINotificationFeedbackGenerator()
    private let proximitySpeech = AVSpeechSynthesizer()
    private var proximityPlayer: AVAudioPlayer?
    private var proximityAudioConfigured = false
    /// A rapid burst reads as more urgent than one tap without lasting longer than the cadence.
    static let nearBurstPulses = 3
    static let nearBurstSpacing: TimeInterval = 0.07
    private let criticalAlerts = CriticalAlerts()
    private var hapticEngine: CHHapticEngine?
    private var isNearBand = false
    private var nearLabel: String?

    /// The attention level the system actually granted, for honest UI reporting.
    var criticalAlertLevel: CriticalAlertLevel { criticalAlerts.achievedLevel }
    private lazy var proximity = ProximityFeedback(
        emit: { [weak self] event in self?.emitProximity(event) },
        stopOutputs: { [weak self] in self?.stopProximityOutputs() }
    )

    override init() {
        super.init()
        speech.delegate = self
        criticalAlerts.requestAuthorization()
    }

    /// Root supplies every fresh result. Invalid measured/visual evidence stops feedback.
    func updateProximity(target: Detection?, modes: [AlertMode]) {
        let now = ProcessInfo.processInfo.systemUptime
        guard let target, let input = ProximityFeedbackInput(target: target, modes: modes, now: now) else {
            stopProximity()
            return
        }
        isNearBand = target.freshProximityBand(at: now) == .near
        nearLabel = target.label
        if !proximity.isRunning { stopGenericOutputs() }
        proximity.update(input)
    }

    func stopProximity() {
        isNearBand = false
        nearLabel = nil
        proximity.stop()
    }

    private func emitProximity(_ event: ProximityFeedbackEvent) {
        if (event.sound || event.message != nil) && !proximityAudioConfigured {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try AVAudioSession.sharedInstance().setActive(true)
                proximityAudioConfigured = true
            } catch { PiPDiagnostics.error("audio.proximity.activate.failure", error) }
        }
        if event.haptic {
            if isNearBand {
                // Sharp warning pattern plus a short burst: shorter and more urgent than one tap.
                nearHaptic.prepare()
                nearHaptic.notificationOccurred(.warning)
                playNearBurst()
            } else {
                // One discrete impact per cadence tick, never the multi-pulse warning pattern.
                proximityHaptic.prepare()
                proximityHaptic.impactOccurred()
            }
        }
        if event.sound {
            proximityPlayer?.stop()
            proximityPlayer = try? AVAudioPlayer(data: Self.beep())
            // NEAR raises the floor to unity; the clamp keeps any future tuning in range.
            proximityPlayer?.volume = CriticalAlerts.clampVolume(isNearBand ? 1.0 : 0.65)
            proximityPlayer?.play()
        }
        if isNearBand, let label = nearLabel, event.haptic || event.sound || event.message != nil {
            criticalAlerts.postNearAlert(label: label)
        }
        if let message = event.message, event.replaceSpeech || !proximitySpeech.isSpeaking {
            // Replace rather than queue. Beeps never touch the independent speech channel.
            proximitySpeech.stopSpeaking(at: .immediate)
            let utterance = AVSpeechUtterance(string: message)
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            proximitySpeech.speak(utterance)
        }
    }

    /// CoreHaptics is unavailable on several devices and in the simulator; skip it silently.
    private func playNearBurst() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        do {
            if hapticEngine == nil {
                let engine = try CHHapticEngine()
                engine.resetHandler = { [weak self] in
                    Task { @MainActor [weak self] in self?.hapticEngine = nil }
                }
                engine.stoppedHandler = { _ in }
                hapticEngine = engine
            }
            guard let hapticEngine else { return }
            try hapticEngine.start()
            let events = (0..<Self.nearBurstPulses).map { index in
                CHHapticEvent(eventType: .hapticTransient, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 1)
                ], relativeTime: Double(index) * Self.nearBurstSpacing)
            }
            let player = try hapticEngine.makePlayer(with: try CHHapticPattern(events: events, parameters: []))
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            // The UINotificationFeedbackGenerator warning above already fired.
            PiPDiagnostics.error("haptic.near.burst.failure", error)
            hapticEngine = nil
        }
    }

    private func stopProximityOutputs() {
        proximityPlayer?.stop()
        proximityPlayer = nil
        proximitySpeech.stopSpeaking(at: .immediate)
        proximityAudioConfigured = false
        // PiP owns the active audio session. Do not deactivate it here.
    }

    func deliver(_ modes: [AlertMode], message: String) {
        stopProximity()
        stopGenericOutputs()
        if modes.contains(.sound) || modes.contains(.speech) {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                PiPDiagnostics.log("audio.category.success")
            } catch { PiPDiagnostics.error("audio.category.failure", error) }
            do {
                try AVAudioSession.sharedInstance().setActive(true)
                PiPDiagnostics.log("audio.activate.success")
            } catch { PiPDiagnostics.error("audio.activate.failure", error) }
        }
        if modes.contains(.vibration) {
            haptics.prepare()
            haptics.notificationOccurred(.warning)
        }
        if modes.contains(.sound) {
            player = try? AVAudioPlayer(data: Self.beep())
            player?.volume = CriticalAlerts.clampVolume(0.65)
            player?.delegate = self
            if let player, player.play() { activePlayer = ObjectIdentifier(player) }
        }
        if modes.contains(.speech) {
            let utterance = AVSpeechUtterance(string: message)
            utterance.rate = AVSpeechUtteranceDefaultSpeechRate
            utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
            // Track queued speech too: a short beep can finish before speech starts.
            activeUtterance = ObjectIdentifier(utterance)
            speech.speak(utterance)
        }
        deactivateWhenFinished()
    }

    func stop() {
        stopProximity()
        stopGenericOutputs()
    }

    private func stopGenericOutputs() {
        // Invalidate callbacks before interrupting an earlier generic alert.
        activePlayer = nil
        activeUtterance = nil
        speech.stopSpeaking(at: .immediate)
        player?.stop()
        deactivateWhenFinished()
    }

    private func deactivateWhenFinished() {
        guard activePlayer == nil, activeUtterance == nil else { return }
        // The audio session stays active: deactivating it would end background audio while a
        // video-call Picture in Picture window is scanning. Ducking already yields to other audio.
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        audioEnded(CompletedAudioObject(object: player))
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        audioEnded(CompletedAudioObject(object: player))
    }

    private nonisolated func audioEnded(_ completed: CompletedAudioObject) {
        Task { @MainActor [weak self] in
            guard let self, activePlayer == ObjectIdentifier(completed.object) else { return }
            activePlayer = nil
            deactivateWhenFinished()
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        speechEnded(CompletedAudioObject(object: utterance))
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        speechEnded(CompletedAudioObject(object: utterance))
    }

    private nonisolated func speechEnded(_ completed: CompletedAudioObject) {
        Task { @MainActor [weak self] in
            guard let self, activeUtterance == ObjectIdentifier(completed.object) else { return }
            activeUtterance = nil
            deactivateWhenFinished()
        }
    }

    /// A short PCM WAV avoids bundled audio files or third-party dependencies.
    private static func beep() -> Data {
        let sampleRate = 22_050
        let count = Int(Double(sampleRate) * 0.16)
        var audio = Data()
        for index in 0..<count {
            let time = Double(index) / Double(sampleRate)
            let fade = min(1, min(Double(index) / 200, Double(count - index) / 200))
            let value = Int16(sin(2 * .pi * 880 * time) * 11_000 * fade)
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { audio.append(contentsOf: $0) }
        }
        var data = Data("RIFF".utf8)
        data.appendLE(UInt32(36 + audio.count))
        data.append(contentsOf: "WAVEfmt ".utf8)
        data.appendLE(UInt32(16))
        data.appendLE(UInt16(1))
        data.appendLE(UInt16(1))
        data.appendLE(UInt32(sampleRate))
        data.appendLE(UInt32(sampleRate * 2))
        data.appendLE(UInt16(2))
        data.appendLE(UInt16(16))
        data.append(contentsOf: "data".utf8)
        data.appendLE(UInt32(audio.count))
        data.append(audio)
        return data
    }
}

private extension Data {
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
        var little = value.littleEndian
        Swift.withUnsafeBytes(of: &little) { append(contentsOf: $0) }
    }
}
