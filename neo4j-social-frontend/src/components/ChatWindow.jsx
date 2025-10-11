import React, { useEffect, useState, useRef } from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config.js";
import feelings from "../data/feelings";

// Helper function to format Neo4j datetime
const formatDateTime = (dateTime) => {
  if (!dateTime) return "Just now";
  if (typeof dateTime === "string") return dateTime;
  if (typeof dateTime === "object" && dateTime.year) {
    // Neo4j datetime object
    try {
      const date = new Date(
        dateTime.year.low || dateTime.year,
        (dateTime.month.low || dateTime.month) - 1,
        dateTime.day.low || dateTime.day,
        dateTime.hour.low || dateTime.hour,
        dateTime.minute.low || dateTime.minute,
        dateTime.second.low || dateTime.second
      );
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "Just now";
    }
  }
  return "Just now";
};

export default function ChatWindow({ peer }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const socketRef = useRef(null);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const pickerButtonRef = useRef(null);

  // Helper to handle icon display - since backend now stores icon separately,
  // we don't need to strip emojis from text anymore
  const stripIconFromText = (textValue, iconValue) => {
    // Keep text as-is since backend maintains text and icon separately
    return textValue || "";
  };

  useEffect(() => {
    let cancelled = false;
    const fetchConversation = async () => {
      if (!peer || !user) return;
      setLoading(true);
      try {
        const res = await api.get(`/messages/conversation/${peer.id}`);
        if (!cancelled) {
          const formattedMessages = (res.data || []).map((msg) => ({
            ...msg,
            direction: msg.senderId === user.id ? "out" : "in",
            createdAt: formatDateTime(msg.createdAt),
            // Keep text as-is since backend stores icon separately
            text: stripIconFromText(msg.text, msg.icon),
          }));
          setMessages(formattedMessages);
        }
      } catch (err) {
        console.error("Failed to load conversation", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchConversation();
    return () => (cancelled = true);
  }, [peer, user]);

  // Socket.IO connect
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("token");
    console.log("🔌 Connecting to Socket.IO...", {
      userId: user.id,
      token: !!token,
    });

    const socket = ioClient(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Socket connected!", socket.id);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection failed:", error);
    });

    socket.on("message:new", (payload) => {
      console.log("📨 Received message:new event:", payload);
      // payload: { conversationId, message }
      if (!peer) {
        console.log("⚠️ No peer selected, ignoring message");
        return;
      }
      const myConvId = [user.id, peer.id].sort().join("-");
      console.log("🔍 Checking conversation:", {
        received: payload.conversationId,
        expected: myConvId,
      });

      if (payload.conversationId === myConvId) {
        console.log(
          "✅ Message belongs to current conversation, adding to state"
        );
        setMessages((m) => [
          ...m,
          {
            ...payload.message,
            direction: payload.message.senderId === user.id ? "out" : "in",
            createdAt: formatDateTime(payload.message.createdAt),
            text: stripIconFromText(payload.message.text, payload.message.icon),
          },
        ]);
      } else {
        console.log("⚠️ Message for different conversation, ignoring");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, peer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;
    const handleClickOutside = (e) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target) &&
        pickerButtonRef.current &&
        !pickerButtonRef.current.contains(e.target)
      ) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPicker]);

  const send = async () => {
    if (!text.trim() || !peer) return;
    const payload = { toUserId: peer.id, text };
    // Note: selectedIcon is no longer sent to avoid duplication with emojis in text
    // Backend will extract emojis from text automatically
    try {
      const res = await api.post("/messages/send", payload);
      setMessages((m) => [
        ...m,
        {
          ...res.data,
          direction: "out",
          createdAt: formatDateTime(res.data.createdAt),
          text: stripIconFromText(res.data.text, res.data.icon),
        },
      ]);
      setText("");
      // clear selected icon after send so we don't reuse it unexpectedly
      setSelectedIcon("");
      // Backend handles real-time delivery to receiver via Socket.IO
    } catch (err) {
      console.error("Send failed", err);
    }
  };

  if (!peer)
    return (
      <div className="bg-white border rounded-lg p-4 text-center text-gray-500">
        Select a conversation
      </div>
    );

  return (
    <div className="flex flex-col bg-white border rounded-lg h-full">
      <div className="p-4 border-b">
        <div className="font-semibold">{peer.displayName || peer.username}</div>
        <div className="text-xs text-gray-500">@{peer.username}</div>
      </div>
      <div className="p-4 flex-1 overflow-auto space-y-3">
        {loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-500">No messages</div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`w-full flex ${
                m.direction === "out" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`inline-block max-w-[80%] p-3 rounded-lg ${
                  m.direction === "out"
                    ? "bg-blue-600 text-white text-right"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                <div className="flex items-center gap-3 text-lg whitespace-pre-wrap break-words">
                  {/* Only display text from database - it contains emojis as user typed */}
                  <div className="inline-block">{m.text}</div>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef}></div>
      </div>
      <div className="p-3 border-t flex gap-2 relative">
        <button
          ref={pickerButtonRef}
          onClick={() => setShowPicker((s) => !s)}
          className={`px-3 py-2 rounded border bg-white text-xl ${
            showPicker ? "ring-2 ring-blue-300" : ""
          }`}
          title="Choose emoji"
        >
          😄
        </button>
        {showPicker && (
          <div
            ref={pickerRef}
            className="absolute left-3 bottom-16 bg-white border rounded shadow p-3 w-64 max-h-48 overflow-auto z-50"
          >
            <div className="grid grid-cols-7 gap-2">
              {feelings.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    // insert emoji at caret and close picker
                    const sym = f.symbol || f.label || "";
                    const inp = inputRef.current;
                    const start = (inp && inp.selectionStart) || 0;
                    const end = (inp && inp.selectionEnd) || 0;
                    const before = text.slice(0, start);
                    const after = text.slice(end);
                    const next = before + sym + after;
                    setText(next);
                    // restore focus & caret after insertion
                    requestAnimationFrame(() => {
                      try {
                        inp && inp.focus();
                        const pos = start + (sym ? sym.length : 0);
                        inp && inp.setSelectionRange(pos, pos);
                      } catch (e) {
                        /* ignore */
                      }
                    });
                    // Don't set selectedIcon when inserting into text to avoid duplication
                    // Backend will extract emojis from text automatically
                  }}
                  className="p-2 text-lg rounded hover:bg-gray-100 transition-colors"
                  title={f.label}
                >
                  {f.symbol}
                </button>
              ))}
            </div>
          </div>
        )}{" "}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 border rounded px-3 py-2"
          placeholder="Nhập tin nhắn..."
        />
        <button
          onClick={send}
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-900"
        >
          Gửi
        </button>
      </div>
    </div>
  );
}
