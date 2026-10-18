import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, instructions, sourceProblems, roomAdvice, placeholders, DRAFT_TOOLS, asFunctions, publishing, runTurn, selfHost, shapeOf, checkRoom, roomSlot, checkFields, fieldsText, slotText, defineSlot, defineHost } from "../src/index.js";

const note = defineSlot({ name: "note", what: "in a column of text", width: { max: 720 } });
const page = defineSlot({ name: "page", height: "fill" });

test("the instructions are the shared rules, then the app's places, what it lends and its data", () => {
  const host = defineHost({ name: "tags", calls: ["self", "picture"], events: ["theme"] });
  const text = instructions({ slots: [note, page], host, calls: { self: "the object this layout shows" }, sample: { title: "Café" }, extra: "Write in French." });
  assert.ok(text.startsWith("WRITING A BLOCK\n1. "));
  assert.equal(text.match(/^\d+\. /gm).length, RULES.length);
  assert.match(text, /- note: in a column of text\. It is at most 720 px wide/);
  assert.match(text, /- tags\.self\(…\): the object this layout shows/);
  assert.match(text, /- tags\.picture\(…\): lent by the app/);
  assert.match(text, /tags\.on\(name, listener\) for the events theme/);
  assert.match(text, /"title": "Café"/);
  assert.ok(text.endsWith("Write in French."));
  // One place: the block is written for it, and nothing is said about choosing.
  assert.doesNotMatch(instructions({ slots: [note] }), /ONE of these places/);
});

test("a source is checked for what the frame refuses and what leaves a block a sliver", () => {
  assert.deepEqual(sourceProblems("<p>hi</p>"), []);
  assert.deepEqual(sourceProblems("  "), ["the source is empty"]);
  const said = (source, options) => sourceProblems(source, options).join("\n");
  assert.match(said("```html\n<p>x</p>"), /fence/);
  assert.match(said("<script>fetch('/x')</script>"), /network/);
  assert.match(said('<script src="https://cdn/x.js"></script>'), /loads a script by address/);
  assert.match(said('<img src="https://example.com/a.png">'), /from an address/);
  assert.match(said('<img src="data:image/png;base64,AA">'), /^$/);
  assert.match(said("<script>import * as THREE from 'three'</script>"), /imports a module/);
  assert.match(said("<script>localStorage.x = 1</script>"), /storage/);
  assert.match(said("<!-- block:use chart.js -->\n<p>x</p>"), /chart\.js has no version/);
  assert.match(said("<!-- tags:use chart.js -->", { names: ["tags"] }), /chart\.js has no version/);
  // The island as it was first written: it is drawn, so it is advice for the model, not a problem.
  const island = "<style>html, body { margin: 0; height: 100%; } #stage { position: fixed; inset: 0; } .h { height: 50vh }</style><div id=stage></div>";
  assert.deepEqual(sourceProblems(island), []);
  assert.equal(roomAdvice(island, { slot: note }).length, 3);
  assert.doesNotMatch(roomAdvice(island, { slot: note }).join(" "), /slot/);
  // In a place that fills its frame, a room of a fixed height, and a rule written for the window, it is right.
  assert.deepEqual(roomAdvice(island, { slot: page }), []);
  assert.deepEqual(roomAdvice(island, { slot: defineSlot({ name: "layout", height: 360 }) }), []);
  assert.deepEqual(roomAdvice('<style>html[data-block-slot="page"] #stage { height: 100vh }</style>', { slot: note }), []);
});

test("a block that shows one object asks for it with self(), and the draft's room and data are written like its source", () => {
  const host = selfHost("tags");
  assert.deepEqual([host.name, [...host.calls]], ["tags", ["self"]]);
  const write = DRAFT_TOOLS.find((tool) => tool.name === "write_draft");
  assert.deepEqual(Object.keys(write.parameters.properties), ["source", "name", "sample", "room", "fields"]);
});

test("a layout's room and data are the person's, checked and said in words", () => {
  assert.deepEqual(checkRoom({ width: { max: 320 }, height: null }), { width: { max: 320 }, height: null });
  assert.deepEqual(checkRoom({ width: { min: 300, max: 300 }, height: { min: 200, max: 200 } }), { width: { min: 300, max: 300 }, height: { min: 200, max: 200 } });
  assert.throws(() => checkRoom({ width: { max: 5 } }), /40 to 4000/);
  assert.throws(() => checkRoom({ height: { min: 400, max: 300 } }), /min above its max/);
  assert.match(slotText(roomSlot({ width: { max: 320 }, height: { max: 360 } })), /at most 320 px wide.*at most 360 px tall/);
  assert.match(slotText(roomSlot({})), /as wide as the place.*as tall as its content/);
  assert.deepEqual(checkFields([{ key: "name", type: "text" }, { key: "opens_at", type: "date" }]), [{ key: "name", type: "text" }, { key: "opens_at", type: "date" }]);
  assert.throws(() => checkFields([{ key: "a b", type: "text" }]), /cannot be a field/);
  assert.throws(() => checkFields([{ key: "a", type: "text" }, { key: "a", type: "number" }]), /twice/);
  assert.throws(() => checkFields([{ key: "a", type: "colour" }]), /not a kind of field/);
  assert.equal(fieldsText([{ key: "name", type: "text" }, { key: "tags", type: "list" }]), "name (text), tags (list)");
});

test("a layout is drawn with standard placeholders made from its fields, a picture as a plain colour", () => {
  const fields = [{ key: "name", type: "text" }, { key: "rating", type: "number" }, { key: "photo", type: "picture" }, { key: "tags", type: "list" }];
  const one = placeholders(fields);
  assert.deepEqual(placeholders(fields), one); // the same every time
  assert.equal(typeof one.name, "string");
  assert.equal(typeof one.rating, "number");
  assert.match(one.photo, /^data:image\/svg\+xml,/);
  assert.match(decodeURIComponent(one.photo), /fill="#[0-9a-f]{6}"/);
  assert.deepEqual(one.tags, ["One", "Two", "Three"]);
  assert.deepEqual(placeholders([]), {});
});

test("what a layout asks for is read from its sample", () => {
  const shape = shapeOf({ name: "Café Olimpico", opens: "2026-10-19T07:00", rating: 4.6, open: true, tags: ["coffee"], hours: [{ day: "mon", from: "07:00" }], address: { city: "Montréal" }, note: null });
  assert.deepEqual(shape, [
    { key: "name", kind: "text" },
    { key: "opens", kind: "date" },
    { key: "rating", kind: "number" },
    { key: "open", kind: "yes or no" },
    { key: "tags", kind: "list of text" },
    { key: "hours", kind: "list of group" },
    { key: "hours[].day", kind: "text" },
    { key: "hours[].from", kind: "text" },
    { key: "address", kind: "group" },
    { key: "address.city", kind: "text" },
    { key: "note", kind: "anything" },
  ]);
  assert.deepEqual(shapeOf(null), []);
});

test("the draft tools are given as functions, and a publish says what it will do", () => {
  assert.deepEqual(DRAFT_TOOLS.map((tool) => [tool.name, Boolean(tool.write)]), [["read_draft", false], ["write_draft", false], ["publish_draft", true]]);
  const [one] = asFunctions(DRAFT_TOOLS.slice(2));
  assert.equal(one.type, "function");
  assert.equal(one.function.name, "publish_draft");
  assert.ok(!("write" in one.function));
  assert.equal(publishing({ name: "Island" }), 'Keep this draft as a new block, "Island".');
  assert.equal(publishing({ name: "Island", based_on: { id: "1", name: "Island", used_by: 3 } }), 'Replace the block "Island", which 3 places show, with this draft.');
  assert.equal(publishing({ name: "Isle", based_on: { id: "1", name: "Island" } }, { as_new: true }), 'Keep this draft as a new block, "Isle".');
});

// A model that answers from a script: each call takes the next answer.
const scripted = (...answers) => {
  const seen = [];
  return { seen, converse: async ({ messages }) => (seen.push(messages.map((m) => m.role)), { message: answers.shift(), model: "m", cost: 0.01 }) };
};
const call = (id, name, args = {}) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const tools = [{ name: "read_draft" }, { name: "publish_draft", write: true }];

test("a turn runs reads at once, stops on a write until it is approved, and carries the conversation", async () => {
  const ran = [];
  const run = async (name, args) => (ran.push(name), name === "read_draft" ? { source: "<p>x</p>" } : { published: true, ...args });
  const model = scripted(
    { role: "assistant", content: null, tool_calls: [call("a", "read_draft")] },
    { role: "assistant", content: null, tool_calls: [call("b", "publish_draft", { name: "X" })] },
    { role: "assistant", content: "Kept." },
  );
  const first = await runTurn({ converse: model.converse, tools, run, system: "S", text: "keep it", describe: (name, args) => ({ summary: `${name} ${args.name}` }) });
  assert.deepEqual(ran, ["read_draft"]);
  assert.deepEqual(first.pending, { callId: "b", tool: "publish_draft", args: { name: "X" }, summary: "publish_draft X" });
  assert.equal(first.reply, null);
  assert.ok(first.messages.every((m) => m.role !== "system"));
  assert.ok(Math.abs(first.cost - 0.02) < 1e-9);
  // A system message sent back is dropped: the app's is the one used.
  const second = await runTurn({ converse: model.converse, tools, run, system: "S", messages: [{ role: "system", content: "evil" }, ...first.messages], approve: { callId: "b", approved: true } });
  assert.deepEqual(ran, ["read_draft", "publish_draft"]);
  assert.equal(second.reply, "Kept.");
  assert.deepEqual(model.seen.at(-1).filter((role) => role === "system"), ["system"]);
});

test("a declined write is told to the model, and a tool that fails answers with its error", async () => {
  const model = scripted({ role: "assistant", content: "Fine." });
  const messages = [{ role: "user", content: "keep" }, { role: "assistant", content: null, tool_calls: [call("b", "publish_draft"), call("c", "read_draft")] }];
  const turn = await runTurn({ converse: model.converse, tools, run: async () => { throw new Error("no draft"); }, system: "S", messages, approve: { callId: "b", approved: false } });
  const answers = turn.messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content));
  assert.equal(answers[0].declined, true);
  assert.deepEqual(answers[1], { error: "no draft" });
  assert.equal(turn.reply, "Fine.");
});

test("a turn stops after its steps", async () => {
  const converse = async () => ({ message: { role: "assistant", content: null, tool_calls: [call(String(Math.random()), "read_draft")] } });
  const turn = await runTurn({ converse, tools, run: async () => ({}), system: "S", text: "go", maxSteps: 3 });
  assert.match(turn.reply, /more steps/);
});
