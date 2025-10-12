import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

let container = null;

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    // attach global helper
    window.appToast = (message, opts = {}) => {
      const id = Date.now() + Math.random().toString(36).slice(2, 8);
      setToasts((t) => [...t, { id, message, ...opts }]);
      if (opts.duration !== 0) {
        const dur = opts.duration || 3000;
        setTimeout(() => {
          setToasts((t) => t.filter((x) => x.id !== id));
        }, dur);
      }
    };
    return () => {
      try {
        delete window.appToast;
      } catch (e) {}
    };
  }, []);

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto bg-blue-600 text-white px-4 py-3 rounded-lg shadow-2xl max-w-md w-full border border-blue-700/40 ring-1 ring-blue-700/10 transform transition-all duration-200"
          style={{ animation: "toast-in 220ms ease-out" }}
        >
          <div className="text-sm font-medium">{t.message}</div>
        </div>
      ))}

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

export function mountToasts() {
  if (container) return;
  container = document.createElement("div");
  document.body.appendChild(container);
  // React 18: use createRoot instead of ReactDOM.render
  const root = createRoot(container);
  root.render(<ToastContainer />);
}

export default ToastContainer;
