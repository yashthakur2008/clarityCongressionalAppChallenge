import AppKit
import Foundation
import WebKit
@main struct UnknownInferenceSmoke {
 static func image(floor: [UInt8], object: [UInt8]?, split: Bool = false) -> Data {
  let w=320,h=416
  let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:w,pixelsHigh:h,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:w*4,bitsPerPixel:32)!
  for y in 0..<h { for x in 0..<w {
   var c=floor
   if split && x>w/2 {c=[35,45,55]}
   if let object, x>=140 && x<170 && y>=280 && y<310 {c=object}
   let p=y*bitmap.bytesPerRow+x*4
   for j in 0..<3 {bitmap.bitmapData![p+j]=c[j]};bitmap.bitmapData![p+3]=255
  }}
  return bitmap.representation(using:.png,properties:[:])!
 }
 @MainActor static func main() {
  NSApplication.shared.setActivationPolicy(.prohibited)
  Task { @MainActor in
   let detector=OfflineDetector(resourceRoot:URL(fileURLWithPath:CommandLine.arguments[1]))
   do {
    var seq=0
    let cases:[(String,[UInt8],[UInt8]? ,Bool)]=[("red-on-tan",[170,150,125],[230,30,35],false),("blue-on-gray",[160,160,160],[25,50,230],false),("dark-on-light",[210,205,190],[20,20,20],false),("light-on-dark",[40,40,45],[230,225,220],false),("uniform",[170,150,125],nil,false),("terrain-split",[170,150,125],nil,true)]
    for (name,floor,obj,split) in cases {
     _ = try await detector.start()
     let data=image(floor:floor,object:obj,split:split)
     var triggered=false
     for frame in 1...4 {
      seq += 1
      let r=try await detector.analyze(jpeg:data,sequence:seq,preferences:ScanPreferences(confidenceThreshold:0.95),capturedAt:ProcessInfo.processInfo.systemUptime)
      let unknown=r.detections.filter { $0.isUnknownObject }
      if obj == nil && !unknown.isEmpty {throw OfflineDetectorError.unavailable("Negative scene \(name) falsely proposed unknown")}
      if frame<3 && !unknown.isEmpty {throw OfflineDetectorError.unavailable("Unknown appeared before 3-frame confirmation")}
      if obj != nil && frame>=3 && unknown.isEmpty {throw OfflineDetectorError.unavailable("Missing unknown on \(name), frame \(frame)")}
      if r.alert.triggered && r.alert.message==Detection.unknownObjectMessage {triggered=true}
      print("CASE \(name) frame=\(frame) unknown=\(unknown.count) reason=\(r.alert.reason) ms=\(r.processingMs)")
     }
     if obj != nil && !triggered {throw OfflineDetectorError.unavailable("No honest unknown alert on \(name)")}
     detector.stop(keepingReadyModel:true)
    }
    detector.stop();print("PASS actual WKWebView unknown fallback for four palettes, temporal alert, uniform floor and broad terrain split");exit(0)
   } catch {detector.stop();fputs("FAIL \(error)\n",stderr);exit(1)}
  }
  NSApplication.shared.run()
 }
}
