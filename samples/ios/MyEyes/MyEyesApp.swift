import AVFoundation
import SwiftUI

@main
struct MyEyesApp: App {
    @StateObject private var model = ScanModel()
    @Environment(\.scenePhase) private var scenePhase
    /// First-launch state. Clearing this key replays the intro.
    @AppStorage("clarity.introSeen") private var introSeen = false

    init() {
        PiPDiagnostics.log("app.launch", "backgroundModes=\(Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") ?? [])")
        // Video-call Picture in Picture requires an audio session that permits background
        // playback. The same session is reused for beeps and spoken alerts.
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            PiPDiagnostics.log("audio.category.success")
        } catch { PiPDiagnostics.error("audio.category.failure", error) }
        do {
            try AVAudioSession.sharedInstance().setActive(true)
            PiPDiagnostics.log("audio.activate.success")
        } catch { PiPDiagnostics.error("audio.activate.failure", error) }
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                ScannerView(model: model)
                if !introSeen {
                    IntroView {
                        withAnimation(.easeInOut(duration: 0.35)) { introSeen = true }
                    }
                    .transition(.opacity)
                    .zIndex(1)
                }
            }
            .tint(.senseTeal)
                .onChange(of: scenePhase) { phase in
                    PiPDiagnostics.log("scene.phase", "value=\(phase)")
                    switch phase {
                    case .background: model.pauseForBackground()
                    case .active: model.returnedToForeground()
                    default: break
                    }
                }
        }
    }
}

extension Color {
    // Semantic native surfaces with the coral brand accent. Proximity colors stay independent.
    static let senseBackground = Color(uiColor: .systemGroupedBackground)
    static let senseTeal = Color(red: 243 / 255, green: 139 / 255, blue: 104 / 255)
    static let senseSurface = Color(uiColor: .secondarySystemGroupedBackground)
    static let senseSurfaceBottom = Color(uiColor: .tertiarySystemGroupedBackground)
    static let senseMuted = Color(uiColor: .secondaryLabel)
    static let senseNavigation = Color(uiColor: .systemBackground)
}
