import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Dashboard, Serial, OpenSCAD } from "@/layouts";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/serial/*" element={<Serial />} />
        <Route path="/openscad/*" element={<OpenSCAD />} />
        <Route path="*" element={<Navigate to="/dashboard/home" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
