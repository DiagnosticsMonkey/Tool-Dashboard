import React, { createContext, useState, useEffect } from "react";

export const WebSerialHandler = createContext();

// https://developer.chrome.com/docs/capabilities/serial

export const WebSerialProvider = ({ children }) => {
  const [port, setPort] = useState(null);
  const [reader, setReader] = useState(null);
  const [writer, setWriter] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false); // Track connection status

// TODO - Add browser check using - if ("serial" in navigator)

  const connect = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 }); // TODO - Expose this as param
      setPort(port);
      // console.log(port);

      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      setReader(reader);
      const writer = port.writable.getWriter();
      setWriter(writer);

      setIsConnected(true);

      // Read data from serial
      const readLoop = async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            break;
          }
          console.log(value);
          setLogs((prev) => [...prev, value]);
        }
      };

      readLoop();

    } catch (error) {
      console.error("Serial connection failed:", error);
      setIsConnected(false); // Force status on error
    }
  };

  const sendData = async (data) => {
    if (writer) {
      await writer.write(data);
    }
  };

  const disconnect = async () => {
    try {
      // TODO - Fix disconnect logic
      // Handle reader lock
      if (reader) {
        if (reader.locked) {
          console.log("Reader Locked - Cancelling...");
          await port.readable.pipeTo(textDecoder.writable);
        }
        reader.releaseLock();
        console.log("Reader Lock - Released.");
      }
  
      // Handle writer lock
      if (writer) {
        writer.releaseLock();
        await port.writable.closed;
        console.log("Writer Lock - Released.");
      }
  
      // Close port
      if (port) {
        await port.close();
        console.log("Port - Closed.");
      }
  
      // Clear out the state
      setPort(null);
      setReader(null);
      setWriter(null);
      setIsConnected(false);
  
    } catch (error) {
      console.error("Error during disconnection:", error);
    }
  };

// TODO - Monitor connection state via - navigator.serial.addEventListener for connect/disconnect

  return (
    <WebSerialHandler.Provider value={{ connect, disconnect, sendData, logs, isConnected }}>
      {children}
    </WebSerialHandler.Provider>
  );
};
