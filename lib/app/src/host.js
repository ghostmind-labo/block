// What a block may ask of the app that shows it.
//
// A block runs in a frame that reaches nothing: no network, no storage, not the page around it. Whatever it
// needs from outside, the app lends it, as a small object with the app's own name (`potion`, `relay`, `page`):
//
//     const relay = defineHost({ name: "relay", calls: ["things", "act"], events: ["change"] });
//
// Inside the block that becomes:
//
//     const things = await relay.things();          a call: asked of the app, answered or refused
//     relay.on("change", (things) => draw(things)); an event: sent by the app whenever it likes
//
// and on the app's side:
//
//     const served = serve(relay, { post }, { things: () => read(), act: ({ thing, action }) => run(thing, action) });
//     served.receive(data);                          each message that came from this frame
//     served.emit("change", things);
//
// The app decides everything: a call that is not declared does not exist in the block, and a call that is
// declared runs only the app's own function, with arguments that crossed as plain data. Nothing of the app is
// ever injected into the frame.

const IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9]*$/;
const RESERVED = new Set(["on", "ready"]);

/**
 * Declare what one app lends its blocks.
 * @param {{ name: string, calls?: string[], events?: string[] }} definition
 * @returns {Readonly<{ name: string, calls: readonly string[], events: readonly string[] }>}
 */
export function defineHost({ name, calls = [], events = [] }) {
  if (!IDENTIFIER.test(String(name))) throw new Error(`a host is named with letters and digits (it becomes window.<name> in the block), not "${name}"`);
  for (const call of calls) {
    if (!IDENTIFIER.test(String(call))) throw new Error(`"${call}" cannot be the name of a call: letters and digits only`);
    if (RESERVED.has(call)) throw new Error(`"${call}" is taken: every host already has on() and ready()`);
  }
  for (const event of events) if (!/^[a-z][a-zA-Z0-9-]*$/.test(String(event))) throw new Error(`"${event}" cannot be the name of an event`);
  return Object.freeze({ name, calls: Object.freeze([...new Set(calls)]), events: Object.freeze([...new Set(events)]) });
}

/**
 * The script that runs in the frame, before anything of the block's: it makes `window.<name>`.
 * Written for old engines too (an iOS web view), so no arrow functions or template strings in it.
 * @param {ReturnType<typeof defineHost>} host
 * @returns {string}
 */
export function bridgeScript(host) {
  return `(function(){
  var calls = ${JSON.stringify(host.calls)}, events = ${JSON.stringify(host.events)};
  var n = 0, waiting = {}, heard = {}, last = {}, has = {};
  function send(message){ parent.postMessage(message, '*'); }
  function plain(value){ try { return JSON.parse(JSON.stringify(value === undefined ? {} : value)); } catch (_) { return {}; } }
  addEventListener('message', function(e){
    var d = e.data;
    if (e.source !== parent || !d) return;
    if (d.type === 'block-answer' && waiting[d.id]) { var w = waiting[d.id]; delete waiting[d.id]; d.ok ? w[0](d.value) : w[1](new Error(d.error)); }
    if (d.type === 'block-event' && events.indexOf(d.event) >= 0) {
      // The answer to hello repeats what the app sent earlier: skipped when that event already arrived live.
      if (d.replay && has[d.event]) return;
      last[d.event] = d.value; has[d.event] = true;
      (heard[d.event] || []).slice().forEach(function(f){ try { f(d.value); } catch (_) {} });
    }
  });
  var api = {
    // Every event the app has already sent is given at once to a listener that arrives late.
    on: function(event, f){
      if (events.indexOf(event) < 0) throw new Error('${host.name} has no event "' + event + '". It has: ' + (events.join(', ') || 'none'));
      (heard[event] = heard[event] || []).push(f);
      if (has[event]) f(last[event]);
      return function(){ heard[event] = heard[event].filter(function(g){ return g !== f; }); };
    },
    // Tells the app the block has drawn itself; until then the app may show a placeholder in its place.
    ready: function(){ send({ type: 'block-ready' }); }
  };
  calls.forEach(function(call){
    api[call] = function(args){
      return new Promise(function(resolve, reject){
        var id = ++n; waiting[id] = [resolve, reject];
        send({ type: 'block-ask', id: id, call: call, args: plain(args) });
      });
    };
  });
  window[${JSON.stringify(host.name)}] = api;
  // The app answers this with every event it has already sent, so nothing emitted before the frame existed is lost.
  send({ type: 'block-hello' });
  // A block that never calls ready() is ready once it has loaded.
  addEventListener('load', function(){ setTimeout(api.ready, 60); });
})();`;
}

const MAX_WAITING = 32;

/**
 * The app's side of one frame.
 *
 * `target.post(message)` sends a message into the frame (an iframe's `contentWindow.postMessage`, a web
 * view's `postMessage`). The app calls `receive(data)` with each message that came from THAT frame; checking
 * where a message came from is the caller's job, since only it holds the frame (`mount` does it for the web).
 *
 * @param {ReturnType<typeof defineHost>} host
 * @param {{ post: (message: object) => void }} target
 * @param {Record<string, (args: any) => any>} handlers one function per call the host declares
 * @param {{ onReady?: () => void, onHeight?: (height: number, width: number) => void, onError?: (message: string) => void }} [hooks]
 */
export function serve(host, target, handlers = {}, { onReady, onHeight, onError } = {}) {
  for (const call of host.calls) if (typeof handlers[call] !== "function") throw new Error(`${host.name}.${call}() is declared but the app gave no function for it`);
  const last = new Map();
  let waiting = 0;
  let stopped = false;

  const answer = (id, result) => !stopped && target.post({ type: "block-answer", id, ...result });

  return {
    /** @returns {boolean} whether the message was one of the block's */
    receive(data) {
      if (stopped || !data || typeof data.type !== "string" || !data.type.startsWith("block-")) return false;
      if (data.type === "block-hello") {
        for (const [event, value] of last) target.post({ type: "block-event", event, value, replay: true });
      } else if (data.type === "block-ready") {
        onReady?.();
      } else if (data.type === "block-height") {
        if (Number.isFinite(data.height)) onHeight?.(data.height, Number.isFinite(data.width) ? data.width : NaN);
      } else if (data.type === "block-error") {
        onError?.(String(data.message ?? "").slice(0, 500));
      } else if (data.type === "block-ask") {
        const { id, call } = data;
        if (!host.calls.includes(call)) return answer(id, { ok: false, error: `${host.name} has no call "${String(call).slice(0, 40)}"` }), true;
        // A block in a loop cannot pile work on the app: past this many unanswered calls, the next is refused.
        if (waiting >= MAX_WAITING) return answer(id, { ok: false, error: `${host.name}: too many calls are waiting for an answer` }), true;
        waiting++;
        Promise.resolve()
          .then(() => handlers[call](data.args && typeof data.args === "object" ? data.args : {}))
          .then(
            (value) => answer(id, { ok: true, value: value === undefined ? null : value }),
            (error) => answer(id, { ok: false, error: error instanceof Error ? error.message : String(error) }),
          )
          .finally(() => waiting--);
      }
      return true;
    },
    /** Send an event to the block. The last value of each event is kept for a frame that loads later. */
    emit(event, value) {
      if (!host.events.includes(event)) throw new Error(`${host.name} has no event "${event}"`);
      last.set(event, value);
      if (!stopped) target.post({ type: "block-event", event, value });
    },
    stop() {
      stopped = true;
      last.clear();
    },
  };
}
