import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { mountToasts } from "./components/Toast";

// mount toasts globally
mountToasts();

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
