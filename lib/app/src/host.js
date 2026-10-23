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
//     const stop = relay.watch("lamp", draw);       a watch: answered again and again, until stop() is called
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
//
// (One exception is the app's to make: `client`, a script of its own for the frame. See `defineHost`.)
//
// The functions are the app's and stay in the app: this file knows none of them. What it carries is their
// shape. A call takes any number of arguments, as the app's function is written. An argument that is a
// function (or a function held by a plain object, such as `{ onError }`) crosses as a number, and the app's
// function gets one in its place that sends its value back to the block: that is how a call reports progress
// and how a watch delivers each answer. Bytes (an ArrayBuffer, a typed array) cross as they are.

const IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9]*$/;
const RESERVED = new Set(["on", "ready", "args"]);

/**
 * Declare what one app lends its blocks.
 * @param {{ name: string, calls?: string[], watches?: string[], events?: string[] }} definition
 *   `calls` answer once, with a promise. `watches` give the block a function that stops them, at once, and
 *   answer through the functions the block passed.
 *   `client` is the text of a script of the app's that runs in the frame, right after `window.<name>` exists
 *   and before the block: for what can only be done there (a helper that shapes arguments, a protocol
 *   registered on a library the block brought). It is text, it runs inside the sandbox like the block does,
 *   and it reaches the app only through the calls declared here: it lends the frame nothing new.
 * @returns {Readonly<{ name: string, calls: readonly string[], watches: readonly string[], events: readonly string[] }>}
 */
export function defineHost({ name, calls = [], watches = [], events = [], client = "" }) {
  if (!IDENTIFIER.test(String(name))) throw new Error(`a host is named with letters and digits (it becomes window.<name> in the block), not "${name}"`);
  for (const call of [...calls, ...watches]) {
    if (!IDENTIFIER.test(String(call))) throw new Error(`"${call}" cannot be the name of a call: letters and digits only`);
    if (RESERVED.has(call)) throw new Error(`"${call}" is taken: every host already has on(), ready() and args()`);
  }
  for (const watch of watches) if (calls.includes(watch)) throw new Error(`"${watch}" is declared as a call and as a watch: it is one or the other`);
  for (const event of events) if (!/^[a-z][a-zA-Z0-9-]*$/.test(String(event))) throw new Error(`"${event}" cannot be the name of an event`);
  if (typeof client !== "string") throw new Error("a host's client is the text of a script");
  return Object.freeze({ name, calls: Object.freeze([...new Set(calls)]), watches: Object.freeze([...new Set(watches)]), events: Object.freeze([...new Set(events)]), client });
}

/**
 * The script that runs in the frame, before anything of the block's: it makes `window.<name>`.
 * Written for old engines too (an iOS web view), so no arrow functions or template strings in it.
 * @param {ReturnType<typeof defineHost>} host
 * @returns {string}
 */
export function bridgeScript(host) {
  return `(function(){
  var calls = ${JSON.stringify(host.calls)}, watches = ${JSON.stringify(host.watches ?? [])}, events = ${JSON.stringify(host.events)};
  var n = 0, c = 0, waiting = {}, callbacks = {}, heard = {}, last = {}, has = {};
  function send(message){ parent.postMessage(message, '*'); }
  function plain(value){ try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; } }
  function bytes(value){ return Object.prototype.toString.call(value) === '[object ArrayBuffer]' || ArrayBuffer.isView(value); }
  function later(error){ setTimeout(function(){ throw error; }, 0); }
  // A list that carried more than its items (rows.hasMore, rows.total) crossed in two parts: put them back.
  function whole(value){
    if (!value || typeof value !== 'object' || !Array.isArray(value.__blockList)) return value;
    var list = value.__blockList, more = value.more || {};
    for (var key in more) list[key] = more[key];
    return list;
  }
  function keep(f, mine){ var id = ++c; callbacks[id] = f; mine.push(id); return { __blockCallback: id }; }
  function drop(mine){ mine.forEach(function(id){ delete callbacks[id]; }); }
  // One argument, as plain data. A function crosses as a number the app answers through: the argument
  // itself, or one that a plain object holds.
  function pack(value, mine){
    if (typeof value === 'function') return keep(value, mine);
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || bytes(value)) return value;
    var copy = plain(value);
    if (!Array.isArray(value)) for (var key in value) if (typeof value[key] === 'function') copy[key] = keep(value[key], mine);
    return copy;
  }
  function ask(call, args, watch){
    var mine = [], list = [], id = ++n;
    for (var i = 0; i < args.length; i++) list.push(pack(args[i], mine));
    return { id: id, mine: mine, message: { type: 'block-ask', id: id, call: call, list: list, watch: watch } };
  }
  addEventListener('message', function(e){
    var d = e.data;
    if (e.source !== parent || !d) return;
    if (d.type === 'block-answer' && waiting[d.id]) { var w = waiting[d.id]; delete waiting[d.id]; d.ok ? w[0](whole(d.value)) : w[1](new Error(d.error)); }
    // A function of the block that the app holds: thrown errors are the block's, and are shown as such.
    if (d.type === 'block-callback' && callbacks[d.id]) { try { callbacks[d.id](whole(d.value)); } catch (error) { later(error); } }
    if (d.type === 'block-event' && events.indexOf(d.event) >= 0) {
      // The answer to hello repeats what the app sent earlier: skipped when that event already arrived live.
      if (d.replay && has[d.event]) return;
      var value = whole(d.value);
      last[d.event] = value; has[d.event] = true;
      (heard[d.event] || []).slice().forEach(function(f){ try { f(value); } catch (_) {} });
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
    api[call] = function(){
      var a = ask(call, arguments, false);
      return new Promise(function(resolve, reject){
        // The functions given to a call are the app's to use until it answers.
        waiting[a.id] = [function(value){ drop(a.mine); resolve(value); }, function(error){ drop(a.mine); reject(error); }];
        send(a.message);
      });
    };
  });
  watches.forEach(function(call){
    api[call] = function(){
      var a = ask(call, arguments, true), on = true;
      // The app answers once, to say the watch began or why it could not; what is watched comes through the block's functions.
      waiting[a.id] = [function(){}, function(error){ on = false; drop(a.mine); later(error); }];
      send(a.message);
      return function(){ if (!on) return; on = false; drop(a.mine); send({ type: 'block-stop', id: a.id }); };
    };
  });
  window[${JSON.stringify(host.name)}] = api;
  // The app's own script for the frame, if it has one. What it throws is the app's mistake, shown like a block's.
  try { (function(){ ${host.client || ""}
  })(); } catch (error) { later(error); }
  // The app answers this with every event it has already sent, so nothing emitted before the frame existed is lost.
  send({ type: 'block-hello' });
  // A block that never calls ready() is ready once it has loaded.
  addEventListener('load', function(){ setTimeout(api.ready, 60); });
})();`;
}

const MAX_WAITING = 32;
const MAX_WATCHES = 32;
const TIMEOUT = 30_000;

/**
 * The app's side of one frame.
 *
 * `target.post(message)` sends a message into the frame (an iframe's `contentWindow.postMessage`, a web
 * view's `postMessage`). The app calls `receive(data)` with each message that came from THAT frame; checking
 * where a message came from is the caller's job, since only it holds the frame (`mount` does it for the web).
 *
 * A function for a call gets the block's arguments as they were written (`getRecords(structure, options)`),
 * and `{}` when the block gave none. A function for a watch returns the function that ends it.
 *
 * @param {ReturnType<typeof defineHost>} host
 * @param {{ post: (message: object) => void }} target
 * @param {Record<string, (...args: any[]) => any>} handlers one function per call and per watch the host declares
 * @param {object} [options]
 * @param {() => void} [options.onReady]
 * @param {(height: number, width: number) => void} [options.onHeight]
 * @param {(message: string) => void} [options.onError]
 * @param {(href: string) => void} [options.onLink] a link was clicked in the block: its `href`, as written. The frame goes nowhere by itself
 * @param {number | ((call: string, args: any[]) => number)} [options.timeout] ms a call may take before the block is told it took too long (default 30 s; 0: no limit). A function gives each call its own: a write that waits for a person's yes needs longer than a read
 * @param {{ calls: number, per: number }} [options.rate] at most `calls` in any `per` ms; the next is refused. Default: no limit
 */
export function serve(host, target, handlers = {}, { onReady, onHeight, onError, onLink, timeout = TIMEOUT, rate } = {}) {
  const watches = host.watches ?? [];
  for (const call of [...host.calls, ...watches]) if (typeof handlers[call] !== "function") throw new Error(`${host.name}.${call}() is declared but the app gave no function for it`);
  const last = new Map();
  const stops = new Map(); // a watch that runs: the id of its call → the function that ends it
  const starting = new Set(); // a watch whose function has not answered yet
  const ended = new Set(); // … and that the block already ended
  let recent = [];
  let waiting = 0;
  let stopped = false;

  const post = (message) => !stopped && target.post(message);
  const answer = (id, result) => post({ type: "block-answer", id, ...result });
  const refuse = (id, error) => (answer(id, { ok: false, error }), true);
  const message = (error) => (error instanceof Error ? error.message : String(error));

  // What is sent to the block. A list may carry more than its items (rows.hasMore, rows.total), which a message
  // would drop: it crosses in two parts and the frame puts them back.
  const sent = (value) => {
    if (value === undefined) return null;
    if (!Array.isArray(value)) return value;
    const more = Object.fromEntries(Object.entries(value).filter(([key]) => !/^(0|[1-9]\d*)$/.test(key)));
    return Object.keys(more).length ? { __blockList: [...value], more } : value;
  };

  // A function of the block, on this side: calling it sends its value to the frame.
  const marked = (value) => value !== null && typeof value === "object" && Number.isInteger(value.__blockCallback);
  const callback = ({ __blockCallback: id }) => (value) => void post({ type: "block-callback", id, value: sent(value) });
  const unpack = (value) => {
    if (marked(value)) return callback(value);
    if (value === null || typeof value !== "object" || Array.isArray(value) || !Object.values(value).some(marked)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, marked(each) ? callback(each) : each]));
  };
  const end = (stop) => {
    try {
      stop();
    } catch {}
  };

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
      } else if (data.type === "block-link") {
        if (typeof data.href === "string" && data.href) onLink?.(data.href.slice(0, 2000));
      } else if (data.type === "block-stop") {
        const stop = stops.get(data.id);
        if (stop) stops.delete(data.id), end(stop);
        else if (starting.has(data.id)) ended.add(data.id);
      } else if (data.type === "block-ask") {
        const { id, call } = data;
        const watch = watches.includes(call);
        if (!watch && !host.calls.includes(call)) return refuse(id, `${host.name} has no call "${String(call).slice(0, 40)}"`);
        // A block in a loop cannot pile work on the app: past this many unanswered calls, the next is refused.
        if (waiting >= MAX_WAITING) return refuse(id, `${host.name}: too many calls are waiting for an answer`);
        if (watch && stops.size + starting.size >= MAX_WATCHES) return refuse(id, `${host.name}: too many watches are running; end one first`);
        if (rate) {
          const now = Date.now();
          recent = recent.filter((time) => time > now - rate.per);
          if (recent.length >= rate.calls) return refuse(id, `${host.name}: more than ${rate.calls} calls in ${rate.per / 1000} s; ask less often`);
          recent.push(now);
        }
        // The block's arguments, as written. A block that gave none is a block that gave no options.
        const args = (Array.isArray(data.list) ? data.list : [data.args]).map(unpack);
        if (args[0] === undefined || args[0] === null) args[0] = {};
        waiting++;
        if (watch) starting.add(id);
        let answered = false;
        const once = (result) => !answered && ((answered = true), answer(id, result));
        const limit = watch ? 0 : typeof timeout === "function" ? Number(timeout(call, args)) || 0 : timeout;
        const timer = limit ? setTimeout(() => once({ ok: false, error: `${host.name}.${call}() took more than ${limit / 1000} s` }), limit) : null;
        timer?.unref?.();
        Promise.resolve()
          .then(() => handlers[call](...args))
          .then(
            (value) => {
              if (!watch) return once({ ok: true, value: sent(value) });
              starting.delete(id);
              // Ended before it began, or the frame is gone: what the app started is ended at once.
              if (typeof value === "function") ended.delete(id) || stopped ? end(value) : stops.set(id, value);
              once({ ok: true, value: null });
            },
            (error) => (starting.delete(id), ended.delete(id), once({ ok: false, error: message(error) })),
          )
          .finally(() => (clearTimeout(timer), waiting--));
      }
      return true;
    },
    /** Send an event to the block. The last value of each event is kept for a frame that loads later. */
    emit(event, value) {
      if (!host.events.includes(event)) throw new Error(`${host.name} has no event "${event}"`);
      last.set(event, sent(value));
      if (!stopped) target.post({ type: "block-event", event, value: sent(value) });
    },
    /** The frame is gone: nothing more is sent to it, and every watch it began is ended. */
    stop() {
      stopped = true;
      last.clear();
      for (const stop of stops.values()) end(stop);
      stops.clear();
    },
  };
}
