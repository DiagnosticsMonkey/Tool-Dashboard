import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  Typography,
  Card,
  CardBody,
  Button,
  IconButton,
  Select,
  Option,
  Chip,
  Tooltip,
} from "@material-tailwind/react";
import {
  PlayIcon,
  StopIcon,
  ArrowDownTrayIcon,
  CubeIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ---------------------------------------------------------------------------
// Example scripts
// ---------------------------------------------------------------------------

const EXAMPLES = {
  demo: {
    label: "Demo — rounded plate",
    code: `// Rounded mounting plate
$fn = 64;

plate_w = 60;
plate_d = 40;
plate_h = 5;
corner_r = 6;
hole_d = 4;

difference() {
  // Rounded plate
  hull()
    for (x = [corner_r, plate_w - corner_r],
         y = [corner_r, plate_d - corner_r])
      translate([x, y, 0])
        cylinder(r = corner_r, h = plate_h);

  // Corner holes
  for (x = [corner_r, plate_w - corner_r],
       y = [corner_r, plate_d - corner_r])
    translate([x, y, -1])
      cylinder(d = hole_d, h = plate_h + 2);
}
`,
  },
  cube: {
    label: "Minimal cube",
    code: `cube(10);\n`,
  },
  gear: {
    label: "Parametric knob",
    code: `// Knurled knob
$fn = 96;

knob_d = 30;
knob_h = 12;
teeth = 20;

difference() {
  union() {
    cylinder(d = knob_d, h = knob_h);
    for (i = [0 : teeth - 1])
      rotate([0, 0, i * 360 / teeth])
        translate([knob_d / 2, 0, 0])
          cylinder(d = 3, h = knob_h);
  }
  // Shaft with flat
  translate([0, 0, -1])
    difference() {
      cylinder(d = 6, h = knob_h + 2);
      translate([2.2, -5, -1]) cube([10, 10, knob_h + 4]);
    }
}
`,
  },
};

// ---------------------------------------------------------------------------
// Three.js STL viewer
// ---------------------------------------------------------------------------

function StlViewer({ stl }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(80, -80, 60);
    camera.up.set(0, 0, 1); // Z-up like OpenSCAD

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(100, -100, 150);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-100, 100, -50);
    scene.add(fill);

    const grid = new THREE.GridHelper(200, 20, 0xbfc7d1, 0xe2e8f0);
    grid.rotation.x = Math.PI / 2; // XY plane, Z-up
    scene.add(grid);
    scene.add(new THREE.AxesHelper(20));

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let running = true;
    const animate = () => {
      if (!running) return;
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { scene, camera, controls, renderer, mesh: null };

    return () => {
      running = false;
      observer.disconnect();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // Load / replace model when STL changes
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    if (ctx.mesh) {
      ctx.scene.remove(ctx.mesh);
      ctx.mesh.geometry.dispose();
      ctx.mesh.material.dispose();
      ctx.mesh = null;
    }
    if (!stl) return;

    const geometry = new STLLoader().parse(stl);
    geometry.computeVertexNormals();
    geometry.center();

    const material = new THREE.MeshStandardMaterial({
      color: 0xf9d72c, // OpenSCAD yellow
      metalness: 0.1,
      roughness: 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);

    // Sit the model on the grid
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    mesh.position.z = -bb.min.z;
    ctx.scene.add(mesh);
    ctx.mesh = mesh;

    // Fit camera to model
    const size = new THREE.Vector3();
    bb.getSize(size);
    const dist = Math.max(size.x, size.y, size.z) * 2.2 + 10;
    ctx.camera.position.set(dist, -dist, dist * 0.75);
    ctx.controls.target.set(0, 0, size.z / 2);
    ctx.controls.update();
  }, [stl]);

  return <div ref={mountRef} className="h-full w-full" />;
}

// ---------------------------------------------------------------------------
// Renderer page
// ---------------------------------------------------------------------------

export function Renderer() {
  const [code, setCode] = useState(EXAMPLES.demo.code);
  const [stl, setStl] = useState(null);
  const [log, setLog] = useState([]);
  const [rendering, setRendering] = useState(false);
  const [renderTime, setRenderTime] = useState(null);
  const [engineReady, setEngineReady] = useState(false);

  const workerRef = useRef(null);
  const renderIdRef = useRef(0);

  const spawnWorker = useCallback(() => {
    const worker = new Worker(
      new URL("../../workers/openscad.worker.js", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (e) => {
      const { id, ok, stl: stlBuffer, log: renderLog, timeMs } = e.data;
      if (id !== renderIdRef.current) return; // stale render
      setEngineReady(true);
      setRendering(false);
      setRenderTime(timeMs);
      setLog(renderLog || []);
      if (ok) setStl(stlBuffer);
    };
    worker.onerror = (e) => {
      setRendering(false);
      setLog((l) => [...l, `Worker failed: ${e.message}`]);
    };
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  const handleRender = useCallback(() => {
    if (!workerRef.current) spawnWorker();
    renderIdRef.current += 1;
    setRendering(true);
    setLog([]);
    workerRef.current.postMessage({
      id: renderIdRef.current,
      source: code,
    });
  }, [code, spawnWorker]);

  const handleCancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRendering(false);
    setLog((l) => [...l, "Render cancelled."]);
  }, []);

  const handleDownload = useCallback(() => {
    if (!stl) return;
    const blob = new Blob([stl], { type: "model/stl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "model.stl";
    a.click();
    URL.revokeObjectURL(url);
  }, [stl]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!rendering) handleRender();
    }
    // Keep Tab inside the editor
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: s, selectionEnd: end } = el;
      setCode(code.slice(0, s) + "  " + code.slice(end));
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + 2;
      });
    }
  };

  const hasErrors = log.some((l) => /^ERROR/i.test(l));

  return (
    <div className="mx-auto my-8 flex max-w-screen-2xl flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* ---------- Editor ---------- */}
        <Card>
          <CardBody className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Typography variant="h5" color="blue-gray">
                Script
              </Typography>
              <div className="flex items-center gap-3">
                <div className="w-52">
                  <Select
                    label="Example"
                    value="demo"
                    onChange={(v) => {
                      setCode(EXAMPLES[v].code);
                    }}
                  >
                    {Object.entries(EXAMPLES).map(([key, ex]) => (
                      <Option key={key} value={key}>
                        {ex.label}
                      </Option>
                    ))}
                  </Select>
                </div>
                {rendering ? (
                  <Button
                    size="sm"
                    color="red"
                    className="flex items-center gap-2"
                    onClick={handleCancel}
                  >
                    <StopIcon className="h-4 w-4" /> Cancel
                  </Button>
                ) : (
                  <Tooltip content="Ctrl+Enter">
                    <Button
                      size="sm"
                      color="green"
                      className="flex items-center gap-2"
                      onClick={handleRender}
                    >
                      <PlayIcon className="h-4 w-4" /> Render
                    </Button>
                  </Tooltip>
                )}
              </div>
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="h-[28rem] w-full resize-y rounded-lg border border-blue-gray-100 bg-blue-gray-50/50 p-3 font-mono text-sm text-blue-gray-800 focus:border-blue-500 focus:outline-none"
            />
            {/* Console output */}
            <div className="max-h-40 overflow-y-auto rounded-lg bg-black p-3 font-mono text-xs">
              {rendering && (
                <div className="flex items-center gap-2 text-blue-400">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  {engineReady
                    ? "Rendering..."
                    : "Loading OpenSCAD engine (~14 MB, first run only)..."}
                </div>
              )}
              {log.map((line, i) => (
                <div
                  key={i}
                  className={
                    /^ERROR/i.test(line)
                      ? "text-red-400"
                      : /^WARNING/i.test(line)
                        ? "text-yellow-400"
                        : "text-gray-400"
                  }
                >
                  {line}
                </div>
              ))}
              {!rendering && !log.length && (
                <span className="text-gray-600">
                  Console output appears here.
                </span>
              )}
            </div>
          </CardBody>
        </Card>

        {/* ---------- Viewer ---------- */}
        <Card>
          <CardBody className="flex h-full flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Typography variant="h5" color="blue-gray">
                  Preview
                </Typography>
                {renderTime != null && (
                  <Chip
                    size="sm"
                    variant="ghost"
                    color={hasErrors ? "red" : "green"}
                    value={hasErrors ? "errors" : `${renderTime} ms`}
                  />
                )}
              </div>
              <Button
                size="sm"
                variant="outlined"
                color="blue-gray"
                className="flex items-center gap-2"
                onClick={handleDownload}
                disabled={!stl}
              >
                <ArrowDownTrayIcon className="h-4 w-4" /> Download STL
              </Button>
            </div>
            <div className="relative min-h-[28rem] flex-1 overflow-hidden rounded-lg border border-blue-gray-100">
              <StlViewer stl={stl} />
              {!stl && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-blue-gray-300">
                  <CubeIcon className="h-12 w-12" />
                  <Typography variant="small">
                    Render a script to see the model
                  </Typography>
                </div>
              )}
            </div>
            <Typography variant="small" className="text-blue-gray-400">
              Note: text() is unavailable for now (no bundled fonts).
            </Typography>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default Renderer;
