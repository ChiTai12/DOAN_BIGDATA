import React, { useState } from "react";
import ChatSidebar from "../components/ChatSidebar";
import ChatWindow from "../components/ChatWindow";

export default function ChatPage() {
  const [selected, setSelected] = useState(null);

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
