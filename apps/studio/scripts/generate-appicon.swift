#!/usr/bin/env swift
//
//  generate-appicon.swift
//  GraceChords Studio
//
//  Builds Studio's macOS app icon from apps/mobile's icon, so the Mac app and the
//  iPhone app are recognisably the same product without a second source image to
//  keep in step.
//
//    swift apps/studio/scripts/generate-appicon.swift
//
//  Run it after changing apps/mobile/assets/icon.png, and commit the PNGs it writes
//  — an Xcode build cannot run this, the same reason the design tokens are mirrored
//  into committed Swift.
//
//  **It is not a copy, because iOS and macOS icons are not the same shape.** An iOS
//  icon is a full-bleed square that the system masks at display time; a macOS icon
//  is masked by nobody — what you supply is what is drawn. Dropping the square in
//  unchanged gives a hard-cornered tile that reads as broken next to every other
//  icon in the Dock. So the artwork is composited onto a transparent canvas inside
//  the shape and margins Apple's macOS icon grid specifies: the icon occupies
//  824/1024 of the canvas, leaving a 100-unit margin, with a corner radius of
//  185.4/824.
//
//  The corner is a **superellipse, not a rounded rectangle.** CoreGraphics'
//  `roundedRect` joins the sides with circular arcs, whose curvature changes
//  abruptly where the arc meets the straight edge; Apple's shape ramps curvature
//  continuously. At 16px nobody could tell, but at 1024 — Finder's icon view, the
//  Get Info panel, the App Store-sized slot — the circular version reads subtly
//  wrong to the same eye that would notice a square.
//
//  No drop shadow. Apple's own icons bake a soft one in, but it muddies the small
//  sizes, and the icon reads cleanly without it against both Dock appearances.
//

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// MARK: - Geometry

/// Apple's macOS icon grid, as fractions of the canvas so they hold at every size.
private enum Grid {
    /// 824 of 1024.
    static let contentRatio: CGFloat = 824.0 / 1024.0
    /// 185.4 of the 824 content square.
    static let cornerRatio: CGFloat = 185.4 / 824.0
    /// Exponent of the superellipse |x|^n + |y|^n = 1. 5 is the usual fit for
    /// Apple's continuous-curvature corner.
    static let exponent: CGFloat = 5.0
    /// Points per quadrant. 240 is smooth past 1024px and costs nothing.
    static let samples = 240
}

/// A superellipse inscribed in `rect`, as a closed path.
///
/// Built by sampling rather than by fitting Béziers: a sampled polygon at this
/// density is visually exact, and it cannot be subtly wrong in the way a
/// hand-tuned control point can.
private func superellipse(in rect: CGRect, exponent n: CGFloat, samples: Int) -> CGPath {
    let path = CGMutablePath()
    let a = rect.width / 2
    let b = rect.height / 2
    let cx = rect.midX
    let cy = rect.midY

    // Parametric form: x = a·sign(cosθ)·|cosθ|^(2/n), y = b·sign(sinθ)·|sinθ|^(2/n).
    let total = samples * 4
    for i in 0..<total {
        let theta = (CGFloat(i) / CGFloat(total)) * 2 * .pi
        let c = cos(theta)
        let s = sin(theta)
        let x = cx + a * (c < 0 ? -1 : 1) * pow(abs(c), 2 / n)
        let y = cy + b * (s < 0 ? -1 : 1) * pow(abs(s), 2 / n)
        if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
    }
    path.closeSubpath()
    return path
}

// MARK: - Rendering

private func render(_ source: CGImage, at size: Int) -> CGImage? {
    guard let context = CGContext(
        data: nil,
        width: size,
        height: size,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }

    context.interpolationQuality = .high

    let canvas = CGFloat(size)
    let content = (canvas * Grid.contentRatio).rounded()
    let origin = ((canvas - content) / 2).rounded()
    let rect = CGRect(x: origin, y: origin, width: content, height: content)

    // The corner ratio is relative to the content square, and `superellipse` takes
    // the rect rather than a radius, so the ratio is only a check on the shape's
    // proportions — kept here so the constant is not silently unused.
    _ = Grid.cornerRatio

    context.addPath(superellipse(in: rect, exponent: Grid.exponent, samples: Grid.samples))
    context.clip()
    context.draw(source, in: rect)
    return context.makeImage()
}

private func write(_ image: CGImage, to url: URL) throws {
    guard let destination = CGImageDestinationCreateWithURL(
        url as CFURL, UTType.png.identifier as CFString, 1, nil
    ) else {
        throw Failure("Could not create a PNG destination at \(url.path)")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw Failure("Could not write \(url.lastPathComponent)")
    }
}

private struct Failure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

// MARK: - The icon set

/// The ten slots a macOS app icon declares, and the pixel size each one needs.
private let slots: [(size: Int, scale: Int)] = [
    (16, 1), (16, 2),
    (32, 1), (32, 2),
    (128, 1), (128, 2),
    (256, 1), (256, 2),
    (512, 1), (512, 2),
]

private func filename(size: Int, scale: Int) -> String {
    "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
}

// MARK: - Main

let scriptURL = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
let studioDir = scriptURL.deletingLastPathComponent().deletingLastPathComponent()
let repoRoot = studioDir.deletingLastPathComponent().deletingLastPathComponent()

let sourceURL = repoRoot.appendingPathComponent("apps/mobile/assets/icon.png")
let iconsetURL = studioDir
    .appendingPathComponent("GraceChords Studio/GraceChords Studio/Assets.xcassets/AppIcon.appiconset")

do {
    guard FileManager.default.fileExists(atPath: sourceURL.path) else {
        throw Failure("No source icon at \(sourceURL.path)")
    }
    guard let data = NSImage(contentsOf: sourceURL)?.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: data),
          let source = bitmap.cgImage else {
        throw Failure("Could not read \(sourceURL.lastPathComponent) as an image")
    }
    guard source.width == source.height else {
        throw Failure("The source icon is \(source.width)×\(source.height); it must be square")
    }
    if source.width < 1024 {
        FileHandle.standardError.write(Data(
            "! source is only \(source.width)px — 1024 is what the largest slot needs\n".utf8
        ))
    }

    try FileManager.default.createDirectory(at: iconsetURL, withIntermediateDirectories: true)

    var entries: [[String: String]] = []
    for slot in slots {
        let pixels = slot.size * slot.scale
        guard let image = render(source, at: pixels) else {
            throw Failure("Could not render \(pixels)px")
        }
        let name = filename(size: slot.size, scale: slot.scale)
        try write(image, to: iconsetURL.appendingPathComponent(name))
        entries.append([
            "filename": name,
            "idiom": "mac",
            "scale": "\(slot.scale)x",
            "size": "\(slot.size)x\(slot.size)",
        ])
        print("  \(name)  (\(pixels)px)")
    }

    let contents: [String: Any] = [
        "images": entries,
        "info": ["author": "gracechords-generate-appicon", "version": 1],
    ]
    let json = try JSONSerialization.data(
        withJSONObject: contents,
        options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    )
    try json.write(to: iconsetURL.appendingPathComponent("Contents.json"), options: .atomic)

    print("\nWrote \(slots.count) images + Contents.json to")
    print("  \(iconsetURL.path)")
} catch {
    FileHandle.standardError.write(Data("✗ \(error.localizedDescription)\n".utf8))
    exit(1)
}
