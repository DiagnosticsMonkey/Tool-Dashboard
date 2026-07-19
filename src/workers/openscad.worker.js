// OpenSCAD WASM render worker.
// Runs the (heavy) OpenSCAD compilation off the main thread.
//
// In:  { id, source, args? }         OpenSCAD script text + extra CLI args
// Out: { id, ok, stl?, log, timeMs } stl is a transferable ArrayBuffer (STL data)

import { createOpenSCAD } from "openscad-wasm";

const OUTPUT = "/output.stl";

// NOTE: instances are single-use - a second callMain on the same instance
// produces no output (the runtime winds down after the first run), so a
// fresh instance is created per attempt. The wasm itself stays cached by
// the module, so repeat renders are still much faster than the first.
let logSink = [];
const capture = (t) => logSink.push(String(t));

async function attempt(source, args) {
  const os = await createOpenSCAD({ print: capture, printErr: capture });
  const instance = os.getInstance();
  instance.FS.writeFile("/input.scad", source);
  try {
    instance.callMain(["/input.scad", "-o", OUTPUT, ...args]);
  } catch (e) {
    // Non-zero exit - details are already in the log
  }
  try {
    return instance.FS.readFile(OUTPUT); // Uint8Array
  } catch {
    return null;
  }
}

async function render(source, extraArgs = []) {
  logSink = [];
  // Try the fast manifold backend + binary STL first; fall back to the
  // plain invocation for builds/scripts that don't support those flags.
  let stl = await attempt(source, [
    "--enable=manifold",
    "--export-format=binstl",
    ...extraArgs,
  ]);
  if (!stl) {
    logSink.push("--- retrying with default backend ---");
    stl = await attempt(source, extraArgs);
  }
  return { stl, log: logSink };
}

self.onmessage = async (e) => {
  const { id, source, args } = e.data;
  const started = performance.now();
  try {
    const { stl, log } = await render(source, args);
    const timeMs = Math.round(performance.now() - started);
    if (stl) {
      const buffer = stl.buffer.slice(
        stl.byteOffset,
        stl.byteOffset + stl.byteLength
      );
      self.postMessage({ id, ok: true, stl: buffer, log, timeMs }, [buffer]);
    } else {
      self.postMessage({ id, ok: false, log, timeMs });
    }
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      log: [...logSink, `Worker error: ${error.message}`],
      timeMs: Math.round(performance.now() - started),
    });
  }
};
