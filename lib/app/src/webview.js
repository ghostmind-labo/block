// A block in a native app's web view.
//
// On a web page a block is a frame inside the app's page, and the two talk with `postMessage`. A web view has
// no page around it: the block's document IS the top window, and the app is native code on the other side of
// a channel that carries text. Nothing else changes. The block's document is the same (`documentOf` with
// `transport: "webview"`), the app's side is the same (`serve`), and these three join them:
//
//     const html = documentOf(source, { host, libraries, transport: "webview" });
//     const served = serve(host, webviewTarget((js) => webRef.current?.injectJavaScript(js)), handlers, hooks);
//     <WebView source={{ html }} onMessage={(event) => served.receive(fromWebview(event.nativeEvent.data))} />
//
// What the page did for a block on the web, the web view does here: it refuses every navigation after the first
// load (`onShouldStartLoadWithRequest`), which is what `PAGE_POLICY` is on a page.
//
// An app that already holds bytes as base64 (a tile its server sent as text) may answer `{ __blockBytes: text }`:
// it reaches the block as bytes, without being decoded and encoded again on the way.
//
// The channel is the one react-native-webview gives (`window.ReactNativeWebView.postMessage`); any web view
// that defines the same function on the page works.

/**
 * Runs first in the block's document. In a web view `parent` is the window itself, so the block's scripts
 * post to their own window: this passes what is meant for the app on to it, as text, and gives the app a
 * function to hand its answers in. Bytes cross as base64 and are bytes again on arrival.
 */
export const WEBVIEW_SCRIPT = `(function(){
  var out = { 'block-ask': 1, 'block-stop': 1, 'block-hello': 1, 'block-ready': 1, 'block-height': 1, 'block-error': 1, 'block-link': 1, 'block-started': 1, 'block-escape': 1 };
  addEventListener('message', function(e){
    var d = e.data;
    if (e.source !== window || !d || !out[d.type] || !window.ReactNativeWebView) return;
    try { window.ReactNativeWebView.postMessage(JSON.stringify(d)); } catch (_) {}
  });
  function bytes(v){
    if (!v || typeof v !== 'object' || typeof v.__blockBytes !== 'string') return v;
    var text = atob(v.__blockBytes), all = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) all[i] = text.charCodeAt(i);
    return all.buffer;
  }
  window.__blockNative = function(text){
    var m;
    try { m = JSON.parse(text); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.value && typeof m.value === 'object') {
      m.value = bytes(m.value);
      if (Object.prototype.toString.call(m.value) === '[object Object]') for (var key in m.value) m.value[key] = bytes(m.value[key]);
    }
    window.postMessage(m, '*');
  };
})();`;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** Base64 of bytes, written here because a native runtime does not always have `btoa`. */
function base64(view) {
  let text = "";
  for (let i = 0; i < view.length; i += 3) {
    const a = view[i], b = view[i + 1], c = view[i + 2];
    text += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? "=" : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? "=" : ALPHABET[c & 63]);
  }
  return text;
}
const isBytes = (value) => value instanceof ArrayBuffer || ArrayBuffer.isView(value);
const packed = (value) => (isBytes(value) ? { __blockBytes: base64(value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) } : value);

/**
 * The `target` that `serve` sends through, for a web view.
 * @param {(javascript: string) => void} inject runs a script in the web view (`webRef.current.injectJavaScript`)
 * @returns {{ post: (message: object) => void }}
 */
export function webviewTarget(inject) {
  return {
    post(message) {
      let value = packed(message.value);
      // Bytes held one level down (`{ data: bytes }`) cross too; deeper than that they are lost, as text would lose them.
      if (value && typeof value === "object" && !Array.isArray(value) && value === message.value) {
        if (Object.values(value).some(isBytes)) value = Object.fromEntries(Object.entries(value).map(([key, each]) => [key, packed(each)]));
      }
      const text = JSON.stringify("value" in message ? { ...message, value } : message);
      // The text is given as a string of a string: nothing in it can end the script it is written in.
      inject(`window.__blockNative&&window.__blockNative(${JSON.stringify(text)});true;`);
    },
  };
}

/**
 * What the web view sent (`event.nativeEvent.data`), for `served.receive`. Anything that is not a block's
 * message comes back as null, which `receive` ignores.
 * @param {unknown} data
 * @returns {object | null}
 */
export function fromWebview(data) {
  if (typeof data !== "string") return null;
  try {
    const message = JSON.parse(data);
    return message && typeof message === "object" && typeof message.type === "string" ? message : null;
  } catch {
    return null;
  }
}
