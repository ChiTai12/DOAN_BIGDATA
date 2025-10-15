import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { mountToasts } from "./components/Toast";
import { AuthProvider } from "./components/AuthContext";

// mount toasts globally
mountToasts();

ReactDOM.createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
