// Device-free PDF proxy (V1_PLAN P3.4, adapted from docs/research/webkit-pdf-proxy/paged.swift).
// macOS WKWebView + NSPrintOperation prints HTML to paginated PDFs (like the iOS UIPrintPageRenderer path of
// expo-print, but NOT iOS and NOT Android Chromium: proxy evidence only). Apple PDFKit is the second reader.
//   webkit-pdf print <jobs.json>   jobs = [{"html":path,"pdf":path,"width":pt,"height":pt,"margin":pt}]
//                                  prints one JSON line per job: {"pdf","ok","pages","ms"}
//   webkit-pdf text <pdf>...       prints one JSON line per file: {"pdf","pages":[page text, …]}
// Build: xcrun swiftc -O scripts/webkit-pdf.swift -o artifacts/bin/webkit-pdf (scripts/pdf-referee.mjs does it).
import Cocoa
import PDFKit
import WebKit

struct Job: Decodable { let html: String; let pdf: String; let width: Double; let height: Double; let margin: Double }

func emit(_ obj: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

final class Printer: NSObject, WKNavigationDelegate {
  var jobs: [Job]
  let wv: WKWebView
  let win: NSWindow
  var started = Date()

  init(_ jobs: [Job]) {
    self.jobs = jobs
    wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 595, height: 842))
    win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 595, height: 842), styleMask: [.titled], backing: .buffered, defer: false)
    super.init()
    win.contentView = wv
    wv.navigationDelegate = self
  }

  func next() {
    guard let job = jobs.first else { exit(0) }
    started = Date()
    let url = URL(fileURLWithPath: job.html)
    wv.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
  }

  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    // Wait for the embedded @font-face fonts before printing.
    w.callAsyncJavaScript("await document.fonts.ready; return document.fonts.size;", arguments: [:], in: nil, in: .page) { _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.print(w) }
    }
  }

  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { fail(e.localizedDescription) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { fail(e.localizedDescription) }

  func fail(_ message: String) {
    let job = jobs.removeFirst()
    emit(["pdf": job.pdf, "ok": false, "error": message])
    next()
  }

  func print(_ w: WKWebView) {
    let job = jobs[0]
    let pi = NSPrintInfo(dictionary: [NSPrintInfo.AttributeKey.jobSavingURL: URL(fileURLWithPath: job.pdf)])
    pi.jobDisposition = .save
    pi.paperSize = NSSize(width: job.width, height: job.height)
    pi.topMargin = job.margin; pi.bottomMargin = job.margin; pi.leftMargin = job.margin; pi.rightMargin = job.margin
    pi.horizontalPagination = .fit
    pi.verticalPagination = .automatic
    pi.isHorizontallyCentered = false
    pi.isVerticallyCentered = false
    let op = w.printOperation(with: pi)
    op.showsPrintPanel = false
    op.showsProgressPanel = false
    op.view?.frame = NSRect(x: 0, y: 0, width: job.width - 2 * job.margin, height: job.height - 2 * job.margin)
    op.runModal(for: win, delegate: self, didRun: #selector(done(_:success:ctx:)), contextInfo: nil)
  }

  @objc func done(_ op: NSPrintOperation, success: Bool, ctx: UnsafeMutableRawPointer?) {
    let job = jobs.removeFirst()
    let pages = PDFDocument(url: URL(fileURLWithPath: job.pdf))?.pageCount ?? -1
    emit(["pdf": job.pdf, "ok": success && pages > 0, "pages": pages, "ms": Int(Date().timeIntervalSince(started) * 1000)])
    DispatchQueue.main.async { self.next() }
  }
}

let args = CommandLine.arguments
if args.count >= 3 && args[1] == "text" {
  for path in args[2...] {
    guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { emit(["pdf": path, "error": "unreadable"]); continue }
    emit(["pdf": path, "pages": (0..<doc.pageCount).map { doc.page(at: $0)?.string ?? "" }])
  }
  exit(0)
}
guard args.count == 3 && args[1] == "print", let data = FileManager.default.contents(atPath: args[2]),
  let jobs = try? JSONDecoder().decode([Job].self, from: data)
else {
  FileHandle.standardError.write("usage: webkit-pdf print <jobs.json> | webkit-pdf text <pdf>...\n".data(using: .utf8)!)
  exit(2)
}
let app = NSApplication.shared
let printer = Printer(jobs)
DispatchQueue.main.async { printer.next() }
app.run()
