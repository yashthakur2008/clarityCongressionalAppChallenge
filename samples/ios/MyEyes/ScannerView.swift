import AVFoundation
import SwiftUI
import UIKit

// One palette for the SwiftUI preview and UIKit floating window. Color never implies safety.
extension ProximityBand {
    var overlayColor: UIColor {
        switch self {
        case .near: return .systemRed
        case .intermediate: return .systemOrange
        case .far: return .systemGreen
        case .outOfRange: return UIColor(red: 0.40, green: 0.53, blue: 0.67, alpha: 1)
        case .unknown: return .systemGray
        }
    }
}

/// Reject an invalid edit rather than silently resetting all distances to defaults.
struct ProximitySettingsEditor {
    static func setting(_ value: Double, at key: WritableKeyPath<ProximitySettings, Double>,
                        in settings: ProximitySettings) -> ProximitySettings? {
        var updated = settings
        updated[keyPath: key] = value
        guard updated.nearMeters.isFinite, updated.intermediateMeters.isFinite, updated.farMeters.isFinite,
              updated.nearMeters >= 0.2, updated.nearMeters < updated.intermediateMeters,
              updated.intermediateMeters < updated.farMeters, updated.farMeters <= 5 else { return nil }
        return updated
    }
}

// Keep room for primary controls while letting the native preview letterbox, never stretch.
enum ScannerPresentation {
    static func previewHeight(width: CGFloat, availableHeight: CGFloat) -> CGFloat {
        guard width.isFinite, availableHeight.isFinite, width > 0, availableHeight > 0 else { return 0 }
        return min(width * 4 / 3, availableHeight * 0.48, 420)
    }

    static func cameraHint(pipSupported: Bool) -> String {
        pipSupported
            ? "Rear camera · floating window supported"
            : "Rear camera · floating window unavailable on this device"
    }
}

struct ScannerView: View {
    @ObservedObject var model: ScanModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showingSettings = false

    private var statusColor: Color {
        if model.phase == .failed || ["unavailable", "stale"].contains(model.alertReason) { return .orange }
        return model.hasCandidate ? .yellow : .senseTeal
    }

    private var title: String {
        switch model.phase {
        case .idle: return "Ready when you are"
        case .connecting: return "Loading offline detector…"
        case .previewing: return "Camera preview only"
        case .paused: return "Scanning paused"
        case .failed: return "Unable to start"
        case .scanning:
            switch model.alertReason {
            case "unavailable": return "Analysis unavailable"
            case "stale": return "Result arrived late"
            case "confirming": return "Checking object"
            case "triggered", "cooldown": return "Object in camera zone"
            default: return "Scanning ahead"
            }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.phase == .connecting && !model.cameraRunning {
                    modelLoadingScreen
                } else {
                    scannerContent
                }
            }
            .navigationTitle("Clarity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showingSettings = true } label: {
                        Label("Settings", systemImage: "gearshape")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .foregroundStyle(.primary)
                    .accessibilityHint("Open alert and scanner settings")
                }
            }
            .sheet(isPresented: $showingSettings) { SettingsView(model: model) }
        }
    }

    private var modelLoadingScreen: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer()
                ProgressView().tint(.senseTeal).scaleEffect(1.4)
                    .accessibilityLabel("Preparing scanner")
                Text("Preparing your scanner")
                    .font(.title2.weight(.semibold))
                    .accessibilityAddTraits(.isHeader)
                Text(model.detail)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.updatesFrequently)
                Text("Camera stays off until the model is ready.")
                    .font(.subheadline)
                    .foregroundStyle(Color.senseMuted)
                Button("Cancel") { model.stop() }
                    .buttonStyle(.bordered)
                    .tint(.primary)
                    .controlSize(.large)
                    .accessibilityHint("Cancel loading without starting the camera")
                Spacer()
            }
            .padding(28)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.senseBackground.ignoresSafeArea())
    }

    private var scannerContent: some View {
        GeometryReader { viewport in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    cameraCard(height: ScannerPresentation.previewHeight(
                        width: max(0, viewport.size.width - 44), availableHeight: viewport.size.height))
                    scannerStatus
                    scannerActions

                    if model.phase == .failed {
                        Button("Cancel") { model.stop() }
                            .buttonStyle(.bordered)
                            .tint(.primary)
                            .controlSize(.large)
                    }

                    Text("Can miss objects. Not a navigation or safety aid. Camera frames stay on this iPhone.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 14) { selectedAlerts }
                        VStack(alignment: .leading, spacing: 8) { selectedAlerts }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)

                    pictureInPictureCard

                    DisclosureGroup("About proximity estimates") {
                        Text("Prototype for selected objects. The image zone does not establish that a path is clear. Optional LiDAR labels estimate axial depth, not safety. Camera frames are processed on this iPhone and are not uploaded.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        proximityLegend.padding(.top, 8)
                    }
                    .frame(minHeight: 44)
                    .tint(.primary)

                    DisclosureGroup("Advanced") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("\(model.checkedFrames) frames checked · \(model.alertCount) alerts")
                            Text(model.modelStatus)
                            if let processing = model.processingMs, let roundTrip = model.roundTripMs {
                                Text("\(roundTrip) ms total · \(processing) ms inference")
                            }
                            if model.preferences.isLidarEnabled {
                                TimelineView(.periodic(from: .now, by: 0.1)) { _ in
                                    Text("Center-surface LiDAR test: \(model.centerSurfaceText)")
                                }
                                Text("Raw center pixel. Not object distance or a safety indication.")
                                Text(model.depthStatus)
                            }
                        }
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)
                    }
                    .frame(minHeight: 44)
                    .tint(.primary)
                }
                .padding(22)
            }
        }
        .background(Color.senseBackground.ignoresSafeArea())
    }

    // Long labels at accessibility sizes must wrap into a readable rectangle
    // instead of stretching one capsule, so both actions stay reachable.
    private var scannerActions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) { startAction; testAlertAction }
            VStack(spacing: 12) { startAction; testAlertAction }
        }
        .buttonBorderShape(.roundedRectangle(radius: 14))
    }

    private var startAction: some View {
        Button {
            if model.isBusy { model.stop() } else { model.start() }
        } label: {
            Label(model.isBusy ? "Stop scanning" : (model.phase == .failed ? "Retry" : "Start scanning"), systemImage: model.isBusy ? "stop.fill" : "viewfinder")
                .font(.body.weight(.semibold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .tint(.senseTeal)
        .foregroundStyle(.black)
        .disabled(model.cameraStopping)
    }

    private var testAlertAction: some View {
        Button { model.testAlert() } label: {
            Group {
                if dynamicTypeSize.isAccessibilitySize {
                    Label("Test selected alerts", systemImage: "speaker.wave.2")
                } else {
                    Label("Test selected alerts", systemImage: "speaker.wave.2").labelStyle(.iconOnly)
                }
            }
            .font(.body)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : 44, minHeight: 44)
            .padding(.vertical, 6)
        }
        .buttonStyle(.bordered)
        .tint(.primary)
        .accessibilityLabel("Test selected alert modes")
    }

    private var header: some View {
        HStack(spacing: 14) {
            Image("ClarityLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 36, height: 36)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Object awareness")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Text("Visual, spoken and vibration cues.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var selectedAlerts: some View {
        Group {
            if model.preferences.alertModes.isEmpty {
                Label("Visual only", systemImage: "eye")
            } else {
                ForEach(model.preferences.alertModes) { mode in
                    Label(mode.title, systemImage: mode.symbol)
                }
            }
        }
    }

    private var scannerStatus: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: model.hasCandidate ? "exclamationmark.triangle.fill" : "viewfinder")
                    .font(.title3)
                    .foregroundStyle(statusColor)
                VStack(alignment: .leading, spacing: 5) {
                    Text(title).font(.headline).foregroundStyle(.primary)
                    Text(model.detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.senseSurface, in: RoundedRectangle(cornerRadius: 18))
    }

    private var proximityLegend: some View {
        let settings = model.preferences.effectiveProximitySettings
        return VStack(alignment: .leading, spacing: 5) {
            if model.lidarHardwareAvailable == false {
                Text("Visual size estimate · not meters")
                    .font(.caption.weight(.semibold))
                Text("Box area in image: ≥ 35% · near · red · 2 Hz\n≥ 12% · intermediate · amber · 1 Hz\n≥ 3% · far · green · 0.5 Hz\nBelow 3% · out of range · muted blue · no pulses\nUnknown · gray · no pulses")
                    .font(.caption.monospacedDigit())
                Text("Based on apparent box size, not physical distance. Object size, camera angle and framing can change this estimate. No meter values are inferred.")
                    .font(.caption)
            } else if model.lidarHardwareAvailable == true {
                Text("Approximate optical-axis depth · not a safety indication")
                    .font(.caption.weight(.semibold))
                Text("Near ≤ \(settings.nearMeters, specifier: "%.1f") m · red · 2 Hz\nIntermediate ≤ \(settings.intermediateMeters, specifier: "%.1f") m · amber · 1 Hz\nFar ≤ \(settings.farMeters, specifier: "%.1f") m · green · 0.5 Hz\nOut of range > \(settings.farMeters, specifier: "%.1f") m · muted blue · no pulses\nUnknown · gray · depth unavailable")
                    .font(.caption.monospacedDigit())
                Text("Valid LiDAR readings take priority. When disabled, missing or rejected, fresh detection-box area supplies a visual proximity estimate, not meters: ≥35% near, ≥12% intermediate, ≥3% far. Stale images remain unknown.")
                    .font(.caption)
            } else {
                Text("Checking depth capability")
                    .font(.caption.weight(.semibold))
                Text("Start scanning to check this device. Fresh detection-box area can supply a visual proximity estimate while depth is unavailable. Without a fresh detection: Unknown · gray · no pulses.")
                    .font(.caption)
            }
            Text("Cadence applies to selected sound/vibration alerts. Green means a farther band, not a clear path. Estimates are not a safety indication.")
                .font(.caption)
        }
        .foregroundStyle(Color.senseMuted)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var pictureInPictureCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 11) {
                Image(systemName: model.pip.isActive ? "pip.fill" : "pip")
                    .font(.title3)
                    .foregroundStyle(model.pip.isActive ? Color.senseTeal : Color.senseMuted)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Floating window").font(.subheadline.weight(.semibold))
                    Text("Background camera access depends on this device. Analysis may pause outside Clarity.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(pipDetail)
                        .font(.caption)
                        .foregroundStyle(Color.senseMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Button {
                model.startPictureInPicture()
            } label: {
                Label("Open floating window now", systemImage: "pip.enter")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.bordered)
            .tint(.primary)
            .controlSize(.large)
            // Only hard blockers disable this. Readiness is handled by start(), which waits and
            // then explains itself, so a stale isPossible cannot silently hide the feature.
            .disabled(model.pip.unavailableReason != nil || model.pip.isActive)
            if let failure = model.pip.failureMessage {
                Text(failure).font(.caption).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.senseSurface, in: RoundedRectangle(cornerRadius: 18))
        .overlay(PiPSourceAnchor(controller: model.pip).allowsHitTesting(false))
    }

    private var pipDetail: String {
        if let reason = model.pip.unavailableReason { return reason }
        if model.pip.isActive {
            return model.multitaskingEnabled == true
                ? "Live camera continues in the floating window. Offline analysis may pause in the background; old boxes expire."
                : "Floating window is open. This device does not grant camera access outside the app, so the window pauses when Clarity is backgrounded."
        }
        if !model.cameraRunning { return "Camera and floating window stay closed until you choose to start. Tap Start scanning to prepare automatic floating-window entry, or open an empty window manually." }
        if model.phase == .previewing { return "Camera preview only. Swipe home, or open the window now." }
        return "Swipe home while scanning, or open the window now."
    }

    private func cameraCard(height: CGFloat) -> some View {
        Group {
            if model.cameraRunning {
                ZStack {
                    CameraPreview(session: model.camera.session)
                    TimelineView(.periodic(from: .now, by: 0.1)) { _ in
                        DetectionOverlay(zone: model.zone, detections: model.detections, imageSize: model.imageSize, now: ProcessInfo.processInfo.systemUptime)
                    }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
                .frame(height: height)
            } else {
                VStack(spacing: 14) {
                    Image(systemName: model.phase == .paused ? "pause.circle" : "viewfinder")
                        .font(.system(size: 52, weight: .ultraLight))
                    Text(model.phase == .connecting ? "Getting ready…" : "Rear camera")
                        .font(.title3.weight(.medium))
                    Text(ScannerPresentation.cameraHint(pipSupported: model.pip.isSupported))
                        .font(.caption)
                        .foregroundStyle(Color.senseMuted)
                    if model.phase == .connecting { ProgressView().tint(.senseTeal) }
                }
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(20)
                .frame(maxWidth: .infinity, minHeight: height)
                .background(LinearGradient(colors: [.senseSurface, .senseSurfaceBottom], startPoint: .topLeading, endPoint: .bottomTrailing))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color(uiColor: .separator), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Rear camera preview. \(model.detections.count) supported objects detected in the last frame.")
    }
}

private struct DetectionOverlay: View {
    let zone: [NormalizedPoint]
    let detections: [Detection]
    let imageSize: CGSize
    let now: TimeInterval

    var body: some View {
        GeometryReader { geometry in
            let rect = containedImage(in: geometry.size)
            Path { path in
                guard let first = zone.first else { return }
                path.move(to: point(first, in: rect))
                for vertex in zone.dropFirst() { path.addLine(to: point(vertex, in: rect)) }
                path.closeSubpath()
            }
            .fill(Color.senseTeal.opacity(0.09))
            Path { path in
                guard let first = zone.first else { return }
                path.move(to: point(first, in: rect))
                for vertex in zone.dropFirst() { path.addLine(to: point(vertex, in: rect)) }
                path.closeSubpath()
            }
            .stroke(Color.senseTeal.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, dash: [7, 6]))

            ForEach(Array(detections.enumerated()), id: \.offset) { _, detection in
                let box = CGRect(x: rect.minX + CGFloat(detection.bbox.x) * rect.width,
                                 y: rect.minY + CGFloat(detection.bbox.y) * rect.height,
                                 width: CGFloat(detection.bbox.width) * rect.width,
                                 height: CGFloat(detection.bbox.height) * rect.height)
                let band = detection.freshProximityBand(at: now)
                let color = Color(uiColor: band.overlayColor)
                let labelWidth = min(rect.width, 250)
                RoundedRectangle(cornerRadius: 7)
                    .stroke(color, lineWidth: 2)
                    .frame(width: box.width, height: box.height)
                    .position(x: box.midX, y: box.midY)
                Text(detection.isUnknownObject ? detection.overlayLabel(at: now) :
                    "\(detection.label)  \(Int(detection.confidence * 100))%\n\(band.title)" + (" · " + (detection.proximityDescription(at: now) ?? "proximity unavailable")))
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.black)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .frame(width: max(0, labelWidth - 12))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 4)
                    .background(color, in: RoundedRectangle(cornerRadius: 4))
                    .position(x: min(max(box.midX, rect.minX + labelWidth / 2), rect.maxX - labelWidth / 2), y: max(rect.minY + 24, box.minY - 24))
                Circle().fill(color).frame(width: 6, height: 6).position(point(detection.anchor, in: rect))
            }
        }
    }

    private func containedImage(in size: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return .zero }
        let scale = min(size.width / imageSize.width, size.height / imageSize.height)
        let fitted = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        return CGRect(x: (size.width - fitted.width) / 2, y: (size.height - fitted.height) / 2, width: fitted.width, height: fitted.height)
    }

    private func point(_ point: NormalizedPoint, in rect: CGRect) -> CGPoint {
        CGPoint(x: rect.minX + CGFloat(point.x) * rect.width, y: rect.minY + CGFloat(point.y) * rect.height)
    }
}

private struct SettingsView: View {
    @ObservedObject var model: ScanModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var preferences: ScanPreferences
    @State private var saving = false
    @State private var errorMessage: String?
    @State private var proximityError: String?

    init(model: ScanModel) {
        self.model = model
        _preferences = State(initialValue: model.preferences)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    alertPresets
                    ForEach(AlertMode.allCases) { mode in
                        alertToggle(for: mode)
                    }
                } header: { Text("Your alerts") } footer: {
                    Text("All options are editable. With every channel off, warnings stay visual. Haptics require supported hardware; test your selected channels before scanning.")
                }

                Section {
                    Text("Experimental YOLOX-Nano · fine-tuned candidate")
                    Text(model.modelStatus).font(.caption).foregroundStyle(.secondary)
                    DisclosureGroup("About the detector") {
                        Text("Testing only. Candidate mAP is worse than baseline. Not safety-certified. All 80 model classes can alert. The 45% default was measured on 300 COCO validation images: it reports about 0.39 of annotated objects at 0.71 precision, versus 0.20 at the old 78.75% default. Raising it returns fewer, more certain detections. iPhone image decoding differs from offline evaluation.").font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(minHeight: 44)
                } header: { Text("Offline detector") } footer: {
                    Text("Fine-tuned model and runtime are bundled on this iPhone. No server, Wi-Fi, or mobile data is needed. Start scanning to load the model.")
                }

                Section {
                    Toggle("Automatic hardware depth", isOn: $preferences.isLidarEnabled)
                        .disabled(model.isBusy || model.cameraRunning || model.cameraStopping || saving)
                    LabeledContent("Capture status", value: model.depthStatus)
                    TimelineView(.periodic(from: .now, by: 0.1)) { _ in
                        LabeledContent("Center-surface test", value: model.centerSurfaceText)
                    }
                    Text("Raw center pixel, not object distance. Requires fresh absolute LiDAR depth.")
                        .font(.caption).foregroundStyle(.secondary)
                } header: { Text("Hardware depth") } footer: {
                    Text("Automatic by default when no choice is saved. Your saved opt-out is preserved. Stop scanning to change hardware depth, then tap Apply. On supported rear cameras, labels show approximate axial depth in meters along the camera's forward axis, not radial distance to an object. Missing, mixed, unreliable, or stale depth is unavailable. Detection continues without LiDAR. Depth does not establish a clear or safe path.")
                }

                Section {
                    distanceStepper("Near", key: \.nearMeters)
                    distanceStepper("Intermediate", key: \.intermediateMeters)
                    distanceStepper("Far", key: \.farMeters)
                    Text("Near < Intermediate < Far. Limits: 0.2–5 m, edited in 0.1 m steps.")
                        .font(.caption).foregroundStyle(.secondary)
                    if let proximityError {
                        Text(proximityError).font(.caption).foregroundStyle(.orange)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    Button("Restore distance defaults") {
                        preferences.proximitySettings = ProximitySettings()
                        proximityError = nil
                    }
                } header: { Text("Proximity distances") } footer: {
                    Text("Approximate optical-axis depth, not radial distance or a safety indication. Near: red, 2 Hz. Intermediate: amber, 1 Hz. Far: green, 0.5 Hz. Beyond Far: muted blue, no pulses. Unknown: gray, no distance pulses. Each upper limit is inclusive. Cadence applies to selected sound/vibration alerts; speech remains an optional alert choice. Missing or stale depth cannot establish a distance band. Green does not mean a clear path.")
                }

                Section("Detection preferences") {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Confidence threshold · \(Int(preferences.confidenceThreshold * 100))%")
                        Slider(value: $preferences.confidenceThreshold, in: 0.4...0.95, step: 0.05)
                            .accessibilityLabel("Object classification confidence threshold")
                        Text("Higher thresholds hide more objects. Start at 45%; lower scores can include more incorrect labels.")
                            .font(.caption).foregroundStyle(.secondary)
                        if preferences.confidenceThreshold >= 0.7 {
                            Label("This high threshold can miss chairs, backpacks and other objects.", systemImage: "exclamationmark.triangle")
                                .font(.caption).foregroundStyle(.orange)
                        }
                        Button("Use recommended 45%") {
                            preferences.confidenceThreshold = ScanPreferences.candidateConfidenceDefault
                        }
                    }
                    Stepper("Repeat after \(preferences.cooldownMs / 1000) seconds", value: $preferences.cooldownMs, in: 1000...10000, step: 1000)
                    Text("Confidence is a classification score, not a distance or safety estimate.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("Camera diagnostics") {
                    LabeledContent("Multitasking API support", value: model.multitaskingSupported.map { $0 ? "Yes" : "No" } ?? "Not queried")
                    LabeledContent("Background camera access", value: model.multitaskingEnabled.map { $0 ? "Enabled" : "Not enabled" } ?? "Not queried")
                    LabeledContent("Picture in Picture", value: model.pip.isSupported ? (model.pip.isActive ? "Active" : "Available") : "Unsupported")
                    Text("Queried from AVCaptureSession after starting the camera. The app requests video-call Picture in Picture with the voip background mode. Where background camera access is unavailable, the floating window shows a paused state instead of a live feed.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.orange) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.senseBackground.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Applying…" : "Apply") {
                        saving = true
                        errorMessage = nil
                        Task {
                            do {
                                try await model.applyPreferences(preferences)
                                dismiss()
                            } catch { errorMessage = error.localizedDescription }
                            saving = false
                        }
                    }
                    .disabled(saving || model.phase == .connecting || model.cameraStopping)
                }
            }
            .disabled(saving)
        }
        .tint(.primary)
        .controlSize(.large)
    }

    // A switch beside a long wrapped label overlaps it, so at accessibility sizes
    // the label moves above its own control.
    private func alertToggle(for mode: AlertMode) -> some View {
        let binding = Binding(get: { preferences.alertModes.contains(mode) }, set: { enabled in
            if enabled { preferences.alertModes.append(mode) }
            else { preferences.alertModes.removeAll { $0 == mode } }
            preferences.alertModes = AlertMode.allCases.filter { preferences.alertModes.contains($0) }
        })
        return Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    Label(mode.title, systemImage: mode.symbol)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Toggle(isOn: binding) { EmptyView() }
                        .labelsHidden()
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(mode.title)
            } else {
                Toggle(isOn: binding) {
                    Label(mode.title, systemImage: mode.symbol)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var alertPresets: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 12) { presetButtons }
            } else {
                HStack(spacing: 16) { presetButtons }
            }
        }
        .buttonStyle(.borderless)
    }

    private var presetButtons: some View {
        Group {
            Button("Standard preset") { preferences.alertModes = [.sound] }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            Button("Spoken preset") { preferences.alertModes = [.speech] }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
    }

    private func distanceStepper(_ title: String, key: WritableKeyPath<ProximitySettings, Double>) -> some View {
        let value = preferences.effectiveProximitySettings[keyPath: key]
        return Stepper("\(title) up to \(value, specifier: "%.1f") m", value: Binding(
            get: { preferences.effectiveProximitySettings[keyPath: key] },
            set: { proposed in
                // Normalize stepper arithmetic before checking strict ordering.
                let rounded = (proposed * 10).rounded() / 10
                guard let updated = ProximitySettingsEditor.setting(rounded, at: key, in: preferences.effectiveProximitySettings) else {
                    proximityError = "Distance unchanged. Keep 0.2 ≤ Near < Intermediate < Far ≤ 5 m. Adjust the neighboring limit first."
                    return
                }
                preferences.proximitySettings = updated
                proximityError = nil
            }), in: 0.2...5, step: 0.1)
            .accessibilityHint("Upper distance limit. Must stay ordered: Near, Intermediate, Far.")
    }
}
