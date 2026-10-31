import CryptoKit
import ExpoModulesCore
import Foundation
import ImageIO
import PDFKit
import UniformTypeIdentifiers

/// File helpers the JS side cannot do on its own: hashing multi-GB model
/// files without loading them into memory, keeping models out of iCloud
/// backups, and reading disk usage the way the Settings app reports it.
public class MullFilesModule: Module {
  private let fileManager = FileManager.default
  private let chunkSize = 4 * 1024 * 1024

  public func definition() -> ModuleDefinition {
    Name("MullFiles")

    /// `Application Support/models`, created on demand and excluded from backup.
    AsyncFunction("modelsDirectory") { () throws -> String in
      let base = try self.fileManager.url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      var directory = base.appendingPathComponent("models", isDirectory: true)
      try self.fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
      try self.setExcludedFromBackup(&directory)
      return directory.path
    }

    AsyncFunction("ensureDirectory") { (path: String) throws in
      var url = URL(fileURLWithPath: path, isDirectory: true)
      try self.fileManager.createDirectory(at: url, withIntermediateDirectories: true)
      try self.setExcludedFromBackup(&url)
    }

    AsyncFunction("isExcludedFromBackup") { (path: String) throws -> Bool in
      let values = try URL(fileURLWithPath: path).resourceValues(forKeys: [.isExcludedFromBackupKey])
      return values.isExcludedFromBackup ?? false
    }

    /// Streams the file through SHA-256 in 4 MB chunks off the JS thread.
    AsyncFunction("sha256") { (path: String) throws -> String in
      let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
      defer { try? handle.close() }
      var hasher = SHA256()
      while true {
        let chunk: Data? = try autoreleasepool { try handle.read(upToCount: self.chunkSize) }
        guard let data = chunk, !data.isEmpty else { break }
        hasher.update(data: data)
      }
      return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    AsyncFunction("fileSize") { (path: String) -> Double in
      let attributes = try? self.fileManager.attributesOfItem(atPath: path)
      return (attributes?[.size] as? NSNumber)?.doubleValue ?? -1
    }

    AsyncFunction("exists") { (path: String) -> Bool in
      self.fileManager.fileExists(atPath: path)
    }

    AsyncFunction("listDirectory") { (path: String) -> [String] in
      (try? self.fileManager.contentsOfDirectory(atPath: path)) ?? []
    }

    AsyncFunction("move") { (from: String, to: String) throws in
      if self.fileManager.fileExists(atPath: to) {
        try self.fileManager.removeItem(atPath: to)
      }
      try self.fileManager.moveItem(atPath: from, toPath: to)
    }

    AsyncFunction("remove") { (path: String) throws in
      if self.fileManager.fileExists(atPath: path) {
        try self.fileManager.removeItem(atPath: path)
      }
    }

    /// Bytes allocated on disk under a directory (or a single file).
    AsyncFunction("directorySize") { (path: String) -> Double in
      self.allocatedSize(of: URL(fileURLWithPath: path))
    }

    /// Mull's own data: chats (Documents), caches and temporary files.
    AsyncFunction("appDirectories") { () -> [String: String] in
      let documents = self.fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
      let caches = self.fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
      return [
        "documents": documents?.path ?? "",
        "caches": caches?.path ?? "",
        "temporary": NSTemporaryDirectory(),
      ]
    }

    /// Empties Caches and tmp. Returns the bytes freed.
    AsyncFunction("clearCaches") { () -> Double in
      var freed = 0.0
      let caches = self.fileManager.urls(for: .cachesDirectory, in: .userDomainMask)
      let temporary = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
      for directory in caches + [temporary] {
        let children = (try? self.fileManager.contentsOfDirectory(
          at: directory, includingPropertiesForKeys: nil)) ?? []
        for child in children {
          let size = self.allocatedSize(of: child)
          if (try? self.fileManager.removeItem(at: child)) != nil { freed += size }
        }
      }
      return freed
    }

    /// `Application Support/attachments`, created on demand and excluded from backup.
    AsyncFunction("attachmentsDirectory") { () throws -> String in
      let base = try self.fileManager.url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      var directory = base.appendingPathComponent("attachments", isDirectory: true)
      try self.fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
      try self.setExcludedFromBackup(&directory)
      return directory.path
    }

    /// Writes a JPEG of `path` whose longer side is at most `maxSide` pixels,
    /// upright per EXIF. Reads anything ImageIO does, HEIC included.
    AsyncFunction("resizeImage") {
      (path: String, outPath: String, maxSide: Double, quality: Double) throws -> [String: Double] in
      let source = URL(fileURLWithPath: path) as CFURL
      guard let image = CGImageSourceCreateWithURL(source, nil) else {
        throw Exception(name: "ImageReadError", description: "Cannot read image at \(path)")
      }
      let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: Int(maxSide),
      ]
      guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(image, 0, options as CFDictionary)
      else {
        throw Exception(name: "ImageReadError", description: "Cannot decode image at \(path)")
      }
      let out = URL(fileURLWithPath: outPath) as CFURL
      guard
        let destination = CGImageDestinationCreateWithURL(
          out, UTType.jpeg.identifier as CFString, 1, nil)
      else {
        throw Exception(name: "ImageWriteError", description: "Cannot write \(outPath)")
      }
      CGImageDestinationAddImage(
        destination, thumbnail,
        [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
      if !CGImageDestinationFinalize(destination) {
        throw Exception(name: "ImageWriteError", description: "Cannot write \(outPath)")
      }
      return ["width": Double(thumbnail.width), "height": Double(thumbnail.height)]
    }

    /// The text layer of each page. A scanned PDF has none, so pages come back empty.
    AsyncFunction("pdfText") { (path: String) throws -> [[String: Any]] in
      guard let document = PDFDocument(url: URL(fileURLWithPath: path)) else {
        throw Exception(name: "PdfReadError", description: "Cannot open PDF at \(path)")
      }
      if document.isLocked {
        throw Exception(name: "PdfLockedError", description: "PDF is password protected")
      }
      var pages: [[String: Any]] = []
      for index in 0..<document.pageCount {
        let text = document.page(at: index)?.string ?? ""
        pages.append(["page": index + 1, "text": text])
      }
      return pages
    }

    /// A text file as UTF-8, falling back to Latin-1 for older encodings.
    AsyncFunction("readText") { (path: String) throws -> String in
      let url = URL(fileURLWithPath: path)
      if let text = try? String(contentsOf: url, encoding: .utf8) { return text }
      return try String(contentsOf: url, encoding: .isoLatin1)
    }

    /// Free and total capacity as the Settings app shows them.
    AsyncFunction("diskSpace") { () throws -> [String: Double] in
      let home = URL(fileURLWithPath: NSHomeDirectory())
      let values = try home.resourceValues(forKeys: [
        .volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey,
      ])
      return [
        "free": Double(values.volumeAvailableCapacityForImportantUsage ?? 0),
        "total": Double(values.volumeTotalCapacity ?? 0),
      ]
    }
  }

  private func setExcludedFromBackup(_ url: inout URL) throws {
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
  }

  private func allocatedSize(of url: URL) -> Double {
    let keys: Set<URLResourceKey> = [.isDirectoryKey, .totalFileAllocatedSizeKey, .fileAllocatedSizeKey]
    guard let values = try? url.resourceValues(forKeys: keys) else { return 0 }
    if values.isDirectory != true {
      return Double(values.totalFileAllocatedSize ?? values.fileAllocatedSize ?? 0)
    }
    var total = 0.0
    let enumerator = fileManager.enumerator(at: url, includingPropertiesForKeys: Array(keys))
    while let child = enumerator?.nextObject() as? URL {
      let childValues = try? child.resourceValues(forKeys: keys)
      if childValues?.isDirectory == true { continue }
      total += Double(childValues?.totalFileAllocatedSize ?? childValues?.fileAllocatedSize ?? 0)
    }
    return total
  }
}
