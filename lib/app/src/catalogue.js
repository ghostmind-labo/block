// The libraries a block may name, and what was learned running each one in the sandbox.
// It began as Potion's catalogue and was copied by hand to Relay; this is now the one to edit.
// A JavaScript module, not a .json file, so that a browser, Node and a bundler all read it the same way.
export default {
  "three": {
    "pkg": "three",
    "global": "THREE",
    "category": "3D",
    "summary": "WebGL scenes: meshes, lights, cameras, materials, and the add-ons written for it.",
    "when": "A real 3D scene: a model to turn, a terrain, particles in depth. For flat pseudo-3D drawings zdog is a hundred times lighter.",
    "builds": [],
    "module": true,
    "aliases": {
      "/addons/": "/examples/jsm/"
    },
    "sandbox": [
      "It arrives as the global `THREE`, never by `import`. Name each add-on as a file of the package and it joins the same global: `three@0.186/addons/controls/OrbitControls.js` is `THREE.OrbitControls`.",
      "Name three and its add-ons with the same version, so that they are one copy.",
      "Give the canvas a parent with an explicit height and size the renderer from that parent, not from the window: an inline block is as tall as its content, and a canvas that follows its own height grows without end.",
      "`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, and stop the loop when the block is off screen (IntersectionObserver): a page may show several blocks.",
      "Textures, models and fonts cannot be fetched: build geometry in code, draw textures on a canvas (`CanvasTexture`), or carry a small file as a `data:` address.",
      "Use `alpha: true` and no scene background so the app's ground shows through, or paint a ground of your own; do not assume white.",
      "WebGL only: the WebGPU renderer and TSL are other builds, not this one."
    ],
    "tested": "0.186"
  },
  "chart.js": {
    "pkg": "chart.js",
    "global": "Chart",
    "category": "Charts",
    "summary": "Bar, line, pie, radar and scatter charts on a canvas.",
    "when": "The default for plotting data. A table beats it for three numbers; reach for it once the shape of the data is the point.",
    "builds": [
      "dist/chart.umd.js",
      "dist/chart.js",
      "dist/Chart.min.js"
    ],
    "sandbox": [
      "Labels and ticks default to a fixed grey that vanishes on dark themes: set `Chart.defaults.color` from `getComputedStyle(document.body).color` before creating the chart.",
      "Give the canvas a parent with an explicit height and set `maintainAspectRatio: false`; with no height the chart collapses.",
      "Set `animation: false` so the first frame the host measures is the finished chart."
    ],
    "tested": "4"
  },
  "d3": {
    "pkg": "d3",
    "global": "d3",
    "category": "Charts",
    "summary": "Data-driven SVG: scales, axes, layouts, arbitrary custom charts.",
    "when": "A chart no charting library has a name for. Harder to get right than chart.js, so prefer that unless the layout is genuinely custom.",
    "builds": [
      "dist/d3.min.js"
    ],
    "sandbox": [
      "Draw in a fixed coordinate space with `viewBox` and `width:100%`: the SVG scales to the block, so nothing has to be measured before the frame is laid out.",
      "Axes already draw with `currentColor`, which follows the theme; set text labels to `fill: currentColor` too, and soften axis lines to a translucent grey."
    ],
    "tested": "7"
  },
  "apexcharts": {
    "pkg": "apexcharts",
    "global": "ApexCharts",
    "category": "Charts",
    "summary": "Polished interactive charts with built-in tooltips, zoom and legends.",
    "when": "A chart meant to be explored rather than read once.",
    "builds": [
      "dist/apexcharts.min.js"
    ],
    "sandbox": [
      "Labels default to #373d3f, invisible on dark themes: set `chart.foreColor` from `getComputedStyle(document.body).color`, and `theme.mode`/`tooltip.theme` from the `color-scheme` meta.",
      "Set `chart.background: 'transparent'` — the default white card ignores the theme.",
      "Render inside requestAnimationFrame with `width: '100%'`, and wrap the chart in a fixed-height box with `overflow: hidden`: the SVG keeps settling after render and, as the last thing in the frame, can overhang it and raise scrollbars that squeeze the chart on desktop."
    ],
    "tested": "4"
  },
  "echarts": {
    "pkg": "echarts",
    "global": "echarts",
    "category": "Charts",
    "summary": "Large-scale charting: treemaps, sankey, heatmaps, geo, candlestick.",
    "when": "Chart types chart.js does not have, or thousands of points. It is 1MB, so do not use it for a bar chart.",
    "builds": [
      "dist/echarts.min.js"
    ],
    "sandbox": [
      "About 1MB: the first load of a note can take many seconds on a slow connection, so use it only for chart types chart.js lacks (treemap, sankey, heatmap), never for a plain bar or line chart.",
      "Give the container an explicit height and call `echarts.init` inside requestAnimationFrame, so it reads the real width after layout.",
      "Set `backgroundColor: 'transparent'` — the built-in dark theme paints its own navy ground.",
      "Colour tiles and series explicitly with dark solid colours and white labels; automatic shading (`colorSaturation`) produces pale tiles that white text vanishes on."
    ],
    "tested": "5"
  },
  "frappe-charts": {
    "pkg": "frappe-charts",
    "global": "frappe",
    "category": "Charts",
    "summary": "Small, clean SVG charts.",
    "when": "A simple chart where echarts or plotly would be wildly oversized.",
    "builds": [
      "dist/frappe-charts.min.iife.js"
    ],
    "sandbox": [
      "Axis labels and legend text use a fixed grey: override with `.frappe-chart text { fill: currentColor !important }` so they follow the theme, and soften grid lines to a translucent grey.",
      "Create the chart inside requestAnimationFrame so it reads the real width, and set `animate: false` so the first measured frame is the finished chart.",
      "It redraws when the frame resizes, so a capture right after load can show a half-drawn chart; judge it once it has settled."
    ],
    "tested": "1"
  },
  "plotly.js-basic-dist": {
    "pkg": "plotly.js-basic-dist",
    "global": "Plotly",
    "category": "Charts",
    "summary": "Scientific and statistical plotting.",
    "when": "Analysis output rather than a dashboard tile: error bars, log axes, many scatter points. The basic bundle has only scatter, bar and pie traces — no box plots, histograms or heatmaps (use echarts for those).",
    "builds": [
      "plotly-basic.min.js"
    ],
    "sandbox": [
      "Only scatter, bar and pie traces exist in this bundle. Any other `type` (box, histogram, heatmap) does not error — it silently draws as scatter lines.",
      "Set `paper_bgcolor` and `plot_bgcolor` to `'transparent'` and `font.color` from `getComputedStyle(document.body).color`; the defaults are a white paper with #444 text that ignore the theme.",
      "Give the container an explicit height, draw inside requestAnimationFrame, and pass `{ displayModeBar: false, responsive: true }`."
    ],
    "tested": "2"
  },
  "preact": {
    "pkg": "preact",
    "global": "preact",
    "category": "Interface",
    "summary": "A 4KB React-compatible renderer: components, state, diffing.",
    "when": "A block whose UI has real state — a filter, a toggle, a list that re-renders. Plain DOM is the default; reach for this when hand-written innerHTML starts fighting you. Pair with htm for JSX-like markup, since a block has no build step.",
    "builds": [
      "dist/preact.umd.js"
    ],
    "sandbox": [
      "The host loads preact core only: useState and other hooks live in preact/hooks and are not there. Use a class component (preact.Component with this.setState).",
      "Pair it with htm on the same directive (relay:use preact@10, htm@3) for JSX-like markup with no build step."
    ],
    "tested": "10"
  },
  "htm": {
    "pkg": "htm",
    "global": "htm",
    "category": "Interface",
    "summary": "JSX-like tagged templates with no build step.",
    "when": "Always alongside preact — `const html = htm.bind(preact.h)` gives you JSX syntax a block can actually run. On its own it does nothing.",
    "builds": [
      "dist/htm.umd.js"
    ],
    "sandbox": [
      "htm does nothing alone: load it with preact (relay:use htm@3, preact@10) and bind it with htm.bind(preact.h).",
      "Tagged templates compile at call time with no eval, so it is safe under the sandbox CSP."
    ],
    "tested": "3"
  },
  "gridjs": {
    "pkg": "gridjs",
    "global": "gridjs",
    "category": "Tables & data",
    "summary": "Interactive tables: sorting, search, pagination, fixed header.",
    "when": "Only when a table needs to be *used* rather than read — sorted, searched, or paged. A plain markdown table is the default and handles most tabular content.",
    "builds": [
      "dist/gridjs.umd.js"
    ],
    "styles": [
      "dist/theme/mermaid.min.css"
    ],
    "sandbox": [
      "Ships CSS written for a white page: restyle its surfaces with `color: inherit` and translucent greys, or the table stays white in every theme."
    ],
    "tested": "6"
  },
  "p5": {
    "pkg": "p5",
    "global": "p5",
    "category": "Drawing",
    "summary": "2D canvas drawing, generative sketches and simple animation.",
    "when": "Something procedural or hand-animated. Static diagrams and simple shapes belong in inline SVG.",
    "builds": [
      "lib/p5.min.js"
    ],
    "sandbox": [
      "Pin @1: p5 2 uses new Function for its shader tools, which the sandbox CSP blocks.",
      "Use instance mode, new p5(sketch, host): global mode defines window.setup and draw, which collide when a note has two p5 blocks.",
      "Create the canvas inside requestAnimationFrame so host.clientWidth is real, and call p.pixelDensity(devicePixelRatio)."
    ],
    "tested": "1"
  },
  "konva": {
    "pkg": "konva",
    "global": "Konva",
    "category": "Drawing",
    "summary": "Canvas scene graph with layers, shapes, dragging and hit detection.",
    "when": "An interactive canvas where the user moves things around.",
    "builds": [
      "konva.min.js"
    ],
    "sandbox": [
      "Build the Stage inside requestAnimationFrame from the container clientWidth; Konva handles devicePixelRatio itself.",
      "Set touch-action: none on the container so shapes drag on a phone instead of scrolling the note."
    ],
    "tested": "9"
  },
  "fabric": {
    "pkg": "fabric",
    "global": "fabric",
    "category": "Drawing",
    "summary": "Canvas objects you can select, transform and serialise.",
    "when": "An editor-like surface: place, resize and rotate items.",
    "builds": [
      "dist/index.min.js",
      "dist/fabric.min.js"
    ],
    "sandbox": [
      "Construct fabric.Canvas inside requestAnimationFrame: it reads the canvas CSS size once, at construction.",
      "Retina scaling is on by default; no devicePixelRatio code needed."
    ],
    "tested": "6"
  },
  "two.js": {
    "pkg": "two.js",
    "global": "Two",
    "category": "Drawing",
    "summary": "2D vector drawing across canvas, SVG or WebGL.",
    "when": "Clean vector shapes and smooth motion without p5's sketch framing.",
    "builds": [
      "build/two.min.js"
    ],
    "sandbox": [
      "Use type: Two.Types.canvas and size from the container inside requestAnimationFrame.",
      ".bind('update', cb).play() drives animation without a loop of your own."
    ],
    "tested": "0.8"
  },
  "roughjs": {
    "pkg": "roughjs",
    "global": "rough",
    "category": "Drawing",
    "summary": "Hand-drawn, sketchy rendering of shapes and charts.",
    "when": "A diagram that should read as a sketch rather than a finished figure.",
    "builds": [
      "bundled/rough.js"
    ],
    "sandbox": [
      "rough.svg(el) returns nodes you append yourself; rough.canvas draws straight onto a canvas.",
      "Pass stroke: 'currentColor' so the sketch follows the block's text colour; a fixed viewBox with width: 100% needs no sizing code."
    ],
    "tested": "4"
  },
  "caveat": {
    "pkg": "@fontsource/caveat",
    "global": "Caveat",
    "category": "Fonts",
    "summary": "A handwriting font — marker-on-whiteboard lettering. Use as font-family: Caveat.",
    "when": "A block that should read as handwritten notes: a whiteboard explainer, an annotated sketch. System 'cursive' differs on every device; this is the same everywhere.",
    "builds": [],
    "fonts": {
      "family": "Caveat",
      "files": [
        {
          "path": "files/caveat-latin-400-normal.woff2",
          "weight": 400
        },
        {
          "path": "files/caveat-latin-700-normal.woff2",
          "weight": 700
        }
      ]
    },
    "sandbox": [
      "A typeface, not code: write `font-family: Caveat` — there is no global to call.",
      "A font entry: load it with the directive, then set font-family to its global name. There is no script to call.",
      "The font lands after the page first lays out and makes the text taller; the iOS frame now re-measures when fonts finish loading. Leave a little bottom padding under the last line anyway."
    ],
    "tested": "5"
  },
  "temml": {
    "pkg": "temml",
    "global": "temml",
    "category": "Maths",
    "summary": "LaTeX maths rendered as MathML: temml.render(tex, element).",
    "when": "An equation inside a block — a note's own $…$ maths does not reach into html blocks. MathML needs no fonts, so it works in the sandbox where KaTeX would not.",
    "builds": [
      "dist/temml.min.js"
    ],
    "styles": [
      "dist/Temml-Local.css"
    ],
    "fonts": {
      "family": "Temml",
      "files": [
        {
          "path": "dist/Temml.woff2",
          "weight": 400
        }
      ]
    },
    "sandbox": [
      "Needs Temml-Local.css and the Temml font; the host injects both from this entry, and without them the maths renders blank.",
      "Its stylesheet uses currentColor throughout, so rendered maths follows the block's text colour with no restyling."
    ],
    "tested": "0.13.5"
  },
  "mathjs": {
    "pkg": "mathjs",
    "global": "math",
    "category": "Maths",
    "summary": "Expression parser, units, matrices and exact fractions: math.evaluate(\"12 cm to inch\").",
    "when": "A calculator, unit converter or formula sheet — anything where the user types an expression rather than numbers into fixed fields.",
    "builds": [
      "lib/browser/math.js"
    ],
    "sandbox": [
      "Style form controls yourself (color: inherit, background, border): an input does not inherit the block text colour."
    ],
    "tested": "15"
  },
  "minisearch": {
    "pkg": "minisearch",
    "global": "MiniSearch",
    "category": "Text & search",
    "summary": "Tiny full-text search index with ranking, prefix and fuzzy matching.",
    "when": "A search box over note titles or contents inside a dashboard. fuse.js is better for fuzzy matching a short list; this is for ranked search over longer text.",
    "builds": [
      "dist/umd/index.min.js"
    ],
    "sandbox": [
      "Build result rows with textContent, not innerHTML, so document text cannot inject markup.",
      "Style the search input yourself (color, background, border): inputs do not inherit the block text colour."
    ],
    "tested": "7"
  },
  "tabulator": {
    "pkg": "tabulator-tables",
    "global": "Tabulator",
    "category": "Tables & data",
    "summary": "Spreadsheet-grade tables: sorting, filtering, grouping, column resizing, pagination.",
    "when": "Exploring many notes as rows — group films by style, sort by rating, filter as you type. gridjs is lighter for a plain sortable table. Edits made in the table stay in the block; a block cannot write back.",
    "builds": [
      "dist/js/tabulator.min.js"
    ],
    "styles": [
      "dist/css/tabulator.min.css"
    ],
    "sandbox": [
      "Ships CSS written for a white page: restyle its surfaces with `color: inherit` and translucent greys, or the table stays white in every theme."
    ],
    "tested": "6"
  },
  "compromise": {
    "pkg": "compromise",
    "global": "nlp",
    "category": "Text & search",
    "summary": "English NLP: people, places, organisations, dates, topics, verb tenses.",
    "when": "Pulling structure out of note text — who is mentioned, which topics recur — without an AI call. English only.",
    "builds": [
      "builds/compromise.js"
    ],
    "sandbox": [
      "Use the built-in .people(), .places(), .organizations() and .topics(); anything beyond them needs a plugin the host does not load.",
      "English only: other languages come back as empty groups, so code the empty state."
    ],
    "tested": "14"
  },
  "wordcloud": {
    "pkg": "wordcloud",
    "global": "WordCloud",
    "category": "Text & search",
    "summary": "Word clouds drawn on a canvas.",
    "when": "Showing which words or tags dominate a set of notes at a glance. A bar chart is better when exact counts matter.",
    "builds": [
      "src/wordcloud2.js"
    ],
    "sandbox": [
      "Size the canvas inside requestAnimationFrame, after layout — measured earlier, the block has no width yet and the cloud draws into nothing.",
      "Size the canvas inside requestAnimationFrame and scale it by devicePixelRatio, with weightFactor scaled to match.",
      "Draw on a solid panel you choose: WordCloud picks its own word colours."
    ],
    "tested": "1"
  },
  "jsmind": {
    "pkg": "jsmind",
    "global": "jsMind",
    "category": "Diagrams",
    "summary": "Mind maps from a node tree, with collapsible branches.",
    "when": "Brainstorms and topic maps where hierarchy matters and branches should collapse. A small map that never needs to collapse is simpler as inline SVG.",
    "builds": [
      "es6/jsmind.js"
    ],
    "styles": [
      "style/jsmind.css"
    ],
    "sandbox": [
      "Mount the map inside requestAnimationFrame, after layout, so its container has a width; mounted earlier it renders empty.",
      "Use view: { engine: 'svg' }: with the default canvas engine the connector lines stop short of restyled nodes.",
      "mode: 'side' keeps every branch on one side, so the map fits a phone's width.",
      "Restyle its white node theme on the jmnode and jmexpander elements, with !important."
    ],
    "tested": "0"
  },
  "mark.js": {
    "pkg": "mark.js",
    "global": "Mark",
    "category": "Text & search",
    "summary": "Highlights search terms inside rendered text: new Mark(el).mark(\"term\").",
    "when": "A block that shows text and lets the reader search it, so matches light up in place.",
    "builds": [
      "dist/mark.min.js"
    ],
    "sandbox": [
      "Set both background and color on mark: the default yellow-on-black does not read on every theme.",
      "Call unmark() before each mark() pass so earlier highlights do not linger."
    ],
    "tested": "8"
  },
  "event-calendar": {
    "pkg": "@event-calendar/build",
    "global": "EventCalendar",
    "category": "Time",
    "summary": "Month, week, day and list calendars of events: EventCalendar.create(el, { view, events }).",
    "when": "Dates shown as a calendar: a schedule, an agenda. Suits days and weeks rather than a long history.",
    "builds": [
      "dist/event-calendar.min.js"
    ],
    "styles": [
      "dist/event-calendar.min.css"
    ],
    "sandbox": [
      "Theme it through its CSS variables on .ec (--ec-bg-color, --ec-border-color, --ec-button-*); --ec-text-color already follows currentcolor.",
      "Per-event colours are eventBackgroundColor and eventTextColor on the event object.",
      "Mount inside requestAnimationFrame: it measures the container width for the grid."
    ],
    "tested": "5"
  },
  "sketch": {
    "pkg": "@ghostmind-dev/sketch",
    "global": "Sketch",
    "category": "Drawing",
    "summary": "Hand-written explainer boards: equations, arrows, circles and brackets written stroke by stroke — one board, or a story of scenes the reader steps through.",
    "when": "Explaining an idea the way a maths video does — an equation built up with circled terms, arrows and notes, over several boards when the idea has steps. One JSON scene; no drawing code, no network, no web fonts.",
    "builds": [
      "dist/sketch.iife.js"
    ],
    "sandbox": [
      "Pin the minor, not just the major: sketch@0.6. Below 1.0 every minor may break, and the host serves whatever it stored for the pin you write.",
      "Use Sketch.board(el, scene) on one element; mount() scans for <script type=\"text/sketch\"> tags, which a block does not need.",
      "A lesson with steps is \"scenes\": [{ label, items, hold?, clear? }] instead of \"items\" — each is written, held, then wiped. Ids live inside a scene, so every scene may reuse \"eq\". In \"static\" mode the scenes stack down the page as a storyboard.",
      "\"advance\": \"click\" stops each scene when it is complete and shows a next button; the last scene never waits. The reader taps it — nothing advances an unwatched board.",
      "\"pencil\" picks the tool at the pen tip: \"pencil\", \"crayon\", \"marker\", \"chalkpen\", \"chalk\" or \"stylus\" (true means pencil); the tool takes the colour being written. \"chalkpen\" reads best on the default dark board.",
      "\"controls\": \"hover\" lays the play/scrub bar over the board's bottom edge and shows it only while pointed at (on touch, while paused) — a cleaner board. true keeps it under the board; false hides it.",
      "Pause needs 0.6 or later: in 0.5 a press on the bar also reached the board and toggled play back on.",
      "A line item is smoothed by default: pass \"smooth\": false for a triangle or any shape with corners.",
      "Scene \"sound\": true synthesises the writing sound with Web Audio (no files), but browsers only allow it after a tap on play or the board; an autoplaying board stays silent until then.",
      "Keep the default dark board (\"background\" unset) when the scene picks ink colours such as yellow or cyan; \"none\" draws on the page, where chosen colours can vanish on a light theme.",
      "Place notes inside the board width (1000 units by default): a label offset past the edge with dx is clipped, not wrapped.",
      "In a JS object the text markup takes doubled backslashes, same as JSON: \"\\\\frac{a}{b}\", \"\\\\id{c}{c^{2}}\"."
    ],
    "tested": "0.6.0"
  },
  "dagre": {
    "pkg": "dagre",
    "global": "dagre",
    "category": "Diagrams",
    "summary": "Automatic layered layout for flowcharts and architecture diagrams, groups included.",
    "when": "A diagram too dense to place by hand: many nodes, crossing links, labelled groups. dagre only computes positions and edge routes; the block draws them as SVG and can make nodes draggable.",
    "builds": [
      "dist/dagre.min.js"
    ],
    "sandbox": [
      "Pin dagre@0.8: the classic graphlib API (new dagre.graphlib.Graph({ compound: true })). The @dagrejs/dagre 1.x fork is a different package.",
      "It lays out, it does not draw: after dagre.layout(g), read g.node(id) (centre x, y, width, height) and g.edge(e).points, and draw rects and paths yourself.",
      "Measure each label before layout (a canvas 2D context with the same font) and give the node its width and height; dagre cannot see text.",
      "Groups are compound nodes: g.setNode(groupId, { label }) then g.setParent(nodeId, groupId); read the group box from g.node(groupId) like any node.",
      "Edge labels need width and height on the edge (g.setEdge(a, b, { label, width, height })) so dagre leaves room for them; draw the label at g.edge(e).x, y.",
      "A real diagram comes out wider than a note column (1500-2000 units is normal). Do not shrink it to fit — text drops to 4px. Put the svg in a scrolling box (overflow:auto, max-height) at a readable zoom, with Fit and +/- buttons, as the example does.",
      "The host frame caps every svg at max-width:100% !important. To size it past the column, set it inline: svg.style.setProperty('max-width', 'none', 'important').",
      "A node that only points INTO the flow (an attacker, a data source) ranks at the top. Add the edge reversed to dagre and reverse its points when drawing, and it sits below instead.",
      "Draggable nodes: pointer events with setPointerCapture work for mouse and touch; convert with svg.getScreenCTM().inverse(), set touch-action:none on nodes, and redraw the moved node's links as straight clipped lines."
    ],
    "tested": "0.8.5"
  },
  "rough-notation": {
    "pkg": "rough-notation",
    "global": "RoughNotation",
    "category": "Drawing",
    "summary": "Hand-drawn circles, underlines, boxes, brackets and highlights around existing text.",
    "when": "Marking up words that are already on the page — circle a term, underline a claim, bracket a paragraph. It follows the element, so the mark stays on its words when the text reflows; hand-placed roughjs shapes do not.",
    "builds": [
      "lib/rough-notation.iife.js"
    ],
    "sandbox": [
      "Call annotate / annotationGroup(...).show() inside requestAnimationFrame: it measures the text it marks.",
      "Use translucent highlight colours so the marked text stays legible on every theme.",
      "circle and box measure ONE box. An inline target that wraps spans from the start of its first line to the end of its last, so the ellipse encloses the whole paragraph instead of the phrase. Keep a circled phrase unbreakable (display: inline-block; white-space: nowrap) or give it a line of its own.",
      "underline and highlight take multiline: true and follow a wrap; circle and box have no such option — choose the type by whether the target can break.",
      "A circle is drawn OUTSIDE the text box, so leave vertical room: in a tight line-height it crosses the line above. Padding on the container, or padding: [6, 10] on the mark."
    ],
    "tested": "0"
  },
  "paper": {
    "pkg": "paper",
    "global": "paper",
    "category": "Drawing",
    "summary": "Vector geometry: paths, boolean operations, curve maths.",
    "when": "Real geometry work — intersections, offsets, path manipulation.",
    "builds": [
      "dist/paper-core.min.js"
    ],
    "sandbox": [
      "Write plain JavaScript against the paper global: PaperScript needs its parser, which calls new Function.",
      "Call paper.setup(canvas) inside requestAnimationFrame so the canvas has its CSS size, and give the drawing a solid panel."
    ],
    "tested": "0.12.18"
  },
  "leader-line": {
    "pkg": "leader-line",
    "global": "LeaderLine",
    "category": "Diagrams",
    "summary": "Draws connector lines and arrows between HTML elements.",
    "when": "Annotating a normal HTML layout with pointers, without moving to a canvas.",
    "builds": [
      "leader-line.min.js"
    ],
    "sandbox": [
      "Draw inside requestAnimationFrame: it reads each anchor's position. The SVG goes into the block's own body, so it lines up inside the frame.",
      "Pass color: getComputedStyle(document.body).color so the line follows the theme."
    ],
    "tested": "1"
  },
  "gsap": {
    "pkg": "gsap",
    "global": "gsap",
    "category": "Animation",
    "summary": "Timeline-based animation of DOM, SVG and canvas.",
    "when": "Sequenced or choreographed motion. A single transition should stay CSS.",
    "builds": [
      "dist/gsap.min.js"
    ],
    "sandbox": [
      "Nothing to measure at construction; start the timeline after one requestAnimationFrame so layout has settled.",
      "Put animated shapes on a solid panel you choose: their accent colours are picked, not inherited."
    ],
    "tested": "3"
  },
  "animejs": {
    "pkg": "animejs",
    "global": "anime",
    "category": "Animation",
    "summary": "Lightweight animation of CSS properties, SVG and objects.",
    "when": "A few coordinated animations where gsap would be overkill.",
    "builds": [
      "lib/anime.min.js"
    ],
    "sandbox": [
      "Pin @3: animejs 4 and later ship ES modules only, with no global build a block can load.",
      "The global is anime; anime.stagger() is built in."
    ],
    "tested": "3"
  },
  "canvas-confetti": {
    "pkg": "canvas-confetti",
    "global": "confetti",
    "category": "Animation",
    "summary": "Confetti bursts on a canvas.",
    "when": "A celebration beat in something interactive. Rarely the right answer twice.",
    "builds": [
      "dist/confetti.browser.js"
    ],
    "sandbox": [
      "Use confetti.create(canvas, { resize: true, useWorker: false }) on your own canvas: the default full-page overlay and its worker do not fit a sandboxed block.",
      "Fire it from a button; a burst on load plays before anyone is looking."
    ],
    "tested": "1"
  },
  "dayjs": {
    "pkg": "dayjs",
    "global": "dayjs",
    "category": "Time",
    "summary": "Date parsing, maths and formatting.",
    "when": "Axis labels, relative times or date maths inside a block.",
    "builds": [
      "dayjs.min.js"
    ],
    "sandbox": [
      "Nothing to adapt for the sandbox; use a fixed date in examples so they render the same every day."
    ],
    "tested": "1"
  },
  "marked": {
    "pkg": "marked",
    "global": "marked",
    "category": "Text & search",
    "summary": "Markdown to HTML, in the browser.",
    "when": "Rendering markdown the block itself holds as data. The note's own body is already markdown — do not use it for that.",
    "builds": [
      "lib/marked.umd.js",
      "marked.min.js",
      "lib/marked.js"
    ],
    "sandbox": [
      "Keep the markdown in a <script type=\"text/markdown\"> tag so its whitespace survives, and read it with textContent.",
      "Only render markdown you wrote with innerHTML: a block has no trustworthy sanitiser for markdown from elsewhere."
    ],
    "tested": "18"
  },
  "qrcode-generator": {
    "pkg": "qrcode-generator",
    "global": "qrcode",
    "category": "Utilities",
    "summary": "Generates a QR code as SVG or table markup.",
    "when": "Putting a link on screen for someone to scan off the page.",
    "builds": [
      "qrcode.js"
    ],
    "sandbox": [
      "Pin @1: version 2 dropped the root qrcode.js build this entry loads.",
      "createSvgTag({ scalable: true }) has no intrinsic size; give the svg an explicit width and height or it collapses.",
      "Keep dark modules on a solid white panel so the code scans on every theme."
    ],
    "tested": "1"
  },
  "papaparse": {
    "pkg": "papaparse",
    "global": "Papa",
    "category": "Tables & data",
    "summary": "CSV and TSV parsing, including messy real-world files.",
    "when": "Turning pasted CSV into rows for a table or chart. Hand-rolled split(',') breaks on quoted fields.",
    "builds": [
      "papaparse.min.js"
    ],
    "sandbox": [
      "Keep CSV in `<script type=\"text/csv\">` and parse `textContent.trim()` with `{ header: true, dynamicTyping: true, skipEmptyLines: true }`.",
      "Escape parsed text before writing it as HTML — CSV is data the block did not author."
    ],
    "tested": "5"
  },
  "js-yaml": {
    "pkg": "js-yaml",
    "global": "jsyaml",
    "category": "Tables & data",
    "summary": "YAML parsing and serialisation.",
    "when": "A block whose data is YAML — config, front matter, a spec pasted into the note.",
    "builds": [
      "dist/js-yaml.min.js"
    ],
    "sandbox": [
      "Keep YAML in `<script type=\"text/yaml\">`: it is not executed, and its indentation survives. Read it with `textContent`.",
      "`jsyaml.load` is safe by default in v4 (no custom JS types); still escape parsed values before writing them as HTML."
    ],
    "tested": "4"
  },
  "simple-statistics": {
    "pkg": "simple-statistics",
    "global": "ss",
    "category": "Tables & data",
    "summary": "Descriptive statistics, regression, correlation, distributions.",
    "when": "A trend line, an r value, quartiles — numbers you would otherwise get subtly wrong.",
    "builds": [
      "dist/simple-statistics.min.js"
    ],
    "sandbox": [
      "Pure maths, no DOM: pair it with an SVG drawn in a `viewBox` for the chart, and label with `fill: currentColor` so the text follows the theme."
    ],
    "tested": "7"
  },
  "fuse.js": {
    "pkg": "fuse.js",
    "global": "Fuse",
    "category": "Text & search",
    "summary": "Fuzzy search over a list of objects, with scoring.",
    "when": "A search box in a block that should tolerate typos. Exact substring matching does not need this.",
    "builds": [
      "dist/fuse.min.js"
    ],
    "sandbox": [
      "includeScore gives 0 to 1 with lower meaning closer; invert it before showing a match percentage.",
      "Style the search input yourself (color, background, border): inputs do not inherit the block text colour."
    ],
    "tested": "7"
  },
  "lodash": {
    "pkg": "lodash",
    "global": "_",
    "category": "Utilities",
    "summary": "Utilities for grouping, sorting, chunking and deep access.",
    "when": "Shaping awkward nested data. Modern array methods cover the simple cases without it.",
    "builds": [
      "lodash.min.js"
    ],
    "sandbox": [
      "Never use _.template: it compiles with Function, which the sandbox CSP blocks. groupBy, orderBy, map and the rest are safe."
    ],
    "tested": "4"
  },
  "luxon": {
    "pkg": "luxon",
    "global": "luxon",
    "category": "Time",
    "summary": "Dates and times with real time-zone handling.",
    "when": "Anything involving zones, durations or calendar maths. For plain formatting, dayjs is smaller.",
    "builds": [
      "build/global/luxon.min.js"
    ],
    "sandbox": [
      "Build dates with DateTime.fromISO and an explicit zone; setZone works for any IANA zone with no extra data file."
    ],
    "tested": "3"
  },
  "diff": {
    "pkg": "diff",
    "global": "Diff",
    "category": "Text & search",
    "summary": "Text diffing by character, word or line.",
    "when": "Showing what changed between two versions of something inside a note.",
    "builds": [
      "dist/diff.min.js"
    ],
    "sandbox": [
      "Tint added and removed spans with a stronger, solid-looking fill (around 30% alpha) so the change reads on every theme.",
      "Diff.diffWords returns { value, added, removed } parts; escape value before inserting it as HTML."
    ],
    "tested": "9"
  },
  "highlight.js": {
    "pkg": "@highlightjs/cdn-assets",
    "global": "hljs",
    "category": "Text & search",
    "summary": "Syntax highlighting for code, 190+ languages.",
    "when": "Showing code *inside* a block. A plain fenced code block in the note is already highlighted — do not use this for that. Ships a dark theme; restyle .hljs if the block is light.",
    "builds": [
      "highlight.min.js"
    ],
    "styles": [
      "styles/github-dark.min.css"
    ],
    "sandbox": [
      "Its github-dark stylesheet picks token colours, so give the code its own solid dark ground (#0d1117) instead of restyling tokens per theme.",
      "Call hljs.highlightElement() on the mounted <code class=\"language-…\"> node; a note's own fenced code is already highlighted server-side."
    ],
    "tested": "11"
  },
  "matter-js": {
    "pkg": "matter-js",
    "global": "Matter",
    "category": "Drawing",
    "summary": "2D rigid-body physics: gravity, collisions, constraints.",
    "when": "Something that should fall, bounce or swing. Explaining a physical idea beats decorating with it.",
    "builds": [
      "build/matter.min.js"
    ],
    "sandbox": [
      "Size Render.create from the container inside requestAnimationFrame and pass pixelRatio: devicePixelRatio.",
      "Give bodies explicit render.fillStyle and strokeStyle; the defaults are close to invisible on a dark panel.",
      "Stop the Runner on visibilitychange; it keeps simulating off-screen."
    ],
    "tested": "0"
  },
  "pixi.js": {
    "pkg": "pixi.js",
    "global": "PIXI",
    "category": "Drawing",
    "summary": "GPU-accelerated 2D rendering for thousands of sprites.",
    "when": "Far more moving objects than canvas 2D can keep smooth. It is 800KB, so not for a handful of shapes.",
    "builds": [
      "dist/pixi.min.js"
    ],
    "sandbox": [
      "Pin @4: pixi.js 5 and later generate code with new Function on the WebGL path, which the sandbox CSP blocks.",
      "Version 4 takes new PIXI.Application(width, height, options) and transparent: true, not the newer single options object.",
      "Stop app.ticker on visibilitychange: version 4 keeps rendering off-screen."
    ],
    "tested": "4"
  },
  "lottie-web": {
    "pkg": "lottie-web",
    "global": "lottie",
    "category": "Animation",
    "summary": "Plays After Effects vector animations from JSON.",
    "when": "A designed animation you already have as Lottie JSON, inlined into the block.",
    "builds": [
      "build/player/lottie.min.js"
    ],
    "sandbox": [
      "Inline the animation JSON as animationData: loading a path or URL needs the network.",
      "Keep After Effects expressions out of the JSON: evaluating one calls eval, which the sandbox blocks.",
      "Give the container an explicit CSS height and call loadAnimation inside requestAnimationFrame."
    ],
    "tested": "5"
  },
  "chroma-js": {
    "pkg": "chroma-js",
    "global": "chroma",
    "category": "Utilities",
    "summary": "Colour maths: scales, interpolation, contrast, conversion.",
    "when": "Building a colour ramp for a heatmap or checking contrast. Note v3 ships no browser build — use v2.",
    "builds": [
      "chroma.min.js"
    ],
    "sandbox": [
      "Label a swatch with chroma.contrast() or luminance() to pick black or white text; a fixed text colour fails on half the scale.",
      "Swatches choose their own colours, so they are their own ground; nothing else needs to follow the theme."
    ],
    "tested": "2"
  },
  "sortablejs": {
    "pkg": "sortablejs",
    "global": "Sortable",
    "category": "Interface",
    "summary": "Drag-and-drop reordering of lists and grids.",
    "when": "A block where the reader arranges things — ranking, planning, sorting into columns.",
    "builds": [
      "Sortable.min.js"
    ],
    "sandbox": [
      "Put touch-action: none on the drag handle, not the whole row, so the rest of the list still scrolls the note on a phone."
    ],
    "tested": "1"
  },
  "interactjs": {
    "pkg": "interactjs",
    "global": "interact",
    "category": "Interface",
    "summary": "Drag, resize, pinch and snap for any element.",
    "when": "Free positioning or resizing. For simple list reordering, sortablejs is the smaller answer.",
    "builds": [
      "dist/interact.min.js"
    ],
    "sandbox": [
      "Set touch-action: none on the draggable and its container, or the note scrolls under a finger mid-drag.",
      "Use the restrictRect and restrictSize modifiers so a dragged or resized box stays inside its stage."
    ],
    "tested": "1"
  },
  "swiper": {
    "pkg": "swiper",
    "global": "Swiper",
    "category": "Interface",
    "summary": "Touch carousels and slide decks.",
    "when": "A slide deck or a swipeable gallery inside a note — and it works with a thumb on iOS.",
    "builds": [
      "swiper-bundle.min.js"
    ],
    "styles": [
      "swiper-bundle.min.css"
    ],
    "sandbox": [
      "Slides cannot load remote images; use solid panels, inline SVG or data: URLs.",
      "Its navigation arrows are inline SVG with fill currentColor: set color on .swiper-button-next and -prev, and background on .swiper-pagination-bullet.",
      "Keep it horizontal so a swipe never fights the note scrolling vertically."
    ],
    "tested": "14"
  },
  "nouislider": {
    "pkg": "nouislider",
    "global": "noUiSlider",
    "category": "Interface",
    "summary": "Range sliders, including two-handle ranges.",
    "when": "Letting the reader vary an input and watch the block respond — the difference between a figure and a model.",
    "builds": [
      "dist/nouislider.min.js"
    ],
    "styles": [
      "dist/nouislider.min.css"
    ],
    "sandbox": [
      "Its stylesheet draws a white track and handles: restyle .noUi-target, .noUi-connect and .noUi-handle with translucent greys and an explicit fill.",
      "Handles stick out about 17px past each end: leave that much side margin inside the block or they clip at the frame."
    ],
    "tested": "15"
  },
  "tone": {
    "pkg": "tone",
    "global": "Tone",
    "category": "Audio",
    "summary": "Web Audio framework: synths, effects, scheduling.",
    "when": "Making sound in a note — a scale, a rhythm, an audible demonstration. Never start audio without the reader asking for it.",
    "builds": [
      "build/Tone.js"
    ],
    "sandbox": [
      "Start audio from a button that calls await Tone.start(): browsers only allow sound after a tap.",
      "Use synths only; sample files would need the network.",
      "A keyboard or single-voice instrument wants Tone.Synth, not PolySynth: PolySynth keeps every overlapping note sounding, so fast playing stacks into a chord.",
      "For playable keys, call triggerAttack on pointerdown and triggerRelease on pointerup and pointerleave. triggerAttackRelease with a fixed duration cuts a held key short and drags out a tapped one.",
      "Keep a Tone.Waveform or Analyser in the same block as the synth it listens to. Another block cannot reach this block's synth."
    ],
    "tested": "15"
  },
  "abcjs": {
    "pkg": "abcjs",
    "global": "ABCJS",
    "category": "Audio",
    "summary": "Sheet music from ABC notation text: staves, notes, chords, lyrics.",
    "when": "Showing music as notation — a tune, a scale, an exercise — written as a few lines of ABC text instead of a picture of a score.",
    "builds": [
      "dist/abcjs-basic-min.js",
      "dist/abcjs-basic.js"
    ],
    "sandbox": [
      "Pass foregroundColor: 'currentColor' so the score follows the theme's text colour, and responsive: 'resize' so it scales to the block width.",
      "Rendering only: ABCJS.synth playback loads soundfont samples from the network, which the sandbox blocks. For sound, play the notes with tone in the same block."
    ],
    "tested": "6.7.0"
  },
  "tonal": {
    "pkg": "tonal",
    "global": "Tonal",
    "category": "Audio",
    "summary": "Music theory: notes, intervals, scales, chords and keys.",
    "when": "Explaining how music is built — the notes of a scale, the chords in a key, the interval between two notes — computed rather than typed out by hand. Pairs with abcjs to show it and tone to hear it.",
    "builds": [
      "browser/tonal.min.js"
    ],
    "sandbox": [
      "Pure computation with no DOM of its own: render its answers (Tonal.Key.majorKey, Tonal.Chord.get, Tonal.Interval.distance) as your own markup."
    ],
    "tested": "6.4.3"
  },
  "jsxgraph": {
    "pkg": "jsxgraph",
    "global": "JXG",
    "category": "Maths",
    "summary": "Interactive geometry and function plots with sliders and draggable points.",
    "when": "Letting the reader move a slider or drag a point and watch the maths respond — a parameter changing a curve, a tangent following a point, a theorem holding as a triangle moves.",
    "builds": [
      "distrib/jsxgraphcore.js"
    ],
    "styles": [
      "distrib/jsxgraph.css"
    ],
    "sandbox": [
      "Plot a function as board.create('curve', [t => t, t => f(t), min, max]). A 'functiongraph' plots no points in the sandbox.",
      "Pass JavaScript functions, never string terms like 'a*x^2': strings go through JessieCode, which needs eval.",
      "Axes, ticks and labels are drawn in fixed dark colours: give the board a light ground of its own.",
      "Give the board div an explicit height and touch-action: none, so dragging a point on a phone does not scroll the note."
    ],
    "tested": "1.13.3"
  },
  "smiles-drawer": {
    "pkg": "smiles-drawer",
    "global": "SmilesDrawer",
    "category": "Diagrams",
    "summary": "Chemical structure diagrams from SMILES strings.",
    "when": "Drawing a molecule — caffeine, aspirin, a reaction product — from its SMILES string, which markup cannot lay out.",
    "builds": [
      "dist/smiles-drawer.min.js"
    ],
    "sandbox": [
      "Draw with SmilesDrawer.SvgDrawer into an <svg>. The canvas Drawer renders through a temporary SVG it appends to the body, and on the web the block stays blank.",
      "Redraw when the block's width changes and set preserveAspectRatio to 'xMidYMid meet' on the svg; a drawing made at one width stretches in the expanded view.",
      "Atom colours carry meaning: give each molecule a solid ground of your own and pass the matching theme ('dark' or 'light') to draw()."
    ],
    "tested": "2.4.1"
  },
  "zdog": {
    "pkg": "zdog",
    "global": "Zdog",
    "category": "Drawing",
    "summary": "Flat, rounded pseudo-3D illustrations on canvas or SVG, draggable to rotate.",
    "when": "A small 3D-looking object the reader can spin — an icon, a model, a playful illustration — without a full 3D engine.",
    "builds": [
      "dist/zdog.dist.min.js",
      "dist/zdog.dist.js"
    ],
    "sandbox": [
      "Set the canvas width and height attributes and the same size in CSS: Zdog draws at the attribute size, and a CSS-only size stretches it.",
      "Put touch-action: none on the canvas so dragRotate spins the model on a phone instead of scrolling the note.",
      "Its colours are chosen, not inherited: give the illustration a solid ground of its own."
    ],
    "tested": "1.1.3"
  }
};
