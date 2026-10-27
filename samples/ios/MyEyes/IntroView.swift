import SwiftUI

/// First-launch landing screen. Introduces Clarity, states plainly what the app
/// is not, and hands off to the scanner. Replayable: the host owns the
/// seen-state and supplies the dismissal.
struct IntroView: View {
    /// Called when the person taps "Get started".
    var onContinue: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Entrance progress for the logo mark.
    @State private var markRevealed = false
    /// Drives the repeating outward scan-ring pulse. Never started under reduce motion.
    @State private var pulsing = false
    /// How many staggered copy blocks have been revealed (0...3).
    @State private var revealedSteps = 0

    private let copySteps = 3

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: 32) {
                    Spacer(minLength: 24)
                    logo
                    copy
                    Spacer(minLength: 16)
                    getStarted
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 32)
                .frame(maxWidth: .infinity)
                .frame(minHeight: proxy.size.height, alignment: .center)
            }
        }
        .background(Color.senseBackground.ignoresSafeArea())
        .task { await reveal() }
    }

    // MARK: - Logo and scan rings

    private var logo: some View {
        ZStack {
            // Two concentric rings radiate outward from the eye mark, offset in
            // phase so the sweep reads as continuous active sensing.
            ForEach(0..<2, id: \.self) { index in
                Circle()
                    .stroke(Color.senseTeal.opacity(0.55), lineWidth: 2)
                    .frame(width: 148, height: 148)
                    .scaleEffect(pulsing ? 1.85 : 0.72)
                    .opacity(pulsing ? 0 : 0.9)
                    .animation(
                        .easeOut(duration: 2.4)
                            .repeatForever(autoreverses: false)
                            .delay(Double(index) * 1.2),
                        value: pulsing
                    )
            }

            Circle()
                .fill(Color.senseTeal.opacity(0.12))
                .frame(width: 132, height: 132)

            Image("ClarityLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 96, height: 96)
                .accessibilityHidden(true)
        }
        .frame(width: 280, height: 280)
        .scaleEffect(markRevealed ? 1 : 0.86)
        .opacity(markRevealed ? 1 : 0)
        .accessibilityHidden(true)
    }

    // MARK: - Staggered copy

    private var copy: some View {
        VStack(spacing: 14) {
            Text("Clarity")
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .foregroundStyle(Color.primary)
                .modifier(StepReveal(isVisible: revealedSteps >= 1))

            Text("Object awareness for your surroundings")
                .font(.title3)
                .foregroundStyle(Color.primary)
                .modifier(StepReveal(isVisible: revealedSteps >= 2))

            Text("An experimental awareness tool. Not a navigation or safety aid.")
                .font(.footnote)
                .foregroundStyle(Color.senseMuted)
                .modifier(StepReveal(isVisible: revealedSteps >= 3))
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Primary action

    private var getStarted: some View {
        Button(action: onContinue) {
            Text("Get started")
                .font(.headline)
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.vertical, 8)
                .fixedSize(horizontal: false, vertical: true)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color.senseTeal)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Get started")
        .accessibilityHint("Opens the scanner")
        .modifier(StepReveal(isVisible: revealedSteps >= copySteps))
    }

    // MARK: - Reveal choreography

    /// Reveals the screen. With reduce motion the whole sequence collapses to a
    /// single immediate, unanimated state change and no repeating pulse runs.
    private func reveal() async {
        if reduceMotion {
            markRevealed = true
            revealedSteps = copySteps
            return
        }

        withAnimation(.spring(response: 0.7, dampingFraction: 0.72)) {
            markRevealed = true
        }
        pulsing = true

        for step in 1...copySteps {
            try? await Task.sleep(nanoseconds: 260_000_000)
            withAnimation(.easeOut(duration: 0.45)) {
                revealedSteps = step
            }
        }
    }
}

/// Slide-and-fade entrance for one staggered block. Collapses to a plain
/// visibility toggle when the person prefers reduced motion.
private struct StepReveal: ViewModifier {
    var isVisible: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: reduceMotion ? 0 : (isVisible ? 0 : 14))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.45), value: isVisible)
    }
}

#Preview {
    IntroView(onContinue: {})
}
