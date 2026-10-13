/** Blocks to start from on the try page. Each is written for the slot it names. */
export const EXAMPLES: { name: string; slot: string; source: string }[] = [
  {
    name: "A page: three.js, any version",
    slot: "page",
    source: `<!-- block:use three@0.186, three@0.186/addons/controls/OrbitControls.js -->
<style>
  html, body { height: 100%; }
  body { background: #0e0f13; color: #e8e6e1; overflow: hidden; }
  #stage { position: absolute; inset: 0; }
  p { position: absolute; left: 20px; bottom: 16px; margin: 0; font: 13px ui-monospace, monospace; opacity: .6; }
</style>
<div id="stage"></div>
<p>three r<span id="rev"></span> — drag to turn</p>
<script>
  // Any package on npm arrives as a global: THREE, and its add-ons on it.
  const stage = document.getElementById("stage");
  document.getElementById("rev").textContent = THREE.REVISION;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(3, 2.2, 4);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2.2));
  const light = new THREE.DirectionalLight(0xffd9b0, 2.5);
  light.position.set(4, 6, 3);
  scene.add(light);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.34, 220, 32), new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.35, metalness: 0.2 }));
  scene.add(knot);
  const size = () => {
    const { clientWidth: w, clientHeight: h } = stage;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(size).observe(stage);
  size();
  renderer.setAnimationLoop(() => {
    knot.rotation.y += 0.004;
    controls.update();
    renderer.render(scene, camera);
  });
</script>`,
  },
  {
    name: "A note: a chart between two paragraphs",
    slot: "note",
    source: `<!-- block:use chart.js@4 -->
<style>
  .box { position: relative; height: 260px; }
  h3 { margin: 0 0 10px; font: 600 15px ui-sans-serif, system-ui; }
</style>
<h3>Blocks made, by week</h3>
<div class="box"><canvas id="chart"></canvas></div>
<script>
  // The ground is the app's, light or dark: take the ink from it instead of assuming one.
  const ink = getComputedStyle(document.body).color;
  Chart.defaults.color = ink;
  Chart.defaults.borderColor = "rgba(127,127,127,.25)";
  new Chart(document.getElementById("chart"), {
    type: "bar",
    data: { labels: ["W36", "W37", "W38", "W39", "W40", "W41"], datasets: [{ label: "blocks", data: [3, 7, 4, 11, 9, 14], backgroundColor: "#c2410c", borderRadius: 4 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } } },
  });
</script>`,
  },
  {
    name: "A panel: the details of a place",
    slot: "panel",
    source: `<style>
  body { padding: 16px; }
  h2 { margin: 0; font: 600 19px/1.2 ui-serif, Georgia, serif; }
  .where { margin: 4px 0 14px; opacity: .65; font-size: 13px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0 0 14px; font-size: 14px; }
  dt { opacity: .6; } dd { margin: 0; text-align: right; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tags span { padding: 2px 9px; border-radius: 99px; font-size: 12px; border: 1px solid rgba(127,127,127,.35); }
</style>
<h2>Café Olimpico</h2>
<p class="where">124 rue Saint-Viateur O, Montréal</p>
<dl><dt>Rating</dt><dd>4.6</dd><dt>Open</dt><dd>until 23:00</dd><dt>Last visit</dt><dd>3 weeks ago</dd></dl>
<div class="tags"><span>coffee</span><span>terrace</span><span>cash only</span></div>`,
  },
  {
    name: "A hover: the box under the mouse",
    slot: "hover",
    source: `<style>
  .card { width: 220px; padding: 10px 12px; border-radius: 10px; background: #1b1c20; color: #f2efe9; box-shadow: 0 6px 22px rgba(0,0,0,.28); font: 13px/1.4 ui-sans-serif, system-ui; }
  b { display: block; font-size: 14px; }
  span { opacity: .7; }
</style>
<div class="card"><b>Café Olimpico</b><span>coffee · open until 23:00</span></div>`,
  },
  {
    name: "A card: a cover in a list",
    slot: "card",
    source: `<style>
  html, body { height: 100%; }
  body { display: grid; place-items: end start; padding: 18px; background: linear-gradient(140deg, #c2410c, #7c2d12); color: #fff7ed; }
  h2 { margin: 0; font: 600 24px/1.1 ui-serif, Georgia, serif; }
  p { margin: 4px 0 0; font: 12px ui-monospace, monospace; opacity: .8; }
</style>
<div><h2>Lights</h2><p>6 lamps · 2 scenes</p></div>`,
  },
];
