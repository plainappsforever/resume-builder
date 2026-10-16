// v1.1: writes test/fixtures/rb-gps-probe.jpg — a 2400x1800 JPEG with GPS EXIF (Berlin) for the photo-copy checks (REVIEW_V1 #2).
// Usage: xcrun swiftc -O scripts/make-gps-probe.swift -o artifacts/bin/make-gps-probe && artifacts/bin/make-gps-probe test/fixtures/rb-gps-probe.jpg

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
let w = 2400, h = 1800
let cs = CGColorSpaceCreateDeviceRGB()
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
for i in 0..<12 { ctx.setFillColor(CGColor(red: CGFloat(i)/12, green: 0.4, blue: 1 - CGFloat(i)/12, alpha: 1)); ctx.fill(CGRect(x: i*200, y: 0, width: 200, height: h)) }
let img = ctx.makeImage()!
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
let gps: [CFString: Any] = [kCGImagePropertyGPSLatitude: 52.52, kCGImagePropertyGPSLatitudeRef: "N", kCGImagePropertyGPSLongitude: 13.405, kCGImagePropertyGPSLongitudeRef: "E"]
let exif: [CFString: Any] = [kCGImagePropertyExifUserComment: "RB-V11-GPS-PROBE", kCGImagePropertyExifDateTimeOriginal: "2026:10:04 09:00:00"]
CGImageDestinationAddImage(dest, img, [kCGImagePropertyGPSDictionary: gps, kCGImagePropertyExifDictionary: exif, kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
print(CGImageDestinationFinalize(dest))
