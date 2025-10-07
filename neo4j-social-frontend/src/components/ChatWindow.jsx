import React, { useEffect, useState, useRef } from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config.js";

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
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const socketRef = useRef(null);

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

  const send = async () => {
    if (!text.trim() || !peer) return;
    const payload = { toUserId: peer.id, text };
    try {
      const res = await api.post("/messages/send", payload);
      setMessages((m) => [
        ...m,
        {
          ...res.data,
          direction: "out",
          createdAt: formatDateTime(res.data.createdAt),
        },
      ]);
      setText("");
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
              className={`max-w-[80%] p-2 rounded ${
                m.direction === "out"
                  ? "ml-auto bg-blue-100 text-right"
                  : "bg-gray-100"
              }`}
            >
              <div className="text-sm">{m.text}</div>
              <div className="text-xs text-gray-400">
                {m.createdAt && typeof m.createdAt === "object"
                  ? "Just now"
                  : m.createdAt || "Just now"}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef}></div>
      </div>
      <div className="p-3 border-t flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 border rounded px-3 py-2"
          placeholder="Type a message..."
        />
        <button
          onClick={send}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}
