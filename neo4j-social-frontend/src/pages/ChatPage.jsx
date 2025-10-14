import React, { useState } from "react";
import ChatSidebar from "../components/ChatSidebar";
import ChatWindow from "../components/ChatWindow";

export default function ChatPage() {
  const [selected, setSelected] = useState(null);

  // Keep selected peer up-to-date when their profile changes elsewhere
  React.useEffect(() => {
    function onUserUpdated(e) {
      const payload = e.detail || e;
      if (!payload || !payload.user) return;
      const updated = payload.user;
      setSelected((s) => {
        try {
          if (!s) return s;
          if (
            (s.id && updated.id && String(s.id) === String(updated.id)) ||
            (s.username &&
              updated.username &&
              String(s.username) === String(updated.username))
          ) {
            return { ...s, ...updated };
          }
        } catch (err) {}
        return s;
      });
    }
    window.addEventListener("app:user:updated", onUserUpdated);
    return () => window.removeEventListener("app:user:updated", onUserUpdated);
  }, []);

  if (selected) {
    // Show chat window when a user is selected
    return (
      <div className="h-full flex flex-col">
        <div className="border-b p-3 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelected(null)}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Quay lại
            </button>
            <span className="font-semibold text-sm">
              {selected.displayName || selected.username}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatWindow peer={selected} />
        </div>
      </div>
    );
  }

  // Show sidebar when no user is selected
  return (
    <div className="h-full">
      <ChatSidebar onSelect={setSelected} />
    </div>
  );
}
