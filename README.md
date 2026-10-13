# block

The sandboxed html block that Potion, Relay and Tags each built for themselves, as one package: the document a block runs in, the libraries it may name, and the functions its host app lends it.

A block is html written by a person or a model. It is shown in a frame that reaches nothing: no network, no storage, not the page around it. Whatever it needs from outside, the app lends it by name.

| Folder | What it is |
|---|---|
| `lib/` | `@ghostmind-dev/block`, the npm package. Plain ESM JavaScript, no dependency |
| `ui/` | The web app: a person's blocks, each shown in the slot it was written for, and a page to try one without keeping it (https://block.ghostmind.app in dev) |
| `mcp/` | The remote MCP (Google sign-in) that makes and changes blocks, and the API the web app reads |
| `db/` | Hasura on the shared Postgres: one row per block |
| `tunnel/` | cloudflared: `block.ghostmind.app` (dev) and `block.ghostmind.dev` (prod), by path to the mcp and the web app |
| `plugin/` | The Claude plugin: the prod MCP and the skill that teaches writing a block |
| `demo/` | A page with no build that mounts one block and lends it its scroll (http://localhost:5105) |

## Use

```js
import { defineHost, makeLoader } from "@ghostmind-dev/block";
import { mount } from "@ghostmind-dev/block/web";

// What this app lends its blocks. In the block it is window.relay.
const relay = defineHost({ name: "relay", calls: ["things", "act"], events: ["change"] });

const block = await mount(container, html, {
  host: relay,
  handlers: { things: () => readThings(), act: ({ thing, action }) => run(thing, action) },
  loader: makeLoader(), // brings the libraries a block names: <!-- relay:use chart.js@4 -->
});
block.emit("change", things);
```

In the block:

```html
<!-- relay:use chart.js@4 -->
<script>
  const things = await relay.things();
  relay.on("change", (things) => draw(things));
</script>
```

Outside a web page (a server that renders the document, a React Native web view), use the parts `mount` is made of: `parse`, `documentOf` and `serve`.

## Libraries

A block names what it needs on its first lines and gets each as a global:

```html
<!-- block:use chart.js@4 -->                                                    Chart
<!-- block:use three@0.186, three@0.186/addons/controls/OrbitControls.js -->     THREE, THREE.OrbitControls
<!-- block:use canvas-confetti@1 as confetti, leaflet@1.9/dist/leaflet.css -->   a name the block chose; a stylesheet
```

Any package on npm can be named. The frame is what keeps a block in, not a list of names. The catalogue (`lib/app/src/catalogue.js`) is what was learned about the ones that were tried.

## Slots

A slot is a place of an app and the room a block has there. The app declares it once; `mount` keeps the block inside it, and `slotText` says the same numbers to whoever writes the block.

```js
const hover = defineSlot({ name: "hover", what: "the box under the mouse", width: { max: 320 }, height: { max: 360 }, shrink: true, interactive: false });
await mount(container, html, { slot: hover });
slotText(hover); // "hover: the box under the mouse. It is at most 320 px wide, at most 360 px tall: …"
```

## Run

Dev runs on the current kube context. The shared Postgres and the users service are on the M1's cluster, so switch to it first: `kubectl config use-context m1 && docker context use m1`.

```sh
run routine test      # in lib/: the package's tests
run routine start     # in db/: Hasura; then `run routine migrate`
run routine dev       # in mcp/, ui/ and tunnel/: https://block.ghostmind.app is the one host (the tunnel sends /mcp, /oauth and /api to the mcp)
run routine dev       # in demo/: the page on http://localhost:5105
```

The web app is also on http://localhost:5106, and sign-in works from there too (Google sends people back through the tunnel, so the tunnel has to be up).

Claude Code reaches the dev MCP at `https://block.ghostmind.app/mcp`: a session opened in this repo has it as `block-dev` (`.mcp.json`). The plugin's MCP is the prod one.

A dev routine refuses a cluster that has no shared Postgres (`k8s/dev-setup.sh`), so nothing is deployed to a laptop's own cluster by mistake.

## State

- The package brings any npm library, keeps a block in a slot and reports what a block threw. Its tests pass, and the web app shows three.js, a chart and each slot in a browser.
- `db`, `mcp` and `ui` run on the dev cluster. The product's Google sign-in client (project `ghostmind-core`, client `block`) is in Vault at `ghostmind/project/block/auth`.
- Prod is `https://block.ghostmind.dev`, deployed by a merge to main (`.github/workflows/deploy.yaml`): only the apps a merge changed, or everything on a run started by hand. `run routine prod_init` set up the namespace, the Vault roles and the tunnel; run it again when an app or a prod secret path is added.
- The three apps still run their own copy of the block; nothing has been replaced yet.

## Next

- Before Potion can move onto the package: a limit on calls per block, a timeout per call, and binary answers (map tiles) on the bridge.
- Move one app onto the package, Relay first: its frame is the closest to this code.
- A React component and a React Native one around `mount` and `serve`.
- Publish to npm once a second app uses it.
