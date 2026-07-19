import React, {
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  Button,
  Switch,
  Select,
  Option,
  Chip,
  Spinner,
  Accordion,
  AccordionHeader,
  AccordionBody,
} from "@material-tailwind/react";
import {
  MagnifyingGlassIcon,
  CpuChipIcon,
  BoltIcon,
} from "@heroicons/react/24/solid";
import { WebSerialHandler } from "@/context/webserialhandler";

// ---------------------------------------------------------------------------
// DGSD discovery protocol (line-based JSON):
//
//   App → device:
//     DISCOVER              request capability descriptor
//     GET <id>              request current value of a control
//     SET <id> <value>      set a control's value
//
//   Device → app (one JSON object per line):
//     {"dgsd":1,"name":"Widget","fw":"1.0.0","controls":[
//       {"id":"led","type":"toggle","label":"Status LED"},
//       {"id":"fan","type":"slider","label":"Fan","min":0,"max":255,"step":1,"unit":"PWM"},
//       {"id":"reset","type":"button","label":"Reset counters"},
//       {"id":"mode","type":"select","label":"Mode","options":["idle","run","test"]},
//       {"id":"temp","type":"readout","label":"Temperature","unit":"°C"},
//       {"id":"status","type":"text","label":"Status"}
//     ]}
//     {"update":{"temp":23.4,"led":1}}      value updates (reply or telemetry)
// ---------------------------------------------------------------------------

const DISCOVER_TIMEOUT_MS = 3000;

function ControlCard({ control, value, onSet }) {
  const { id, type, label, min = 0, max = 100, step = 1, unit, options } =
    control;
  const throttleRef = useRef(0);

  const throttledSet = useCallback(
    (v) => {
      const now = Date.now();
      if (now - throttleRef.current > 100) {
        throttleRef.current = now;
        onSet(id, v);
      }
    },
    [id, onSet]
  );

  return (
    <Card className="border border-blue-gray-50">
      <CardBody className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <Typography variant="h6" color="blue-gray">
            {label || id}
          </Typography>
          <Chip size="sm" variant="ghost" color="blue-gray" value={type} />
        </div>

        {type === "toggle" && (
          <Switch
            checked={Boolean(Number(value))}
            onChange={(e) => onSet(id, e.target.checked ? 1 : 0)}
            crossOrigin=""
          />
        )}

        {type === "slider" && (
          <div className="flex flex-col gap-1">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value ?? min}
              onChange={(e) => throttledSet(Number(e.target.value))}
              onMouseUp={(e) => onSet(id, Number(e.target.value))}
              onTouchEnd={(e) => onSet(id, Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-blue-gray-100 accent-blue-500"
            />
            <div className="flex justify-between">
              <Typography variant="small" className="text-blue-gray-400">
                {min}
              </Typography>
              <Typography variant="small" color="blue-gray" className="font-bold">
                {value ?? "—"} {unit}
              </Typography>
              <Typography variant="small" className="text-blue-gray-400">
                {max}
              </Typography>
            </div>
          </div>
        )}

        {type === "button" && (
          <Button
            size="sm"
            color="blue"
            className="flex items-center justify-center gap-2"
            onClick={() => onSet(id, 1)}
          >
            <BoltIcon className="h-4 w-4" /> Trigger
          </Button>
        )}

        {type === "select" && (
          <Select
            label={label || id}
            value={value != null ? String(value) : undefined}
            onChange={(v) => onSet(id, v)}
          >
            {(options || []).map((o) => (
              <Option key={String(o)} value={String(o)}>
                {String(o)}
              </Option>
            ))}
          </Select>
        )}

        {(type === "readout" || type === "text") && (
          <Typography
            variant="h4"
            color="blue-gray"
            className="font-mono"
          >
            {value ?? "—"}
            {unit ? (
              <span className="ml-1 text-base text-blue-gray-400">{unit}</span>
            ) : null}
          </Typography>
        )}
      </CardBody>
    </Card>
  );
}

export function DGSD() {
  const { isConnected, sendData, subscribeLine } =
    useContext(WebSerialHandler);

  const [device, setDevice] = useState(null); // descriptor
  const [values, setValues] = useState({});
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState(null);
  const [showProtocol, setShowProtocol] = useState(false);
  const timeoutRef = useRef(null);

  // Parse incoming lines
  useEffect(() => {
    const unsubscribe = subscribeLine((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) return;
      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        return; // not valid JSON - ignore (console traffic etc.)
      }

      if (msg.dgsd && Array.isArray(msg.controls)) {
        // Capability descriptor
        clearTimeout(timeoutRef.current);
        setDevice(msg);
        setDiscovering(false);
        setError(null);
        // Ask for initial values
        for (const c of msg.controls) {
          if (c.type !== "button") sendData(`GET ${c.id}`, { lineEnding: "lf", echo: false });
        }
      } else if (msg.update && typeof msg.update === "object") {
        setValues((prev) => ({ ...prev, ...msg.update }));
      }
    });
    return unsubscribe;
  }, [subscribeLine, sendData]);

  const discover = useCallback(() => {
    if (!isConnected) return;
    setDiscovering(true);
    setError(null);
    setDevice(null);
    setValues({});
    sendData("DISCOVER", { lineEnding: "lf", echo: false });
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDiscovering(false);
      setError(
        "No descriptor received. Check the device speaks the DGSD protocol and the baud rate is correct."
      );
    }, DISCOVER_TIMEOUT_MS);
  }, [isConnected, sendData]);

  // Auto-discover on connect
  useEffect(() => {
    if (isConnected) {
      discover();
    } else {
      clearTimeout(timeoutRef.current);
      setDevice(null);
      setValues({});
      setDiscovering(false);
      setError(null);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [isConnected, discover]);

  const handleSet = useCallback(
    (id, value) => {
      setValues((prev) => ({ ...prev, [id]: value })); // optimistic
      sendData(`SET ${id} ${value}`, { lineEnding: "lf", echo: false });
    },
    [sendData]
  );

  return (
    <div className="mx-auto my-8 flex max-w-screen-xl flex-col gap-6">
      {/* ---------- Device header ---------- */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <CpuChipIcon className="h-8 w-8 text-blue-gray-500" />
            <div>
              <Typography variant="h5" color="blue-gray">
                {device ? device.name || "DGSD Device" : "DGSD"}
              </Typography>
              <Typography variant="small" className="text-blue-gray-400">
                {device
                  ? `Protocol v${device.dgsd}${device.fw ? ` — firmware ${device.fw}` : ""} — ${device.controls.length} controls`
                  : "Discover a device to render its controls"}
              </Typography>
            </div>
          </div>
          <Button
            size="sm"
            color="blue"
            className="flex items-center gap-2"
            onClick={discover}
            disabled={!isConnected || discovering}
          >
            {discovering ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <MagnifyingGlassIcon className="h-4 w-4" />
            )}
            {discovering ? "Discovering..." : "Discover"}
          </Button>
        </CardBody>
      </Card>

      {/* ---------- Status messages ---------- */}
      {!isConnected && (
        <Typography variant="small" className="text-blue-gray-400">
          Not connected. Use the connection controls in the navbar — discovery
          runs automatically once connected.
        </Typography>
      )}
      {error && (
        <Typography variant="small" color="red">
          {error}
        </Typography>
      )}

      {/* ---------- Control cards ---------- */}
      {device && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {device.controls.map((control) => (
            <ControlCard
              key={control.id}
              control={control}
              value={values[control.id]}
              onSet={handleSet}
            />
          ))}
        </div>
      )}

      {/* ---------- Protocol reference ---------- */}
      <Accordion open={showProtocol}>
        <AccordionHeader
          onClick={() => setShowProtocol((s) => !s)}
          className="text-sm"
        >
          Protocol reference (for firmware implementers)
        </AccordionHeader>
        <AccordionBody>
          <pre className="overflow-x-auto rounded-lg bg-blue-gray-50 p-4 font-mono text-xs text-blue-gray-800">
{`App → device (LF-terminated):
  DISCOVER              request capability descriptor
  GET <id>              request current value
  SET <id> <value>      set a control's value

Device → app (one JSON object per line):
  {"dgsd":1,"name":"Widget","fw":"1.0.0","controls":[
    {"id":"led","type":"toggle","label":"Status LED"},
    {"id":"fan","type":"slider","label":"Fan","min":0,"max":255,"step":1,"unit":"PWM"},
    {"id":"reset","type":"button","label":"Reset counters"},
    {"id":"mode","type":"select","label":"Mode","options":["idle","run","test"]},
    {"id":"temp","type":"readout","label":"Temperature","unit":"°C"},
    {"id":"status","type":"text","label":"Status"}
  ]}

  {"update":{"temp":23.4,"led":1}}   value updates - sent in reply to
                                     GET/SET and/or pushed as telemetry`}
          </pre>
        </AccordionBody>
      </Accordion>
    </div>
  );
}

export default DGSD;
