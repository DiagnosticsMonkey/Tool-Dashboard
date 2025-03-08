import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard, Serial, OpenSCAD } from "@/layouts";

function App() {
  return (
    <Routes>
      <Route path="/dashboard/*" element={<Dashboard />} />
      <Route path="/serial/*" element={<Serial />} />
      <Route path="/openscad/*" element={<OpenSCAD />} />
      <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
    </Routes>
  );
}

export default App;
