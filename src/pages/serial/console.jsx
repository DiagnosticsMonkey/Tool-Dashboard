import React, {
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Button,
  IconButton,
  Input,
  Select,
  Option,
  Switch,
  Tooltip,
  Chip,
} from "@material-tailwind/react";
import {
  TrashIcon,
  ArrowDownTrayIcon,
  PlayIcon,
  StopIcon,
  PaperAirplaneIcon,
  ArrowsUpDownIcon,
} from "@heroicons/react/24/solid";
import { WebSerialHandler } from "@/context/webserialhandler";

const LINE_ENDING_OPTIONS = [
  { value: "none", label: "No line ending" },
  { value: "lf", label: "LF (\\n)" },
  { value: "cr", label: "CR (\\r)" },
  { value: "crlf", label: "CRLF (\\r\\n)" },
];

function toHex(text) {
  return Array.from(text)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join(" ");
}

const LOG_COLORS = {
  rx: "text-green-400",
  tx: "text-cyan-400",
  sys: "text-yellow-500",
};

const LOG_PREFIX = {
  rx: "←",
  tx: "→",
  sys: "•",
};

export function Console() {
  const {
    isSupported,
    isConnected,
    logs,
    settings,
    sendData,
    clearLogs,
    downloadLog,
    startPattern,
    stopPattern,
    patternRunning,
    patterns,
    rxCount,
    txCount,
  } = useContext(WebSerialHandler);

  const [input, setInput] = useState("");
  const [lineEnding, setLineEnding] = useState("crlf");
  const [localEcho, setLocalEcho] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [hexView, setHexView] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [patternType, setPatternType] = useState("counter");
  const [patternInterval, setPatternInterval] = useState("500");

  const terminalRef = useRef(null);
  const inputRef = useRef(null);

  // Autoscroll on new data
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Pause autoscroll when the user scrolls up; resume at the bottom
  const handleScroll = useCallback(() => {
    const el = terminalRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const handleSend = async () => {
    if (!input.length) return;
    await sendData(input, { lineEnding, echo: localEcho });
    setHistory((h) => (h[h.length - 1] === input ? h : [...h, input].slice(-100)));
    setHistoryIdx(-1);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const idx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx < 0) return;
      const idx = historyIdx + 1;
      if (idx >= history.length) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        setHistoryIdx(idx);
        setInput(history[idx]);
      }
    }
  };

  return (
    <div className="mx-auto my-8 flex max-w-screen-xl flex-col gap-6">
      {!isSupported && (
        <Card className="border border-red-200 bg-red-50">
          <CardBody>
            <Typography color="red" variant="small">
              Web Serial is not supported in this browser. Use Chrome, Edge, or
              Opera on desktop.
            </Typography>
          </CardBody>
        </Card>
      )}

      {/* ---------- Terminal ---------- */}
      <Card>
        <CardHeader
          color="transparent"
          floated={false}
          shadow={false}
          className="m-0 flex flex-wrap items-center justify-between gap-2 p-4"
        >
          <div className="flex items-center gap-3">
            <Typography variant="h5" color="blue-gray">
              Serial Console
            </Typography>
            <Chip
              size="sm"
              variant="ghost"
              color={isConnected ? "green" : "red"}
              value={isConnected ? `Connected @ ${settings.baudRate}` : "Disconnected"}
            />
            <Typography variant="small" className="text-blue-gray-400">
              RX {rxCount} B / TX {txCount} B
            </Typography>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              label={
                <Typography variant="small" color="blue-gray">
                  Timestamps
                </Typography>
              }
              checked={showTimestamps}
              onChange={(e) => setShowTimestamps(e.target.checked)}
              crossOrigin=""
            />
            <Switch
              label={
                <Typography variant="small" color="blue-gray">
                  Hex
                </Typography>
              }
              checked={hexView}
              onChange={(e) => setHexView(e.target.checked)}
              crossOrigin=""
            />
            <Tooltip content="Scroll to bottom / resume autoscroll">
              <IconButton
                variant="text"
                color={autoScroll ? "green" : "blue-gray"}
                onClick={() => {
                  setAutoScroll(true);
                  if (terminalRef.current)
                    terminalRef.current.scrollTop =
                      terminalRef.current.scrollHeight;
                }}
              >
                <ArrowsUpDownIcon className="h-5 w-5" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Download log">
              <IconButton variant="text" color="blue-gray" onClick={downloadLog}>
                <ArrowDownTrayIcon className="h-5 w-5" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Clear">
              <IconButton variant="text" color="red" onClick={clearLogs}>
                <TrashIcon className="h-5 w-5" />
              </IconButton>
            </Tooltip>
          </div>
        </CardHeader>

        <CardBody className="p-4 pt-0">
          <div
            ref={terminalRef}
            onScroll={handleScroll}
            className="h-96 overflow-y-auto rounded-lg bg-black p-3 font-mono text-sm leading-relaxed"
          >
            {logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className={`whitespace-pre-wrap break-all ${LOG_COLORS[log.type] || "text-gray-300"}`}>
                  {showTimestamps && (
                    <span className="mr-2 text-gray-600">
                      {log.ts.toLocaleTimeString("en-GB", { hour12: false })}.
                      {String(log.ts.getMilliseconds()).padStart(3, "0")}
                    </span>
                  )}
                  <span className="mr-1 select-none text-gray-600">
                    {LOG_PREFIX[log.type]}
                  </span>
                  {hexView && log.type !== "sys" ? toHex(log.text) : log.text}
                  {log.partial && (
                    <span className="animate-pulse text-gray-500">▌</span>
                  )}
                </div>
              ))
            ) : (
              <span className="text-gray-600">
                {isConnected
                  ? "Waiting for data..."
                  : "Not connected. Use the connection controls in the navbar."}
              </span>
            )}
          </div>
        </CardBody>

        {/* ---------- Send bar ---------- */}
        <CardFooter className="flex flex-wrap items-center gap-3 p-4 pt-0">
          <div className="min-w-[200px] flex-1">
            <Input
              inputRef={inputRef}
              label="Send data (↑/↓ for history)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isConnected}
              crossOrigin=""
            />
          </div>
          <div className="w-44">
            <Select
              label="Line ending"
              value={lineEnding}
              onChange={(v) => setLineEnding(v)}
            >
              {LINE_ENDING_OPTIONS.map((o) => (
                <Option key={o.value} value={o.value}>
                  {o.label}
                </Option>
              ))}
            </Select>
          </div>
          <Switch
            label={
              <Typography variant="small" color="blue-gray">
                Echo
              </Typography>
            }
            checked={localEcho}
            onChange={(e) => setLocalEcho(e.target.checked)}
            crossOrigin=""
          />
          <Button
            size="sm"
            color="blue"
            className="flex items-center gap-2"
            onClick={handleSend}
            disabled={!isConnected || !input.length}
          >
            <PaperAirplaneIcon className="h-4 w-4" /> Send
          </Button>
        </CardFooter>
      </Card>

      {/* ---------- Test patterns ---------- */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-4 p-4">
          <Typography variant="h6" color="blue-gray" className="mr-2">
            Test Patterns
          </Typography>
          <div className="w-60">
            <Select
              label="Pattern"
              value={patternType}
              onChange={(v) => setPatternType(v)}
              disabled={patternRunning}
            >
              {Object.entries(patterns).map(([key, label]) => (
                <Option key={key} value={key}>
                  {label}
                </Option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Input
              label="Interval (ms)"
              type="number"
              min="10"
              value={patternInterval}
              onChange={(e) => setPatternInterval(e.target.value)}
              disabled={patternRunning}
              crossOrigin=""
            />
          </div>
          {patternRunning ? (
            <Button
              size="sm"
              color="red"
              className="flex items-center gap-2"
              onClick={stopPattern}
            >
              <StopIcon className="h-4 w-4" /> Stop
            </Button>
          ) : (
            <Button
              size="sm"
              color="green"
              className="flex items-center gap-2"
              onClick={() =>
                startPattern(patternType, {
                  intervalMs: Math.max(10, Number(patternInterval) || 500),
                  lineEnding,
                })
              }
              disabled={!isConnected}
            >
              <PlayIcon className="h-4 w-4" /> Start
            </Button>
          )}
          <Typography variant="small" className="text-blue-gray-400">
            Sends a repeating pattern out of TX — loop TX to RX to verify the
            link, or use 0x55 for scope timing checks.
          </Typography>
        </CardBody>
      </Card>
    </div>
  );
}

export default Console;
