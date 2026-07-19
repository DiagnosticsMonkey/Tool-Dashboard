import React, {
  createContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";

export const WebSerialHandler = createContext();

// https://developer.chrome.com/docs/capabilities/serial

export const BAUD_RATES = [
  300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400,
  460800, 921600,
];

// Rates tried during auto-detection (most common first)
const DETECT_RATES = [115200, 9600, 57600, 38400, 19200, 230400, 460800, 4800];

export const DEFAULT_SETTINGS = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
};

const LINE_ENDINGS = {
  none: "",
  lf: "\n",
  cr: "\r",
  crlf: "\r\n",
};

const MAX_LOG_ENTRIES = 5000;

let logId = 0;

export const WebSerialProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isBusy, setIsBusy] = useState(false); // connect/disconnect/detect in flight
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [portInfo, setPortInfo] = useState(null);
  const [detectStatus, setDetectStatus] = useState(null); // status text during auto-baud
  const [patternRunning, setPatternRunning] = useState(false);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [rxCount, setRxCount] = useState(0);
  const [txCount, setTxCount] = useState(0);

  const isSupported =
    typeof navigator !== "undefined" && "serial" in navigator;

  // Refs to avoid stale closures in the read loop / event handlers
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const writerRef = useRef(null);
  const keepReadingRef = useRef(false);
  const rxBufferRef = useRef(""); // partial line buffer
  const settingsRef = useRef(settings);
  const patternTimerRef = useRef(null);
  const patternStateRef = useRef({ counter: 0 });
  const autoReconnectRef = useRef(autoReconnect);
  const encoder = useRef(new TextEncoder());
  const decoder = useRef(new TextDecoder());
  const lineSubscribersRef = useRef(new Set());

  // Subscribe to complete RX lines (e.g. for protocol parsing).
  // Returns an unsubscribe function.
  const subscribeLine = useCallback((fn) => {
    lineSubscribersRef.current.add(fn);
    return () => lineSubscribersRef.current.delete(fn);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    autoReconnectRef.current = autoReconnect;
  }, [autoReconnect]);

  // ---------- Logging ----------

  const addLog = useCallback((type, text) => {
    setLogs((prev) => {
      const next = [
        ...prev,
        { id: logId++, type, text, ts: new Date() },
      ];
      return next.length > MAX_LOG_ENTRIES
        ? next.slice(next.length - MAX_LOG_ENTRIES)
        : next;
    });
  }, []);

  // Append RX data, splitting into lines. Partial lines are kept in a
  // buffer and the last log entry is updated in place as data arrives.
  const appendRx = useCallback((text) => {
    setRxCount((c) => c + text.length);
    rxBufferRef.current += text;
    const parts = rxBufferRef.current.split(/\r\n|\n|\r/);
    rxBufferRef.current = parts.pop(); // keep trailing partial line

    // Notify line subscribers of each complete line
    for (const line of parts) {
      if (line.length) {
        for (const fn of lineSubscribersRef.current) {
          try {
            fn(line);
          } catch (e) {
            /* subscriber error - don't break the read loop */
          }
        }
      }
    }

    setLogs((prev) => {
      let next = [...prev];
      // Complete lines
      for (const line of parts) {
        const last = next[next.length - 1];
        if (last && last.type === "rx" && last.partial) {
          // finish the open partial line
          next[next.length - 1] = {
            ...last,
            text: line.length ? line : last.text,
            partial: false,
          };
          // NOTE: `line` here already contains the buffered prefix because
          // rxBufferRef accumulated it before splitting.
        } else {
          next.push({ id: logId++, type: "rx", text: line, ts: new Date() });
        }
      }
      // Open partial line
      if (rxBufferRef.current.length) {
        const last = next[next.length - 1];
        if (last && last.type === "rx" && last.partial) {
          next[next.length - 1] = { ...last, text: rxBufferRef.current };
        } else {
          next.push({
            id: logId++,
            type: "rx",
            text: rxBufferRef.current,
            ts: new Date(),
            partial: true,
          });
        }
      }
      return next.length > MAX_LOG_ENTRIES
        ? next.slice(next.length - MAX_LOG_ENTRIES)
        : next;
    });
  }, []);

  const clearLogs = useCallback(() => {
    rxBufferRef.current = "";
    setLogs([]);
    setRxCount(0);
    setTxCount(0);
  }, []);

  const downloadLog = useCallback(() => {
    setLogs((prev) => {
      const content = prev
        .map(
          (l) =>
            `[${l.ts.toISOString()}] ${l.type.toUpperCase().padEnd(4)} ${l.text}`
        )
        .join("\n");
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `serial-log-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      return prev;
    });
  }, []);

  // ---------- Read loop ----------

  const readLoop = useCallback(async () => {
    const port = portRef.current;
    keepReadingRef.current = true;

    while (port.readable && keepReadingRef.current) {
      const reader = port.readable.getReader();
      readerRef.current = reader;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break; // reader.cancel() was called
          if (value) {
            appendRx(decoder.current.decode(value, { stream: true }));
          }
        }
      } catch (error) {
        // Fatal error - e.g. device unplugged
        addLog("sys", `Read error: ${error.message}`);
        break;
      } finally {
        reader.releaseLock();
        readerRef.current = null;
      }
    }
  }, [appendRx, addLog]);

  // ---------- Connect / Disconnect ----------

  const openPort = useCallback(
    async (port, overrides = {}) => {
      const opts = { ...settingsRef.current, ...overrides };
      await port.open({
        baudRate: Number(opts.baudRate),
        dataBits: Number(opts.dataBits),
        stopBits: Number(opts.stopBits),
        parity: opts.parity,
        flowControl: opts.flowControl,
      });
      portRef.current = port;
      writerRef.current = port.writable.getWriter();

      const info = port.getInfo();
      setPortInfo(info);
      setIsConnected(true);
      addLog(
        "sys",
        `Connected @ ${opts.baudRate} baud (${opts.dataBits}${opts.parity[0].toUpperCase()}${opts.stopBits})` +
          (info.usbVendorId
            ? ` — USB VID:0x${info.usbVendorId.toString(16).padStart(4, "0")} PID:0x${info.usbProductId.toString(16).padStart(4, "0")}`
            : "")
      );
      readLoop();
    },
    [addLog, readLoop]
  );

  const connect = useCallback(
    async (overrides = {}) => {
      if (!isSupported) {
        addLog("sys", "Web Serial is not supported in this browser. Use Chrome or Edge.");
        return false;
      }
      if (portRef.current) return true;
      setIsBusy(true);
      try {
        const port = await navigator.serial.requestPort();
        await openPort(port, overrides);
        return true;
      } catch (error) {
        if (error.name !== "NotFoundError") {
          addLog("sys", `Connection failed: ${error.message}`);
        }
        setIsConnected(false);
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [isSupported, openPort, addLog]
  );

  const closePort = useCallback(async () => {
    keepReadingRef.current = false;

    if (patternTimerRef.current) {
      clearInterval(patternTimerRef.current);
      patternTimerRef.current = null;
      setPatternRunning(false);
    }

    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
    } catch (e) {
      /* reader already dead */
    }

    try {
      if (writerRef.current) {
        writerRef.current.releaseLock();
        writerRef.current = null;
      }
    } catch (e) {
      /* writer already dead */
    }

    try {
      if (portRef.current) {
        await portRef.current.close();
      }
    } catch (e) {
      /* port already closed */
    }

    portRef.current = null;
    setIsConnected(false);
    setPortInfo(null);
  }, []);

  const disconnect = useCallback(async () => {
    setIsBusy(true);
    await closePort();
    addLog("sys", "Disconnected.");
    setIsBusy(false);
  }, [closePort, addLog]);

  // ---------- Send ----------

  const sendData = useCallback(
    async (data, { lineEnding = "none", echo = true } = {}) => {
      const writer = writerRef.current;
      if (!writer) {
        addLog("sys", "Not connected - cannot send.");
        return;
      }
      const payload = data + (LINE_ENDINGS[lineEnding] ?? "");
      try {
        await writer.write(encoder.current.encode(payload));
        setTxCount((c) => c + payload.length);
        if (echo) addLog("tx", data);
      } catch (error) {
        addLog("sys", `Write error: ${error.message}`);
      }
    },
    [addLog]
  );

  const sendBytes = useCallback(
    async (bytes) => {
      const writer = writerRef.current;
      if (!writer) return;
      try {
        await writer.write(bytes);
        setTxCount((c) => c + bytes.length);
      } catch (error) {
        addLog("sys", `Write error: ${error.message}`);
      }
    },
    [addLog]
  );

  const setSignals = useCallback(async (signals) => {
    // signals: { dataTerminalReady, requestToSend, break }
    if (portRef.current) {
      try {
        await portRef.current.setSignals(signals);
      } catch (e) {
        /* not all adapters support signals */
      }
    }
  }, []);

  // ---------- Auto-baud detection ----------
  //
  // Web Serial gives no access to edge timing, so true baud measurement is
  // impossible. Instead we sample incoming data at each candidate rate and
  // score how "text-like" the decoded bytes are. Requires the device to be
  // transmitting. The rate with the best printable-character ratio wins.

  const scoreSample = (bytes) => {
    if (!bytes.length) return -1;
    let printable = 0;
    for (const b of bytes) {
      if ((b >= 0x20 && b <= 0x7e) || b === 0x0a || b === 0x0d || b === 0x09) {
        printable++;
      }
    }
    return printable / bytes.length;
  };

  const detectBaudRate = useCallback(
    async ({ sampleMs = 600 } = {}) => {
      if (!isSupported) return null;
      if (portRef.current) {
        addLog("sys", "Disconnect before running baud detection.");
        return null;
      }
      setIsBusy(true);
      setDetectStatus("Select the port to test...");
      let port;
      try {
        port = await navigator.serial.requestPort();
      } catch {
        setDetectStatus(null);
        setIsBusy(false);
        return null;
      }

      addLog("sys", "Auto-baud: sampling data at candidate rates (device must be transmitting)...");
      const results = [];

      for (const rate of DETECT_RATES) {
        setDetectStatus(`Testing ${rate} baud...`);
        try {
          await port.open({ baudRate: rate });
          const chunks = [];
          const reader = port.readable.getReader();
          const deadline = Date.now() + sampleMs;
          try {
            while (Date.now() < deadline) {
              const timeLeft = deadline - Date.now();
              const result = await Promise.race([
                reader.read(),
                new Promise((res) =>
                  setTimeout(() => res({ timeout: true }), timeLeft)
                ),
              ]);
              if (result.timeout) break;
              if (result.done) break;
              if (result.value) chunks.push(...result.value);
            }
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          await port.close();

          const score = scoreSample(chunks);
          results.push({ rate, score, bytes: chunks.length });
          addLog(
            "sys",
            `  ${String(rate).padStart(6)} baud: ${chunks.length} bytes, ${
              score < 0 ? "no data" : `${Math.round(score * 100)}% printable`
            }`
          );
          // Early exit on a very confident result
          if (score > 0.97 && chunks.length > 20) break;
        } catch (error) {
          await port.close().catch(() => {});
          addLog("sys", `  ${rate} baud: error (${error.message})`);
        }
      }

      const best = results
        .filter((r) => r.score >= 0)
        .sort((a, b) => b.score - a.score || b.bytes - a.bytes)[0];

      if (!best || best.score < 0.5) {
        addLog(
          "sys",
          "Auto-baud: no conclusive result. Is the device transmitting?"
        );
        setDetectStatus(null);
        setIsBusy(false);
        return null;
      }

      addLog("sys", `Auto-baud: best match ${best.rate} baud. Connecting...`);
      setSettings((s) => ({ ...s, baudRate: best.rate }));
      setDetectStatus(null);
      try {
        await openPort(port, { baudRate: best.rate });
      } catch (error) {
        addLog("sys", `Connection failed: ${error.message}`);
      }
      setIsBusy(false);
      return best.rate;
    },
    [isSupported, addLog, openPort]
  );

  // ---------- Test pattern generation ----------

  const PATTERNS = {
    "u-square": {
      label: "0x55 'U' square wave",
      next: () => "UUUUUUUUUUUUUUUU",
    },
    "ascii-ramp": {
      label: "ASCII ramp 0x20-0x7E",
      next: () => {
        let s = "";
        for (let i = 0x20; i <= 0x7e; i++) s += String.fromCharCode(i);
        return s;
      },
    },
    counter: {
      label: "Incrementing counter",
      next: (state) => `COUNT=${String(state.counter++).padStart(8, "0")}`,
    },
    timestamp: {
      label: "Timestamp",
      next: () => `TS=${Date.now()}`,
    },
  };

  const startPattern = useCallback(
    (type = "counter", { intervalMs = 500, lineEnding = "crlf" } = {}) => {
      if (!writerRef.current) {
        addLog("sys", "Not connected - cannot start pattern.");
        return;
      }
      if (patternTimerRef.current) clearInterval(patternTimerRef.current);
      const pattern = PATTERNS[type];
      if (!pattern) return;
      patternStateRef.current = { counter: 0 };
      addLog("sys", `Test pattern started: ${pattern.label} every ${intervalMs}ms`);
      setPatternRunning(true);
      patternTimerRef.current = setInterval(() => {
        if (!writerRef.current) {
          clearInterval(patternTimerRef.current);
          patternTimerRef.current = null;
          setPatternRunning(false);
          return;
        }
        const data =
          pattern.next(patternStateRef.current) +
          (LINE_ENDINGS[lineEnding] ?? "");
        writerRef.current
          .write(encoder.current.encode(data))
          .then(() => setTxCount((c) => c + data.length))
          .catch(() => {});
      }, intervalMs);
    },
    [addLog]
  );

  const stopPattern = useCallback(() => {
    if (patternTimerRef.current) {
      clearInterval(patternTimerRef.current);
      patternTimerRef.current = null;
      setPatternRunning(false);
      addLog("sys", "Test pattern stopped.");
    }
  }, [addLog]);

  // ---------- Physical connect/disconnect events ----------

  useEffect(() => {
    if (!isSupported) return;

    const onConnect = async (event) => {
      addLog("sys", "Serial device plugged in.");
      // Auto-reconnect to previously authorised device
      if (autoReconnectRef.current && !portRef.current) {
        try {
          await openPort(event.target);
        } catch (error) {
          addLog("sys", `Auto-reconnect failed: ${error.message}`);
        }
      }
    };

    const onDisconnect = async (event) => {
      if (event.target === portRef.current) {
        addLog("sys", "Device unplugged.");
        await closePort();
      }
    };

    navigator.serial.addEventListener("connect", onConnect);
    navigator.serial.addEventListener("disconnect", onDisconnect);
    return () => {
      navigator.serial.removeEventListener("connect", onConnect);
      navigator.serial.removeEventListener("disconnect", onDisconnect);
    };
  }, [isSupported, addLog, closePort, openPort]);

  return (
    <WebSerialHandler.Provider
      value={{
        isSupported,
        isConnected,
        isBusy,
        logs,
        settings,
        setSettings,
        portInfo,
        connect,
        disconnect,
        sendData,
        sendBytes,
        setSignals,
        subscribeLine,
        clearLogs,
        downloadLog,
        detectBaudRate,
        detectStatus,
        startPattern,
        stopPattern,
        patternRunning,
        patterns: Object.fromEntries(
          Object.entries(PATTERNS).map(([k, v]) => [k, v.label])
        ),
        autoReconnect,
        setAutoReconnect,
        rxCount,
        txCount,
      }}
    >
      {children}
    </WebSerialHandler.Provider>
  );
};
