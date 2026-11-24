import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { parse, specOf, defineHost, bridgeScript, serve, documentOf, coverOf, WEBVIEW_SCRIPT, webviewTarget, fromWebview, makeLoader, describe, classicOf, validVersion, defineSlot, slotText, fit, POLICY } from "../src/index.js";

test("parse: libraries, other directives and the cover leave the source", () => {
  const html = `<!-- block:use chart.js@4, @scope/pkg@1.2 -->\n<!-- relay:use chart.js@4 -->\n<!-- relay:share notes tag=movie -->\n<template data-relay-cover><b>cover</b></template><p>hi</p>`;
  const parsed = parse(html, { names: ["relay"] });
  assert.deepEqual(parsed.libraries, [{ name: "chart.js", version: "4" }, { name: "@scope/pkg", version: "1.2" }]);
  assert.deepEqual(parsed.directives, [{ name: "share", text: "notes tag=movie" }]);
  assert.equal(parsed.cover, "<b>cover</b>");
  assert.equal(parsed.source.trim(), "<p>hi</p>");
});

test("parse: a directive of an app this page does not answer to is left alone", () => {
  assert.equal(parse("<!-- potion:use d3@7 --><p>x</p>").libraries.length, 0);
  assert.match(parse("<!-- potion:use d3@7 --><p>x</p>").source, /potion:use/);
});

test("defineHost refuses names that could not be a property", () => {
  assert.throws(() => defineHost({ name: "my host" }));
  assert.throws(() => defineHost({ name: "page", calls: ["on"] }));
  assert.throws(() => defineHost({ name: "page", calls: ["a-b"] }));
});

// The block's side and the app's side, joined as a frame and its page would be, without a browser.
function pair(host, handlers, hooks) {
  const listeners = [];
  const context = vm.createContext({
    addEventListener: (type, f) => type === "message" && listeners.push(f),
    setTimeout,
    JSON,
    Promise,
    Error,
    parent: {
      postMessage: (message) => queueMicrotask(() => served.receive(structuredClone(message))),
    },
  });
  context.window = context;
  const served = serve(host, { post: (message) => queueMicrotask(() => listeners.forEach((f) => f({ source: context.parent, data: structuredClone(message) }))) }, handlers, hooks);
  vm.runInContext(bridgeScript(host), context);
  return { api: context[host.name], served };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a call crosses to the app's function and its answer comes back", async () => {
  const host = defineHost({ name: "relay", calls: ["things", "act"] });
  const { api } = pair(host, { things: () => [{ id: "lamp" }], act: ({ thing, action }) => `${thing}:${action}` });
  assert.deepEqual(await api.things(), [{ id: "lamp" }]);
  assert.equal(await api.act({ thing: "lamp", action: "on" }), "lamp:on");
});

test("an error in the app's function reaches the block as an error, not as the app's internals", async () => {
  const host = defineHost({ name: "page", calls: ["boom"] });
  const { api } = pair(host, { boom: () => { throw new Error("not allowed"); } });
  await assert.rejects(api.boom(), /not allowed/);
});

test("a call the host never declared does not exist in the block and is refused by the app", async () => {
  const host = defineHost({ name: "page", calls: ["a"] });
  const { api, served } = pair(host, { a: () => 1 });
  assert.equal(typeof api.secret, "undefined");
  const sent = [];
  const direct = serve(host, { post: (m) => sent.push(m) }, { a: () => 1 });
  direct.receive({ type: "block-ask", id: 7, call: "secret" });
  assert.equal(sent[0].ok, false);
  served.stop();
});

test("a call takes its arguments as the app's function is written, and none means no options", async () => {
  const host = defineHost({ name: "potion", calls: ["getRecords", "self"] });
  const { api } = pair(host, { getRecords: (structure, options) => [structure, options.limit], self: (options) => options });
  assert.deepEqual(await api.getRecords("books", { limit: 3 }), ["books", 3]);
  assert.deepEqual(await api.self(), {});
});

test("a function given to a call crosses as a way to answer the block, alone or held by an object", async () => {
  const host = defineHost({ name: "page", calls: ["load"] });
  const { api } = pair(host, {
    load: async (name, { onProgress }, done) => {
      onProgress(0.5);
      done(`${name} is here`);
      return "ok";
    },
  });
  const seen = [];
  assert.equal(await api.load("file", { onProgress: (part) => seen.push(part) }, (text) => seen.push(text)), "ok");
  await tick();
  assert.deepEqual(seen, [0.5, "file is here"]);
});

test("a watch answers again and again until the block stops it, and the app's side is ended with it", async () => {
  const host = defineHost({ name: "potion", watches: ["watchRecords"] });
  let tell, ended = 0;
  const { api, served } = pair(host, { watchRecords: (structure, options, onChange) => ((tell = onChange), () => ended++) });
  const seen = [];
  const stop = api.watchRecords("books", {}, (rows) => seen.push(rows));
  assert.equal(typeof stop, "function");
  await tick();
  tell([1]);
  tell([1, 2]);
  await tick();
  stop();
  await tick();
  tell([1, 2, 3]);
  await tick();
  assert.deepEqual(seen, [[1], [1, 2]]);
  assert.equal(ended, 1);
  // A frame that goes away ends what it was watching.
  api.watchRecords("films", {}, () => {});
  await tick();
  served.stop();
  assert.equal(ended, 2);
  assert.throws(() => defineHost({ name: "page", calls: ["a"], watches: ["a"] }));
});

test("a list that carries more than its items arrives whole", async () => {
  const host = defineHost({ name: "potion", calls: ["getNotes"], watches: ["watchRecords"] });
  const rows = () => Object.assign([{ title: "a" }, { title: "b" }], { hasMore: true, total: 9 });
  const { api } = pair(host, { getNotes: rows, watchRecords: (structure, options, onChange) => (onChange(rows()), () => {}) });
  const got = await api.getNotes({ limit: 2 });
  assert.equal(got.length, 2);
  assert.equal(got.hasMore, true);
  assert.equal(got.total, 9);
  assert.equal(got[1].title, "b");
  let watched;
  api.watchRecords("books", {}, (answer) => (watched = answer));
  await tick();
  assert.equal(watched.total, 9);
});

test("a link clicked in a block is told to the app, which is the only one that can go anywhere", () => {
  const seen = [];
  const served = serve(defineHost({ name: "page" }), { post() {} }, {}, { onLink: (href) => seen.push(href) });
  served.receive({ type: "block-link", href: "/notes/abc" });
  served.receive({ type: "block-link", href: 42 });
  assert.deepEqual(seen, ["/notes/abc"]);
  assert.match(documentOf("<a href='/x'>x</a>"), /block-link/);
  assert.match(documentOf("<p>x</p>", { mode: "fill" }), /block-scale/);
});

test("an app may run a script of its own in the frame, and it reaches the app only through the declared calls", async () => {
  const host = defineHost({
    name: "potion",
    calls: ["tile"],
    client: "window.potion.double = function(n){ return window.potion.tile({ n: n }).then(function(v){ return v * 2; }); };",
  });
  const { api } = pair(host, { tile: ({ n }) => n + 1 });
  assert.equal(await api.double(4), 10);
  assert.throws(() => defineHost({ name: "page", client: () => {} }));
});

test("each call may have its own time limit", async () => {
  const host = defineHost({ name: "page", calls: ["read", "write"] });
  const sent = [];
  const served = serve(host, { post: (m) => sent.push(m) }, { read: () => new Promise(() => {}), write: () => new Promise(() => {}) }, { timeout: (call) => (call === "read" ? 5 : 0) });
  served.receive({ type: "block-ask", id: 1, call: "read", list: [] });
  served.receive({ type: "block-ask", id: 2, call: "write", list: [] });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, 1);
});

test("bytes cross as bytes", async () => {
  const host = defineHost({ name: "page", calls: ["tile"] });
  const { api } = pair(host, { tile: () => new Uint8Array([1, 2, 3]).buffer });
  assert.deepEqual([...new Uint8Array(await api.tile({ z: 1 }))], [1, 2, 3]);
});

test("a call that takes too long is answered for, and a block that asks too often is refused", async () => {
  const host = defineHost({ name: "page", calls: ["slow", "quick"] });
  const sent = [];
  const served = serve(host, { post: (m) => sent.push(m) }, { slow: () => new Promise(() => {}), quick: () => 1 }, { timeout: 5, rate: { calls: 3, per: 60_000 } });
  served.receive({ type: "block-ask", id: 1, call: "slow", list: [] });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(sent[0].error, /took more than/);
  for (let id = 2; id <= 5; id++) served.receive({ type: "block-ask", id, call: "quick", list: [] });
  await tick();
  assert.equal(sent.filter((m) => /calls in/.test(m.error ?? "")).length, 2);
});

test("serve refuses a host whose calls have no function", () => {
  assert.throws(() => serve(defineHost({ name: "page", calls: ["a"] }), { post() {} }, {}));
});

test("an event reaches listeners, a late listener gets the last value, and unsubscribe works", async () => {
  const host = defineHost({ name: "page", events: ["scroll"] });
  const { api, served } = pair(host, {});
  const seen = [];
  const off = api.on("scroll", (value) => seen.push(value));
  served.emit("scroll", 0.25);
  await tick();
  const late = [];
  api.on("scroll", (value) => late.push(value));
  off();
  served.emit("scroll", 0.5);
  await tick();
  assert.deepEqual(seen, [0.25]);
  assert.deepEqual(late, [0.25, 0.5]);
  assert.throws(() => api.on("nope", () => {}));
  assert.throws(() => served.emit("nope", 1));
});

test("an event sent before the frame existed is given when it says hello", async () => {
  const host = defineHost({ name: "page", events: ["scroll"] });
  const sent = [];
  const served = serve(host, { post: (m) => sent.push(m) }, {});
  served.emit("scroll", 0.9);
  sent.length = 0;
  served.receive({ type: "block-hello" });
  assert.deepEqual(sent, [{ type: "block-event", event: "scroll", value: 0.9, replay: true }]);
});

test("too many unanswered calls are refused", async () => {
  const host = defineHost({ name: "page", calls: ["slow"] });
  const sent = [];
  const served = serve(host, { post: (m) => sent.push(m) }, { slow: () => new Promise(() => {}) });
  for (let id = 1; id <= 40; id++) served.receive({ type: "block-ask", id, call: "slow" });
  await tick();
  assert.equal(sent.filter((m) => m.ok === false).length, 8);
});

test("the document puts the policy before any script, and a library cannot close its own tag", () => {
  const host = defineHost({ name: "page", calls: ["x"] });
  const doc = documentOf("<p>hi</p>", { host, libraries: [{ name: "evil", source: "var a = '</script><script>alert(1)</script>';" }] });
  assert.ok(doc.indexOf(POLICY) > 0 && doc.indexOf(POLICY) < doc.indexOf("<script"));
  assert.equal(doc.match(/<\/script>/g).length, 7); // the errors, the host, its args, the height report, the expand, the room, the one library: none closed early
  assert.ok(doc.includes("window[\"page\"]"));
  assert.ok(!coverOf("<b>c</b>").includes("<script"));
});

test("an inline block can be expanded: it is told under the package's name and the app's, and scrolls inside itself", () => {
  const inline = documentOf("<p>x</p>", { host: defineHost({ name: "potion" }) });
  assert.match(inline, /html\[data-block-expanded\] \{ overflow-y: auto !important; \}/);
  assert.match(inline, /var names = \["block","potion"\]/);
  assert.match(inline, /block-escape/);
  // A block that fills its frame is already the window: there is nothing to expand.
  assert.doesNotMatch(documentOf("<p>x</p>", { mode: "fill" }), /block-expanded/);
});

test("a measured block is never told its own frame's height, and one with no height of its own gets a screen's shape, and an empty one none", () => {
  const doc = documentOf("<div id=stage></div>", {});
  assert.match(doc, /html:not\(\[data-block-expanded\]\) > body \{ height: auto !important; min-height: 0 !important; \}/);
  assert.doesNotMatch(coverOf("<b>c</b>"), /height: auto/); // a cover is the frame's size, and keeps it
  const script = doc.match(/<script>(\(function\(\)\{\n  var sent[\s\S]*?)<\/script>/)[1];
  const told = (children, { innerWidth = 320, height = 0, hidden = [] } = {}) => {
    const sent = [];
    const body = { firstElementChild: null, scrollHeight: height, offsetHeight: height, getBoundingClientRect: () => ({ width: 0, height }) };
    let last = null;
    for (const tagName of children) { const el = { tagName, nextElementSibling: null, getClientRects: () => (hidden.includes(tagName) ? [] : [{}]) }; if (last) last.nextElementSibling = el; else body.firstElementChild = el; last = el; }
    const context = vm.createContext({ innerWidth, document: { body, documentElement: { offsetHeight: height } }, parent: { postMessage: (m) => sent.push({ ...m }) }, addEventListener() {}, setTimeout() {}, setInterval() {} });
    context.window = context;
    vm.runInContext(script, context);
    return sent;
  };
  // A scene fixed to the window: the body has nothing in its flow.
  assert.deepEqual(told(["DIV", "SCRIPT"]), [{ type: "block-height", height: 180, width: 320 }]);
  // Nothing shown (nothing drawn, or a card that hid itself): it is told as empty, so its frame shrinks.
  assert.deepEqual(told(["SCRIPT", "STYLE"]), [{ type: "block-height", height: 0, width: 0 }]);
  assert.deepEqual(told(["DIV", "SCRIPT"], { hidden: ["DIV"] }), [{ type: "block-height", height: 0, width: 0 }]);
  // A frame that is not showing: nothing is told.
  assert.deepEqual(told(["DIV"], { innerWidth: 0 }), []);
  assert.deepEqual(told(["SCRIPT"], { innerWidth: 0 }), []);
  // Content with a height of its own is told as it is.
  assert.deepEqual(told(["DIV"], { height: 90 }).map((m) => m.height), [90]);
});

// A web view: the block's document is the top window, and the app is on the other side of a channel of text.
function webview(host, handlers, hooks) {
  const listeners = [];
  const context = vm.createContext({ setTimeout, JSON, Promise, Error, atob });
  context.window = context;
  context.parent = context;
  context.addEventListener = (type, f) => type === "message" && listeners.push(f);
  // The window as the block's own scripts see it: what a message from this window has as its source.
  const inside = vm.runInContext("window", context);
  context.postMessage = (message) => queueMicrotask(() => listeners.forEach((f) => f({ source: inside, data: structuredClone(message) })));
  const sent = [];
  context.ReactNativeWebView = { postMessage: (text) => (sent.push(text), queueMicrotask(() => served.receive(fromWebview(text)))) };
  const served = serve(host, webviewTarget((js) => vm.runInContext(js, context)), handlers, hooks);
  vm.runInContext(WEBVIEW_SCRIPT, context);
  vm.runInContext(bridgeScript(host), context);
  return { api: context[host.name], served, sent };
}

test("in a web view the same block talks to the same app, through text", async () => {
  const host = defineHost({ name: "potion", calls: ["getRecords", "tile"], watches: ["watchRecords"], events: ["theme"] });
  let tell;
  const { api, served, sent } = webview(host, {
    getRecords: (structure, options) => Object.assign([{ id: 1 }], { hasMore: true, structure, limit: options.limit }),
    tile: () => new Uint8Array([7, 8, 9, 250]).buffer,
    watchRecords: (structure, options, onChange) => ((tell = onChange), () => {}),
  });
  const rows = await api.getRecords("books", { limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows.hasMore, true);
  assert.equal(rows.structure, "books");
  // Bytes cross the text channel and are bytes again in the block.
  assert.deepEqual([...new Uint8Array(await api.tile({ z: 1 }))], [7, 8, 9, 250]);
  const seen = [];
  api.watchRecords("books", {}, (answer) => seen.push(answer.length));
  await tick();
  tell([1, 2, 3]);
  await tick();
  assert.deepEqual(seen, [3]);
  const themes = [];
  api.on("theme", (theme) => themes.push(theme));
  served.emit("theme", "dark");
  await tick();
  assert.deepEqual(themes, ["dark"]);
  // Only what is meant for the app leaves the web view: an answer the app sent in is not sent back to it.
  assert.ok(sent.every((text) => !/block-answer|block-event|block-callback/.test(text)));
  assert.equal(fromWebview("not json"), null);
  assert.equal(fromWebview('{"height":10}'), null);
  assert.match(documentOf("<p>x</p>", { transport: "webview" }), /__blockNative/);
  const wide = documentOf("<p>x</p>", { host, transport: "webview", expanded: true, viewport: "width=device-width, user-scalable=yes" });
  assert.match(wide, /<html data-block-expanded data-potion-expanded>/);
  assert.match(wide, /content="width=device-width, user-scalable=yes"/);
  assert.doesNotMatch(documentOf("<p>x</p>"), /__blockNative/);
});

test("the loader brings a catalogue library as the catalogue says, checks versions, and joins two requests in flight", async () => {
  let calls = 0;
  const fetch = async (url) => {
    calls++;
    return url.includes("/npm/chart.js@4/dist/chart.umd.js") ? { ok: true, text: async () => "window.Chart = 1;" } : { ok: false };
  };
  const loader = makeLoader({ fetch });
  const [a, b] = await Promise.all([loader.load("chart.js", "4"), loader.load("Chart.js", "4")]);
  assert.equal(a.source, "window.Chart = 1;");
  assert.equal(a, b);
  assert.equal(calls, 1);
  await assert.rejects(loader.load("left-pad", "1"), /no library is called/);
  await assert.rejects(loader.load("chart.js", "../../etc"), /is not a version/);
  const all = await loader.loadAll([{ name: "chart.js", version: "4" }, { name: "nope", version: "1" }]);
  assert.equal(all.libraries.length, 1);
  assert.equal(all.problems.length, 1);
  assert.ok(!validVersion("1/2"));
  assert.match(describe("chart.js", { directive: "relay" }).library.use, /relay:use chart\.js@/);
});

test("a spec names a package, a version, a file of it and the global it arrives as", () => {
  assert.deepEqual(specOf("three@0.186/addons/controls/OrbitControls.js"), { name: "three", version: "0.186", path: "/addons/controls/OrbitControls.js" });
  assert.deepEqual(specOf("@scope/pkg@^1.2 as thing"), { name: "@scope/pkg", version: "^1.2", as: "thing" });
  assert.deepEqual(specOf("Canvas-Confetti"), { name: "canvas-confetti", version: "latest" });
  assert.deepEqual(parse("<!-- block:use a@1, a@1, a@1/x.css -->").libraries, [{ name: "a", version: "1" }, { name: "a", version: "1", path: "/x.css" }]);
});

test("a module becomes a classic script: imports read the registry, exports are left in it", () => {
  const module = classicOf(`/** banner */\nimport{a as b,c}from"/npm/dep@1.0.0/+esm";import D,*as N from"/npm/other@2.0.0/+esm";export*from"/npm/dep@1.0.0/+esm";let x=b+c;const s="export{no}";export{x as value,D as default};\n//# sourceMappingURL=/sm/abc.map`);
  assert.deepEqual(module.needs, ["/npm/dep@1.0.0/+esm", "/npm/other@2.0.0/+esm"]);
  assert.deepEqual(module.exports, ["value", "default"]);
  assert.ok(!/\bimport\b|export\{x/.test(module.code));
  assert.ok(module.code.includes('const s="export{no}"')); // the library's own text is not touched
  const registry = { "/npm/dep@1.0.0/+esm": { a: 1, c: 2, extra: 9 }, "/npm/other@2.0.0/+esm": { default: "d" } };
  const exported = vm.runInNewContext(`(function($$m){"use strict";${module.code}return $$e})(registry)`, { registry });
  assert.equal(exported.value, 3);
  assert.equal(exported.default, "d");
  assert.equal(exported.extra, 9); // export * from
  assert.equal(classicOf("var a=function(){return 7};export default a();").exports[0], "default");
  assert.throws(() => classicOf('import x from"node:fs";x()'), /not a package on npm/);
});

// A CDN of three files: a package, a file of it that imports the package, and the package asked by a range.
function cdn() {
  const files = {
    "/npm/solid@1/+esm": '/**\n * Original file: /npm/solid@1.4.2/dist/solid.js\n */\nconst n=40;export{n as base};',
    "/npm/solid@1/extra/plus.js/+esm": '/**\n * Original file: /npm/solid@1.4.2/extra/plus.js\n */\nimport{base as b}from"/npm/solid@1.4.2/+esm";const p=b+2;export{p as plus};',
    "/npm/solid@1/dist/solid.css": ".solid{color:red}",
    "/npm/lone@2/+esm": 'function f(){return "called"}export{f as default};',
  };
  const asked = [];
  const fetch = async (url) => {
    const path = new URL(url).pathname;
    asked.push(path);
    return files[path] != null ? { ok: true, text: async () => files[path] } : { ok: false };
  };
  return { fetch, asked };
}

test("any package on npm is brought as a module, once, and given as a global", async () => {
  const { fetch, asked } = cdn();
  const { libraries, problems } = await makeLoader({ fetch }).loadAll([
    { name: "solid", version: "1" },
    { name: "solid", version: "1", path: "/extra/plus.js" },
    { name: "solid", version: "1", path: "/dist/solid.css" },
    { name: "lone", version: "2", as: "call" },
    { name: "absent", version: "1" },
    { name: "solid", version: "1", path: "/../../etc" },
  ]);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /absent@1 was not found/);
  assert.match(problems[1], /not a file of a package/);
  // The package is asked once by its range; the file of it that imports the exact version does not fetch it again.
  assert.deepEqual(asked.filter((path) => path.startsWith("/npm/solid")), ["/npm/solid@1/+esm", "/npm/solid@1/extra/plus.js/+esm", "/npm/solid@1/dist/solid.css"]);
  assert.equal(libraries[0].version, "1.4.2");
  assert.equal(libraries[2].styles, ".solid{color:red}");
  const window = {};
  window.window = window;
  for (const library of libraries) if (library.source) vm.runInNewContext(library.source, window);
  assert.equal(window.solid.base, 40);
  assert.equal(window.solid.plus, 42); // a file of a package the block also named joins its global
  assert.equal(window.call(), "called"); // the default export, under the name the block chose
  assert.equal(Object.keys(window.__blockModules).length, 5); // three modules; the two asked by a range are also kept under it
});

test("a slot keeps a block to its room and says that room in words", () => {
  const hover = defineSlot({ name: "hover", what: "the box under the mouse", width: { max: 320 }, height: { max: 360 }, shrink: true, interactive: false });
  assert.deepEqual(fit(hover, { height: 900, width: 500 }), { height: 360, width: 320 });
  assert.deepEqual(fit(hover, { height: 80, width: 180 }), { height: 80, width: 180 });
  assert.match(slotText(hover), /at most 320 px wide.*at most 360 px tall.*never clicked/);
  const page = defineSlot({ name: "page", height: "fill" });
  assert.equal(fit(page, { height: 900, width: 500 }).height, null);
  assert.match(slotText(page), /vh works/);
  // No ceiling but the slot's: a long page is shown whole.
  assert.deepEqual(fit(undefined, { height: 20000, width: 500 }), { height: 20000, width: null });
  assert.equal(fit(defineSlot({ name: "column", width: 400 }), { height: 50000, width: 0 }).height, 50000);
  // An empty block takes no room, unless its slot keeps some.
  assert.equal(fit(undefined, { height: 0, width: 0 }).height, 0);
  assert.equal(fit(hover, { height: 0, width: 0 }).height, 0);
  assert.equal(fit(defineSlot({ name: "tile", height: { min: 80 } }), { height: 0, width: 0 }).height, 80);
  assert.throws(() => defineSlot({ name: "Bad Name" }));
  assert.throws(() => defineSlot({ name: "x", width: { min: 500, max: 100 } }));
  const doc = documentOf("<p>hi</p>", { slot: hover });
  assert.ok(doc.includes('data-block-slot="hover"') && doc.includes("width: max-content") && doc.includes("overflow: hidden"));
  assert.ok(!documentOf("<p>hi</p>", { slot: page }).includes("block-height")); // a block that fills its frame reports no height
});

test("the catalogue is what was learned, not a gate", () => {
  assert.equal(describe("three").library.kind, "code");
  assert.match(describe().any, /Any other package on npm/);
  assert.equal(describe("left-pad"), null);
});

// The values one copy of a block was given, as the frame's script reads them.
function argsIn(doc, name) {
  const script = doc.match(/<script>(\(function\(\)\{\n  var api = window[\s\S]*?)<\/script>/)[1];
  const context = vm.createContext({ JSON });
  context.window = context;
  context[name] = {};
  vm.runInContext(script, context);
  return context[name].args;
}

test("a block's args are answered by <host>.args(), as a copy, and {} when none were given", () => {
  const host = defineHost({ name: "potion", calls: ["x"] });
  const args = argsIn(documentOf("<p>x</p>", { host, args: { caption: "From the car", n: 3, big: true } }), "potion");
  assert.deepEqual({ ...args() }, { caption: "From the car", n: 3, big: true });
  args().caption = "changed";
  assert.equal(args().caption, "From the car");
  assert.deepEqual({ ...argsIn(documentOf("<p>x</p>", { host }), "potion")() }, {});
  // Written after the bridge (it wins over an app's own stub) and before the block's libraries.
  const doc = documentOf("<p>x</p>", { host, args: { a: 1 }, libraries: [{ name: "lib", source: "var LIB = 1;" }] });
  assert.ok(doc.indexOf("window[\"potion\"] = api") < doc.indexOf("api.args") && doc.indexOf("api.args") < doc.indexOf("var LIB"));
  // No host, no args.
  assert.ok(!documentOf("<p>x</p>", { args: { a: 1 } }).includes("api.args"));
});

test("a block's args cannot end their script, and are only plain values", () => {
  const host = defineHost({ name: "page" });
  const evil = "</script><script>alert(1)</script>\u2028";
  const doc = documentOf("<p>x</p>", { host, args: { evil } });
  assert.ok(!doc.includes("</script><script>alert"));
  assert.equal(argsIn(doc, "page")().evil, evil);
  assert.throws(() => documentOf("", { host, args: { deep: { a: 1 } } }));
  assert.throws(() => documentOf("", { host, args: { n: NaN } }));
  assert.throws(() => documentOf("", { host, args: ["a"] }));
  assert.throws(() => defineHost({ name: "page", calls: ["args"] }));
});

test("a block's args reach it in a web view too", async () => {
  const host = defineHost({ name: "potion" });
  const doc = documentOf("<p>x</p>", { host, args: { caption: "hi" }, transport: "webview" });
  assert.ok(doc.indexOf("ReactNativeWebView") < doc.indexOf("api.args"));
  assert.equal(argsIn(doc, "potion")().caption, "hi");
});

test("a block's own max-width wins: 100% is a default, not a rule of the frame", () => {
  const html = documentOf('<article style="max-width:420px"></article>');
  const frame = html.slice(html.indexOf("@layer block-frame {"), html.indexOf("@layer block-defaults {"));
  assert.doesNotMatch(frame, /body > \*[^}]*max-width/);
  assert.doesNotMatch(frame, /img, video[^}]*max-width/);
  const defaults = html.slice(html.indexOf("@layer block-defaults {"));
  assert.match(defaults, /body > \*, img, video, canvas, svg, table, pre \{ max-width: 100%; \}/);
  // What a block cannot beat is still there: what is wider scrolls inside the frame.
  assert.match(frame, /overflow-x: auto !important/);
});

test("a height that climbs on its own is held where it began; a long page, or one that grows with new content, is not", async () => {
  const { documentOf, defineSlot } = await import("../src/index.js");
  const script = documentOf("<p>x</p>", {}).match(/<script>(\(function\(\)\{\n  var sent[\s\S]*?)<\/script>/)[1];
  const run = (attributes = {}) => {
    const sent = [], listeners = {}, marks = {};
    let observer = null, now = 0;
    const body = { firstElementChild: { tagName: "DIV", nextElementSibling: null, getClientRects: () => [{}] }, scrollHeight: 0, offsetHeight: 0, getBoundingClientRect: () => ({ width: 300, height: body.offsetHeight }) };
    const documentElement = { offsetHeight: 0, getAttribute: (k) => attributes[k] ?? null, setAttribute: (k) => (marks[k] = true), removeAttribute: (k) => delete marks[k], toggleAttribute: (k, on) => (on ? (marks[k] = true) : delete marks[k]) };
    const context = vm.createContext({
      innerWidth: 300, document: { body, documentElement }, parent: { postMessage: (m) => sent.push(m.height) },
      addEventListener: (type, fn) => (listeners[type] = fn), setTimeout() {}, setInterval() {},
      ResizeObserver: class { observe() {} },
      MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
      Date: { now: () => now },
    });
    context.window = context;
    vm.runInContext(script, context);
    listeners.DOMContentLoaded?.();
    const tell = (h, { after = 50, added = false } = {}) => { now += after; if (added) observer([{ type: "childList" }]); body.scrollHeight = body.offsetHeight = documentElement.offsetHeight = h; context.__blockTell(); };
    return { sent, marks, tell };
  };
  // A real page 20,000 px long, told at once: shown whole.
  const page = run();
  page.tell(20000);
  assert.equal(page.sent.at(-1), 20000);
  // A chart that grows its own box: held where the climb began, and the rest scrolls.
  const loop = run();
  loop.tell(400, { added: true });
  for (let i = 1; i <= 60; i++) loop.tell(400 + i * 4);
  assert.equal(loop.sent.at(-1), 400);
  assert.ok(loop.marks["data-block-held"]);
  // Something new arrives: it is followed again.
  loop.tell(900, { added: true });
  assert.equal(loop.sent.at(-1), 900);
  assert.ok(!loop.marks["data-block-held"]);
  // Rows added one by one for a long while: each is new content, never held.
  const feed = run();
  for (let i = 1; i <= 80; i++) feed.tell(i * 40, { added: true });
  assert.equal(feed.sent.at(-1), 3200);
  // A transition that opens a panel: many rises, but over in less than 1.5 s.
  const open = run();
  open.tell(200, { added: true });
  for (let i = 1; i <= 40; i++) open.tell(200 + i * 10, { after: 16 });
  assert.equal(open.sent.at(-1), 600);
  // An interactive slot with a most it may be: past it, the block scrolls inside itself.
  const doc = documentOf("<p>x</p>", { slot: defineSlot({ name: "card", height: { max: 360 } }) });
  assert.match(doc, /data-block-height-max="360"/);
  assert.doesNotMatch(documentOf("<p>x</p>", { slot: defineSlot({ name: "tip", height: { max: 360 }, interactive: false }) }), /data-block-height-max="/);
  const card = run({ "data-block-height-max": "360" });
  card.tell(900);
  assert.ok(card.marks["data-block-scrolls"]);
  card.tell(200, { added: true });
  assert.ok(!card.marks["data-block-scrolls"]);
});

test("a player is named by the address a person copies, and only the sites of EMBEDS become one", async () => {
  const { embedOf, playerMessage, EMBEDS, POLICY, WEBVIEW_POLICY, PAGE_POLICY, documentOf } = await import("../src/index.js");
  const yt = embedOf("https://youtu.be/d6c6uIyieoo?t=1m30s");
  assert.equal(yt.site, "youtube");
  assert.equal(yt.src, "https://www.youtube-nocookie.com/embed/d6c6uIyieoo?enablejsapi=1&playsinline=1&rel=0&start=90");
  assert.equal(embedOf("https://www.youtube.com/watch?v=d6c6uIyieoo").site, "youtube");
  assert.equal(embedOf("https://youtube.com/shorts/abcdefghijk").ratio, 9 / 16);
  assert.equal(embedOf("https://vimeo.com/76979871").src, "https://player.vimeo.com/video/76979871?api=1");
  assert.equal(embedOf("https://open.spotify.com/intl-fr/track/4cOdK2wGLETKBW3PvgPWqT").src, "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT");
  assert.equal(embedOf("https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama/").src, "https://embed.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama/");
  assert.equal(embedOf("https://www.instagram.com/p/BsOGulcndj-/").src, "https://www.instagram.com/p/BsOGulcndj-/embed/");
  // Anything else is no player: another site, a page of a listed site that is not a player, a forged id.
  for (const no of ["https://evil.example/embed/x", "https://www.youtube.com/@numberphile", "https://youtu.be/<script>", "https://x.com/jack/status/20", "javascript:alert(1)", "not a url"]) assert.equal(embedOf(no), null, no);
  // Every player made is under one of the closed list's paths.
  for (const address of ["https://youtu.be/d6c6uIyieoo", "https://vimeo.com/76979871", "https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT", "https://www.reddit.com/r/IAmA/comments/z1c9z/", "https://www.instagram.com/reel/BsOGulcndj-/"]) {
    assert.ok(EMBEDS.some((prefix) => embedOf(address).src.startsWith(prefix)), address);
  }
  // On a web page the block frames nothing: the page lays the players over it. Only a web view frames them.
  assert.doesNotMatch(POLICY, /frame-src/);
  assert.match(WEBVIEW_POLICY, /frame-src https:\/\/www\.youtube-nocookie\.com\/embed\//);
  assert.equal(PAGE_POLICY, `frame-src ${EMBEDS.join(" ")}`);
  assert.ok(documentOf("<block-embed src=x></block-embed>").includes("var nested = false"));
  assert.ok(documentOf("<block-embed src=x></block-embed>", { transport: "webview" }).includes("var nested = true"));
  assert.ok(documentOf("<block-embed src=x></block-embed>", { transport: "webview" }).includes(WEBVIEW_POLICY));
  assert.ok(!documentOf("<p>no player</p>").includes("block-embed"));
  // What moves a player, and where it may be sent.
  assert.deepEqual(playerMessage("youtube", "seek", 125), [JSON.stringify({ event: "command", func: "seekTo", args: [125, true] }), "https://www.youtube-nocookie.com"]);
  assert.deepEqual(playerMessage("vimeo", "pause"), [JSON.stringify({ method: "pause" }), "https://player.vimeo.com"]);
  assert.equal(playerMessage("spotify", "play"), null);
});
