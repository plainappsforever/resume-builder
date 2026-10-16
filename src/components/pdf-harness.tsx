// Hosts the pdf.js harness page (src/readback/harness-page.ts) in a react-native-webview and hands the parent a
// HarnessClient (src/readback/bridge.ts). Tiny (2×2, almost transparent) for read-backs; visible for the exact preview, where the page
// draws the real PDF into canvases. JavaScript runs only inside this page: no network (CSP), no navigation.
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { HarnessClient } from '@/readback/bridge';
import { buildHarnessHtml } from '@/readback/harness-page';
import { PDFJS_SOURCE, PDFJS_WORKER_SOURCE, WARMUP_PDF_BASE64 } from '@/readback/pdfjs.generated';

let harnessHtml: string | null = null;
function html(): string {
  harnessHtml ??= buildHarnessHtml(PDFJS_SOURCE, PDFJS_WORKER_SOURCE, WARMUP_PDF_BASE64);
  return harnessHtml;
}

type Props = {
  ref?: Ref<HarnessClient | null>;
  /** Visible = exact preview; otherwise a hidden 1×1 reader. */
  style?: StyleProp<ViewStyle>;
  visible?: boolean;
  testID?: string;
  onReady?: (client: HarnessClient) => void;
};

export function PdfHarness({ ref, style, visible = false, testID, onReady }: Props) {
  const [client, setClient] = useState(() => new HarnessClient(() => undefined));
  useImperativeHandle(ref, () => client, [client]);
  // A page that stopped answering is replaced by a fresh one (new WebView, new client, D71).
  useEffect(() => {
    client.whenStuck(() => {
      if (__DEV__) console.log('[harness] stuck, re-mounting the page');
      setClient(new HarnessClient(() => undefined));
    });
  }, [client]);
  useEffect(() => {
    let alive = true;
    client.ready.then(
      () => alive && onReady?.(client),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [client, onReady]);
  useEffect(() => () => client.dispose(), [client]);

  return (
    <WebView
      key={client.serial}
      ref={(w) => client.connect((json) => w?.postMessage(json))}
      testID={testID}
      style={[visible ? styles.visible : styles.hidden, style]}
      containerStyle={visible ? undefined : styles.hidden}
      source={{ html: html() }}
      originWhitelist={['about:*', 'data:*', 'blob:*']}
      onShouldStartLoadWithRequest={(r) => !/^https?:/i.test(r.url)}
      onMessage={(e: WebViewMessageEvent) => {
        if (__DEV__) console.log('[harness]', e.nativeEvent.data.slice(0, 700));
        client.onMessage(e.nativeEvent.data);
      }}
      // v1.1 (REVIEW_V1 #18): a page killed by the system (memory pressure) is replaced at once, not after a 10 s time-out.
      onContentProcessDidTerminate={() => {
        if (__DEV__) console.log('[harness] content process terminated, re-mounting');
        setClient(new HarnessClient(() => undefined));
      }}
      onRenderProcessGone={() => {
        if (__DEV__) console.log('[harness] render process gone, re-mounting');
        setClient(new HarnessClient(() => undefined));
      }}
      onError={(e) => {
        if (__DEV__) console.log('[harness] load error', e.nativeEvent.description);
      }}
      javaScriptEnabled
      pointerEvents={visible ? 'auto' : 'none'}
      scrollEnabled={false}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      cacheEnabled={false}
      webviewDebuggingEnabled={__DEV__}
    />
  );
}

const styles = StyleSheet.create({
  // On screen and not fully transparent: iOS stops running script in a WKWebView it considers invisible (D71).
  hidden: { position: 'absolute', width: 2, height: 2, opacity: 0.02, right: 0, bottom: 0 },
  visible: { backgroundColor: '#888' },
});
