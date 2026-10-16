// Device-free stand-in for the app's WKWebView read-back (P5): loads the real harness page (pdf.js, blob: URLs, CSP) in
// macOS WebKit, sends one `extract` request per PDF exactly as the app does, prints the answer or the page's errors.
// Build: xcrun swiftc -O scripts/webkit-harness.swift -o artifacts/bin/webkit-harness
// Run:   HARNESS_HTML_OUT=artifacts/harness.html npx jest src/readback/harness.test.ts -t 'real harness'
//        artifacts/bin/webkit-harness artifacts/harness.html a.pdf [b.pdf …]   → one JSON line per PDF
import AppKit
import WebKit

final class Runner: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  let web: WKWebView
  var pdfs: [String]
  var started = Date()
  var current: String?
  var seq = 0

  init(html: String, pdfs: [String]) {
    self.pdfs = pdfs
    let config = WKWebViewConfiguration()
    let shim = """
      window.ReactNativeWebView = { postMessage: function (s) { window.webkit.messageHandlers.rn.postMessage(s); } };
      window.addEventListener('error', function (e) { window.webkit.messageHandlers.rn.postMessage(JSON.stringify({v:1,type:'pageError',message:String(e.message)+' '+e.filename+':'+e.lineno+':'+e.colno})); });
      window.addEventListener('unhandledrejection', function (e) { window.webkit.messageHandlers.rn.postMessage(JSON.stringify({v:1,type:'pageError',message:'unhandled: '+String(e.reason && (e.reason.stack || e.reason.message) || e.reason)})); });
      """
    config.userContentController.addUserScript(WKUserScript(source: shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 400, height: 800), configuration: config)
    super.init()
    config.userContentController.add(self, name: "rn")
    web.navigationDelegate = self
    web.loadHTMLString(html, baseURL: nil)
  }

  func emit(_ obj: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: obj)
    print(String(data: data, encoding: .utf8)!)
    fflush(stdout)
  }

  func next() {
    guard !pdfs.isEmpty else { exit(0) }
    let path = pdfs.removeFirst()
    current = path
    started = Date()
    let b64 = (try? Data(contentsOf: URL(fileURLWithPath: path)))?.base64EncodedString() ?? ""
    seq += 1
    let req = "{\"v\":1,\"type\":\"extract\",\"id\":\"x\(seq)\",\"base64\":\"\(b64)\"}"
    let js = "window.dispatchEvent(new MessageEvent('message', {data: \(String(data: try! JSONSerialization.data(withJSONObject: [req]), encoding: .utf8)!)[0]}));"
    web.evaluateJavaScript(js, completionHandler: nil)
    let mine = path
    DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
      if self.current == mine { self.emit(["pdf": mine, "error": "timeout 10 s"]); self.next() }
    }
  }

  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let s = message.body as? String, let d = s.data(using: .utf8),
          let m = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
    let type = m["type"] as? String ?? ""
    let ms = Int(Date().timeIntervalSince(started) * 1000)
    switch type {
    case "ready": emit(["ready": m["reader"] ?? "", "ms": ms]); next()
    case "extracted":
      let r = m["result"] as? [String: Any] ?? [:]
      let pages = r["pages"] as? [[String: Any]] ?? []
      emit(["pdf": current ?? "", "ms": ms, "pdfjsMs": m["ms"] ?? 0, "pages": pages.count,
            "items": pages.reduce(0) { $0 + (($1["items"] as? [Any])?.count ?? 0) }, "result": r])
      current = nil; next()
    case "pageError": emit(["pageError": m["message"] ?? ""])
    case "ack": break
    default: emit(["pdf": current ?? "", "message": s]); if type == "error" { current = nil; next() }
    }
  }
}

let args = CommandLine.arguments
guard args.count >= 3, let html = try? String(contentsOfFile: args[1], encoding: .utf8) else {
  print("usage: webkit-harness <harness.html> <pdf>…"); exit(2)
}
let app = NSApplication.shared
let runner = Runner(html: html, pdfs: Array(args[2...]))
DispatchQueue.main.asyncAfter(deadline: .now() + 120) { print("{\"error\":\"overall timeout\"}"); exit(1) }
app.run()
