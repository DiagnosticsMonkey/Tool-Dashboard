import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  Typography,
  Card,
  CardBody,
  Button,
  IconButton,
  Input,
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
  CloudArrowDownIcon,
} from "@heroicons/react/24/solid";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ---------------------------------------------------------------------------
// Example scripts
// ---------------------------------------------------------------------------

const EXAMPLES = {
  demo: {
    label: "Rounded plate",
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
// OpenSCAD Customiser parameter parsing
// ---------------------------------------------------------------------------

function parseDefaultValue(raw) {
  const t = raw.trim();
  if (/^".*"$/.test(t)) return { type: "string", value: t.slice(1, -1) };
  if (t === "true" || t === "false")
    return { type: "bool", value: t === "true" };
  if (/^[-+]?[0-9.]+(e[-+]?\d+)?$/i.test(t) && !isNaN(Number(t)))
    return { type: "number", value: Number(t) };
  return null;
}

function parseAnnotation(ann) {
  if (!ann) return null;
  const m = ann.trim().match(/^\[(.*)\]$/s);
  if (!m) return null;
  const body = m[1].trim();

  if (body.includes(",")) {
    // Dropdown: [a, b, c] or [value:label, ...]
    const options = body.split(",").map((s) => {
      const t = s.trim();
      const i = t.indexOf(":");
      return i > -1
        ? { value: t.slice(0, i).trim(), label: t.slice(i + 1).trim() }
        : { value: t, label: t };
    });
    return { kind: "enum", options };
  }

  const nums = body.split(":").map((s) => Number(s.trim()));
  if (nums.length && nums.every((n) => !isNaN(n))) {
    if (nums.length === 1) return { kind: "range", min: 0, max: nums[0] };
    if (nums.length === 2)
      return { kind: "range", min: nums[0], max: nums[1] };
    return { kind: "range", min: nums[0], step: nums[1], max: nums[2] };
  }
  return null;
}

function parseCustomiserParams(code) {
  const lines = code.split(/\r?\n/);
  const groups = [];
  let current = { name: "Parameters", params: [] };
  let pendingDesc = null;

  const pushGroup = () => {
    if (current.params.length && !/^hidden$/i.test(current.name)) {
      groups.push(current);
    }
  };

  for (const line of lines) {
    if (/^\s*(module|function)\s/.test(line)) break;

    const gm = line.match(/^\s*\/\*\s*\[(.+?)\]\s*\*\/\s*$/);
    if (gm) {
      pushGroup();
      current = { name: gm[1].trim(), params: [] };
      pendingDesc = null;
      continue;
    }

    const cm = line.match(/^\s*\/\/\s?(.*)$/);
    if (cm) {
      pendingDesc = cm[1].trim() || null;
      continue;
    }

    const am = line.match(
      /^\s*([A-Za-z_$][A-Za-z0-9_]*)\s*=\s*([^;]+);\s*(?:\/\/\s*(.*))?$/
    );
    if (am) {
      const [, name, rawVal, annotation] = am;
      const def = parseDefaultValue(rawVal);
      if (def) {
        current.params.push({
          name,
          desc: pendingDesc,
          type: def.type,
          defaultValue: def.value,
          annotation: parseAnnotation(annotation),
        });
      }
      pendingDesc = null;
      continue;
    }

    if (line.trim() !== "") pendingDesc = null;
  }
  pushGroup();
  return groups;
}

// Format a value as a -D override argument
function toDefineArg(param, value) {
  if (param.type === "string") return `${param.name}=${JSON.stringify(String(value))}`;
  if (param.type === "bool") return `${param.name}=${value ? "true" : "false"}`;
  return `${param.name}=${Number(value)}`;
}

function ParamControl({ param, value, onChange }) {
  const current = value ?? param.defaultValue;
  const ann = param.annotation;
  const modified = value !== undefined && value !== param.defaultValue;

  const label = (
    <div className="flex items-center justify-between">
      <Typography
        variant="small"
        color={modified ? "blue" : "blue-gray"}
        className="font-medium"
      >
        {param.desc || param.name}
      </Typography>
      {param.desc && (
        <Typography variant="small" className="font-mono text-xs text-blue-gray-300">
          {param.name}
        </Typography>
      )}
    </div>
  );

  if (ann?.kind === "enum") {
    return (
      <div className="flex flex-col gap-1">
        {label}
        <Select
          value={String(current)}
          onChange={(v) =>
            onChange(param.type === "number" ? Number(v) : v)
          }
          containerProps={{ className: "!min-w-0" }}
        >
          {ann.options.map((o) => (
            <Option key={o.value} value={o.value}>
              {o.label}
            </Option>
          ))}
        </Select>
      </div>
    );
  }

  if (param.type === "bool") {
    return (
      <div className="flex items-center justify-between gap-2">
        {label}
        <Switch
          checked={Boolean(current)}
          onChange={(e) => onChange(e.target.checked)}
          crossOrigin=""
        />
      </div>
    );
  }

  if (ann?.kind === "range" && param.type === "number") {
    const step =
      ann.step ??
      (Number.isInteger(ann.min) &&
      Number.isInteger(ann.max) &&
      Number.isInteger(param.defaultValue)
        ? 1
        : 0.1);
    return (
      <div className="flex flex-col gap-1">
        {label}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={ann.min}
            max={ann.max}
            step={step}
            value={current}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-blue-gray-100 accent-blue-500"
          />
          <Typography
            variant="small"
            color="blue-gray"
            className="w-14 text-right font-mono font-bold"
          >
            {current}
          </Typography>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {label}
      <Input
        type={param.type === "number" ? "number" : "text"}
        value={String(current)}
        onChange={(e) =>
          onChange(
            param.type === "number"
              ? Number(e.target.value)
              : e.target.value
          )
        }
        crossOrigin=""
        containerProps={{ className: "!min-w-0" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remote script loading
// ---------------------------------------------------------------------------

// Convert common GitHub URL shapes to raw content URLs (CORS-friendly)
function toRawUrl(url) {
  let m = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/
  );
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  // Gist file links
  m = url.match(/^https?:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)/);
  if (m) return `https://gist.githubusercontent.com/${m[1]}/${m[2]}/raw`;
  return url;
}

const INCLUDE_RE = /(?:include|use)\s*<([^>]+)>/g;
const MAX_DEP_FILES = 25;

// Fetch a .scad file and (best-effort) its include/use dependencies,
// resolved relative to the main file's location.
async function fetchScadWithIncludes(url) {
  const rawUrl = toRawUrl(url.trim());
  const base = rawUrl.slice(0, rawUrl.lastIndexOf("/") + 1);
  const notes = [];

  const res = await fetch(rawUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${rawUrl}`);
  const source = await res.text();

  const files = {};
  const seen = new Set();
  const queue = [];
  const enqueue = (text) => {
    for (const match of text.matchAll(INCLUDE_RE)) {
      const dep = match[1].trim();
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  };
  enqueue(source);

  while (queue.length && Object.keys(files).length < MAX_DEP_FILES) {
    const dep = queue.shift();
    try {
      // Resolve relative paths (handles ../ etc.) against the main file
      const depUrl = new URL(dep, base).href;
      const depRes = await fetch(depUrl);
      if (!depRes.ok) throw new Error(`HTTP ${depRes.status}`);
      const content = await depRes.text();
      files[dep] = content;
      enqueue(content); // nested includes
      notes.push(`Loaded dependency: ${dep}`);
    } catch (e) {
      notes.push(
        `Could not load <${dep}> (${e.message}) — if it's a system library it won't resolve in the browser.`
      );
    }
  }

  return { source, files, notes, rawUrl };
}

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
  const [sourceUrl, setSourceUrl] = useState("");
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [libFiles, setLibFiles] = useState({});
  const [paramValues, setParamValues] = useState({});

  const workerRef = useRef(null);
  const renderIdRef = useRef(0);

  // Customiser parameters exposed by the current script
  const paramGroups = useMemo(() => parseCustomiserParams(code), [code]);
  const allParams = useMemo(
    () => paramGroups.flatMap((g) => g.params),
    [paramGroups]
  );
  const modifiedCount = allParams.filter(
    (p) =>
      paramValues[p.name] !== undefined &&
      paramValues[p.name] !== p.defaultValue
  ).length;

  const handleLoadUrl = useCallback(async () => {
    if (!sourceUrl.trim()) return;
    setLoadingUrl(true);
    setLog([]);
    try {
      const { source, files, notes, rawUrl } =
        await fetchScadWithIncludes(sourceUrl);
      setCode(source);
      setLibFiles(files);
      setParamValues({});
      setLog([
        `Loaded ${rawUrl}`,
        ...notes,
        `Ready - hit Render.`,
      ]);
    } catch (e) {
      setLog([
        `Failed to load: ${e.message}`,
        "Check the URL points at a raw file or a GitHub blob page, and the repo is public.",
      ]);
    } finally {
      setLoadingUrl(false);
    }
  }, [sourceUrl]);

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
    // Apply customiser overrides as -D flags (they take precedence over
    // the assignments in the script)
    const defines = allParams
      .filter(
        (p) =>
          paramValues[p.name] !== undefined &&
          paramValues[p.name] !== p.defaultValue
      )
      .flatMap((p) => ["-D", toDefineArg(p, paramValues[p.name])]);

    workerRef.current.postMessage({
      id: renderIdRef.current,
      source: code,
      files: libFiles,
      args: defines,
    });
  }, [code, libFiles, allParams, paramValues, spawnWorker]);

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
        <div className="flex flex-col gap-6">
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
                      setLibFiles({});
                      setParamValues({});
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
            {/* Load from URL */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  label="Load .scad from URL (GitHub blob/raw link)"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loadingUrl) handleLoadUrl();
                  }}
                  crossOrigin=""
                />
              </div>
              <Button
                size="sm"
                variant="outlined"
                color="blue-gray"
                className="flex items-center gap-2"
                onClick={handleLoadUrl}
                disabled={loadingUrl || !sourceUrl.trim()}
              >
                {loadingUrl ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudArrowDownIcon className="h-4 w-4" />
                )}
                Load
              </Button>
            </div>
            {Object.keys(libFiles).length > 0 && (
              <Typography variant="small" className="text-blue-gray-400">
                {Object.keys(libFiles).length} dependency file
                {Object.keys(libFiles).length > 1 ? "s" : ""} loaded:{" "}
                {Object.keys(libFiles).join(", ")}
              </Typography>
            )}
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

        {/* ---------- Customiser parameters ---------- */}
        {allParams.length > 0 && (
          <Card>
            <CardBody className="flex flex-col gap-5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Typography variant="h5" color="blue-gray">
                    Parameters
                  </Typography>
                  {modifiedCount > 0 && (
                    <Chip
                      size="sm"
                      variant="ghost"
                      color="blue"
                      value={`${modifiedCount} modified`}
                    />
                  )}
                </div>
                <Button
                  size="sm"
                  variant="text"
                  color="blue-gray"
                  onClick={() => setParamValues({})}
                  disabled={modifiedCount === 0}
                >
                  Reset all
                </Button>
              </div>
              {paramGroups.map((group) => (
                <div key={group.name} className="flex flex-col gap-3">
                  <Typography
                    variant="h6"
                    color="blue-gray"
                    className="border-b border-blue-gray-50 pb-1"
                  >
                    {group.name}
                  </Typography>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {group.params.map((param) => (
                      <ParamControl
                        key={param.name}
                        param={param}
                        value={paramValues[param.name]}
                        onChange={(v) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [param.name]: v,
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
              <Typography variant="small" className="text-blue-gray-400">
                Hit 'Render' after dialing in params...
              </Typography>
            </CardBody>
          </Card>
        )}
        </div>

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
