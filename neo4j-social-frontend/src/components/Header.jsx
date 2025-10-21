import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import LoginModal from "./LoginModal";
import UpdateProfileModal from "./UpdateProfileModal";
import ChangePasswordModal from "./ChangePasswordModal";
import ChatPage from "../pages/ChatPage";
import ConnectionsModal from "./ConnectionsModal";
import {
  FaHome,
  FaCommentAlt,
  FaBell,
  FaChevronDown,
  FaSearch,
  FaUsers,
} from "react-icons/fa";
import { FiPlus, FiMessageCircle } from "react-icons/fi";
import { AiOutlineHome, AiOutlinePlusSquare } from "react-icons/ai";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config.js";

function Header() {
  const { user, logout, updateUserOnly, token: ctxToken } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showUpdateProfile, setShowUpdateProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [notifCount, setNotifCount] = useState(0);
  const [suppressBadge, setSuppressBadge] = useState(false);
  const socketRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  // track whether the dropdown was opened by an explicit user click
  const openedByUserRef = useRef(false);
  // guard to prevent multiple concurrent mark-read requests
  const markReadInFlightRef = useRef(false);
  // ids that were viewed locally (user opened dropdown or clicked item)
  const viewedLocallyRef = useRef(new Set());
  // signatures (logical keys) of notifications viewed locally — used to
  // prevent the same logical notification (different ids) from reappearing
  // when the server or socket later emits it.
  const viewedSignaturesRef = useRef(new Set());
  // timestamp of last mark-read (ms) to avoid repeated sequential calls
  const lastMarkReadAtRef = useRef(0);
  // Helper to remove duplicates by id while preserving order (first occurrence wins)
  const uniqueById = (arr) =>
    Array.from(new Map(arr.map((i) => [i.id, i])).values());
  // signature to identify logically-equal notifications (may have different ids)
  const notifSignature = (n) => {
    try {
      const fromUserId =
        n && n.fromUserId != null ? String(n.fromUserId).trim() : "";
      const postId = n && n.postId != null ? String(n.postId).trim() : "";
      const type =
        n && n.type != null ? String(n.type).trim().toLowerCase() : "";
      const commentId =
        n && n.commentId != null ? String(n.commentId).trim() : "";
      const commentText =
        n && n.commentText
          ? String(n.commentText).trim().toLowerCase().slice(0, 40)
          : "";
      // include a short snippet of commentText to disambiguate replies vs generic events
      return `${fromUserId}::${postId}::${type}::${commentId}::${commentText}`;
    } catch (e) {
      return String(n && n.id) || "";
    }
  };

  const dedupeBySignature = (arr) => {
    const map = new Map();
    for (const n of arr) {
      const key = notifSignature(n);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, n);
        continue;
      }
      // prefer the item with the latest timestamp, and preserve timeString/read when present
      const aTs = Number(existing.timestamp) || 0;
      const bTs = Number(n.timestamp) || 0;
      if (bTs > aTs) {
        map.set(key, {
          ...existing,
          ...n,
          timeString: n.timeString || existing.timeString,
        });
      } else {
        map.set(key, {
          ...existing,
          timeString: existing.timeString || n.timeString,
        });
      }
    }
    return Array.from(map.values());
  };

  // Mark a single notification as read when user clicks it
  const handleNotificationItemClick = async (notif) => {
    if (!notif) return;
    // Only navigate on item click; do NOT mark as read here. The blue dot is
    // the explicit control to mark a notification as read per UX request.
    try {
      if (notif.postId) {
        window.dispatchEvent(
          new CustomEvent("app:navigate:post", {
            detail: { postId: notif.postId, commentId: notif.commentId },
          })
        );
      }
    } catch (e) {}
  };

  // Mark a single notification as read when user clicks the small blue dot
  const handleDotClick = async (e, notif) => {
    if (!notif) return;
    // prevent the parent item click which also navigates
    try {
      e.stopPropagation();
    } catch (err) {}
    if (notif.read) return;

    // immediate UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
    );
    try {
      viewedLocallyRef.current.add(String(notif.id));
      try {
        viewedSignaturesRef.current.add(notifSignature(notif));
      } catch (e) {}
    } catch (e) {}
    setNotifCount((c) => Math.max(0, c - 1));

    // persist to server
    (async () => {
      try {
        const token = ctxToken || localStorage.getItem("token");
        await fetch("http://localhost:5000/notifications/mark-read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ notificationId: notif.id }),
        });
      } catch (err) {
        console.warn("Failed to persist single notification read (dot)", err);
        // revert optimistic update
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: false } : n))
        );
        setNotifCount((c) => c + 1);
      }
    })();
  };
  // Helper to compute timestamp and localized timeString without falling back to Date.now()
  const normalizeTimestamp = (maybeTs) => {
    try {
      if (maybeTs == null) return { ts: null, timeString: null };
      if (
        typeof maybeTs === "object" &&
        typeof maybeTs.toNumber === "function"
      ) {
        const v = maybeTs.toNumber();
        return {
          ts: Number.isFinite(v) ? v : null,
          timeString: Number.isFinite(v)
            ? new Date(v).toLocaleString("vi-VN")
            : null,
        };
      }
      const n = Number(maybeTs);
      if (!Number.isNaN(n) && Number.isFinite(n))
        return { ts: n, timeString: new Date(n).toLocaleString("vi-VN") };
    } catch (e) {
      // ignore
    }
    return { ts: null, timeString: null };
  };
  const [showConnections, setShowConnections] = useState(false);
  const [isHomeActive, setIsHomeActive] = useState(true);

  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, []);

  useEffect(() => {
    // Keep a reference to the local notification handler in the outer
    // scope of this effect so cleanup can remove it safely even when
    // the effect is re-run (e.g. when `user` changes).
    let onLocalNotif = null;
    // Setup socket for notifications when user logs in
    if (!user) return;
    // Prefer token from AuthContext (ctxToken) because AuthContext may
    // intentionally delay/avoid writing to localStorage for safety. Fall
    // back to localStorage only if ctxToken is not available.
    const token = ctxToken || localStorage.getItem("token");
    try {
      const socket = ioClient(SOCKET_URL, { auth: { token } });
      socketRef.current = socket;
      socket.on("connect", () =>
        console.log(
          "Header socket connected: user=",
          user?.id,
          "socketId=",
          socket.id
        )
      );

      // forward new post events so Feed can react in real-time
      socket.on("post:created", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:post:created", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward post:created", e);
        }
      });
      // forward post updates so Feed and PostCard can refresh in real-time
      socket.on("post:updated", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:post:updated", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward post:updated", e);
        }
      });
      // forward new comments so PostCard can insert them in real-time
      socket.on("post:commented", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:post:commented", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward post:commented", e);
        }
      });
      // forward post deletions to window so Feed can remove posts in real-time
      socket.on("post:deleted", (payload) => {
        try {
          console.debug("Header socket received post:deleted", payload);
          window.dispatchEvent(
            new CustomEvent("app:post:deleted", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward post:deleted", e);
        }
      });
      socket.on("notification:new", (payload) => {
        console.log("Header received notification:new", payload);
        // Ignore self-generated notifications
        try {
          if (
            payload &&
            typeof payload.fromUserId !== "undefined" &&
            user &&
            String(payload.fromUserId) === String(user.id)
          ) {
            return;
          }
          if (
            payload &&
            (!payload.fromUserId ||
              typeof payload.fromUserId === "undefined") &&
            payload.fromName &&
            user
          ) {
            const n = String(payload.fromName || "")
              .trim()
              .toLowerCase();
            const dn = String(user.displayName || "")
              .trim()
              .toLowerCase();
            const un = String(user.username || "")
              .trim()
              .toLowerCase();
            if (n && (n === dn || n === un)) return;
          }
        } catch (e) {
          // ignore
        }

        const fromName =
          payload.fromName || payload.from || payload.fromUserId || "Someone";
        const type = payload.type || "info";
        const notifId =
          payload.notifId ||
          payload.id ||
          `${payload.fromUserId || "anon"}-${
            payload.postId || "nopost"
          }-${type}-${payload.commentId || ""}-${payload.threadId || ""}`;
        const { ts: payloadTs, timeString } = normalizeTimestamp(
          payload.timestamp || payload.createdAt
        );

        const incomingReadFlag =
          typeof payload.read === "boolean" ? payload.read : false;
        const isReadFinal = incomingReadFlag; // do not auto-mark based on dropdown

        try {
          const payloadSig = notifSignature({
            fromUserId: payload.fromUserId,
            postId: payload.postId,
            type,
            commentId: payload.commentId,
            commentText: payload.commentText,
          });
          if (viewedSignaturesRef.current.has(payloadSig)) {
            console.debug(
              "Skipping socket notification because signature was viewed locally",
              payloadSig
            );
            return;
          }
        } catch (e) {}

        setNotifications((prev) => {
          const existsById = prev.some((n) => n.id === notifId);
          if (existsById) {
            return prev.map((n) =>
              n.id === notifId
                ? {
                    ...n,
                    type,
                    message: payload.message || n.message,
                    timestamp:
                      payload.timestamp || n.timestamp || payloadTs || null,
                    timeString:
                      n.timeString || timeString || n.timeString || null,
                    read: isReadFinal,
                    commentId: payload.commentId || n.commentId,
                    threadId: payload.threadId || n.threadId,
                    commentText: payload.commentText || n.commentText,
                  }
                : n
            );
          }

          const signatureIndex = prev.findIndex(
            (n) =>
              n.fromUserId === payload.fromUserId &&
              n.postId === payload.postId &&
              n.type === type
          );
          if (signatureIndex !== -1) {
            const existing = prev[signatureIndex];
            const updated = {
              ...existing,
              type,
              message: payload.message || existing.message,
              timestamp:
                payload.timestamp || existing.timestamp || payloadTs || null,
              timeString: existing.timeString || timeString || null,
              read: isReadFinal,
              commentId: payload.commentId || existing.commentId,
              threadId: payload.threadId || existing.threadId,
              commentText: payload.commentText || existing.commentText,
            };
            const copy = prev.slice();
            copy[signatureIndex] = updated;
            return uniqueById(copy);
          }

          if (!isReadFinal) setNotifCount((c) => c + 1);
          const newItem = {
            id: notifId,
            type,
            message: payload.message,
            from: fromName,
            fromUserId: payload.fromUserId,
            postId: payload.postId,
            commentId: payload.commentId || null,
            threadId: payload.threadId || null,
            commentText: payload.commentText || null,
            timestamp: payloadTs || null,
            timeString: timeString || null,
            read: isReadFinal,
          };
          return uniqueById(dedupeBySignature([newItem, ...(prev || [])]));
        });
      });
      window.addEventListener("app:notification:new", onLocalNotif);
      // forward post likes updates to window so PostCard / Feed can listen
      socket.on("post:likes:update", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:post:likes:update", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward post:likes:update", e);
        }
      });

      // forward follow/unfollow events so other UI can react in real-time
      socket.on("user:follow", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:follow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:follow", e);
        }
        try {
          // if this client is the target (someone followed this user), trigger an update
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {
          // ignore
        }
      });
      socket.on("connections:update", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:connections:update", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward connections:update", e);
        }
      });
      socket.on("user:unfollow", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:unfollow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:unfollow", e);
        }
        try {
          // if this client is the target (someone unfollowed this user), trigger an update
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {
          // ignore
        }
      });
      // forward ack events (sent back to the actor) so the user who performed the action
      // also receives the same window event and UI can update immediately
      socket.on("user:follow:ack", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:follow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:follow:ack", e);
        }
        try {
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {}
      });
      socket.on("user:unfollow:ack", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:unfollow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:unfollow:ack", e);
        }
        try {
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {}
      });

      // forward user profile updates (avatar/displayName changes)
      socket.on("user:updated", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:updated", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:updated", e);
        }
        try {
          // if this client updated their own profile, refresh local user info
          if (payload && payload.user && payload.user.id === user?.id) {
            updateUserOnly(payload.user);
          }
        } catch (e) {}
      });
      socket.on("user:created", (payload) => {
        try {
          console.log(
            "Header socket received user:created:",
            payload && payload.user && payload.user.username,
            payload && payload.user && payload.user.id
          );
          window.dispatchEvent(
            new CustomEvent("app:user:created", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:created", e);
        }
      });

      // handle notification removals when someone unlikes
      socket.on("notification:remove", (payload) => {
        try {
          console.log("Header received notification:remove", payload);
          setNotifications((prev) => {
            if (!payload) return prev;
            let newList = prev;
            // If server provided explicit notifIds, only remove those exact ids.
            // Compare as strings to avoid type mismatches (Neo4j integers etc).
            if (
              Array.isArray(payload.notifIds) &&
              payload.notifIds.length > 0
            ) {
              // Server provided explicit notification ids that were deleted.
              // Remove any local notification whose id matches — do not
              // try to be too clever on the client-side. The server is
              // authoritative for which Notification nodes were deleted
              // (this happens on post delete), so remove them all locally.
              const idsToRemove = new Set(
                payload.notifIds.map((i) => String(i))
              );
              newList = prev.filter((n) => !idsToRemove.has(String(n.id)));
            } else if (payload.fromUserId && payload.postId && payload.type) {
              // Fallback: remove only notifications that match the exact triple
              // (fromUserId, postId, type) to avoid overly-broad removals.
              newList = prev.filter(
                (n) =>
                  !(
                    String(n.fromUserId) === String(payload.fromUserId) &&
                    String(n.postId) === String(payload.postId) &&
                    n.type === payload.type
                  )
              );
            }

            // Update badge count by the number of unread notifications that were removed
            const removedUnread = prev.filter(
              (n) =>
                !n.read && !newList.some((m) => String(m.id) === String(n.id))
            ).length;
            if (removedUnread > 0)
              setNotifCount((c) => Math.max(0, c - removedUnread));

            return uniqueById(newList);
          });
        } catch (e) {
          console.warn("Failed to process notification:remove", e);
        }
      });
    } catch (err) {
      console.error("Header socket init failed", err);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      // Remove local notification listener only if it was registered
      try {
        if (typeof onLocalNotif === "function") {
          window.removeEventListener("app:notification:new", onLocalNotif);
        }
      } catch (e) {
        // defensive: ignore any removal errors
      }
    };
  }, [user]);

  // Keep the unread badge count authoritative by deriving it from the
  // current notifications array. This avoids races where different code
  // paths increment/decrement the count and temporarily put it out of sync.
  useEffect(() => {
    try {
      const unread = (notifications || []).filter((n) => !n.read).length;
      setNotifCount(unread);
    } catch (e) {
      // defensive: do nothing on error
    }
  }, [notifications]);

  // Polling fallback: fetch notifications every 5s to catch any missed realtime emits
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    let pollIntervalId = null;
    let pollingInFlight = false;
    const poll = async () => {
      if (!mounted) return;
      if (pollingInFlight) return; // avoid overlapping polls
      if (document && document.visibilityState !== "visible") return; // only poll when page visible
      pollingInFlight = true;
      try {
        const token = ctxToken || localStorage.getItem("token");
        const res = await fetch("http://localhost:5000/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data) || !mounted) return;
        const normalized = data
          .map((n) => {
            const { ts, timeString } =
              n.timestamp || n.timeString
                ? {
                    ts: n.timestamp == null ? null : Number(n.timestamp),
                    timeString: n.timeString || null,
                  }
                : normalizeTimestamp(n.createdAt);
            // if this id or logical signature was viewed locally, preserve read=true locally
            const wasViewedLocally =
              viewedLocallyRef.current.has(String(n.id)) ||
              viewedSignaturesRef.current.has(notifSignature(n));
            return {
              id: n.id,
              type: n.type,
              message: n.message,
              from: n.fromName || n.from || "Someone",
              fromUserId: n.fromUserId,
              postId: n.postId,
              commentId: n.commentId || null,
              threadId: n.threadId || null,
              commentText: n.commentText || null,
              timestamp: ts || null,
              timeString: timeString || null,
              read: wasViewedLocally ? true : n.read === true,
            };
          })
          .sort((a, b) => {
            if (a.timestamp == null && b.timestamp == null) return 0;
            if (a.timestamp == null) return 1;
            if (b.timestamp == null) return -1;
            return Number(b.timestamp) - Number(a.timestamp);
          });

        // Merge server list with local realtime list, preferring server data for authoritative fields
        // remove any normalized items that have been viewed logically
        const filtered = normalized.filter(
          (n) => !viewedSignaturesRef.current.has(notifSignature(n))
        );
        setNotifications((prev) =>
          uniqueById(dedupeBySignature([...filtered, ...(prev || [])]))
        );
        const unread = normalized.filter((n) => !n.read).length;
        setNotifCount(unread);
      } catch (e) {
        console.warn("Polling notifications failed", e);
      } finally {
        pollingInFlight = false;
      }
    };

    const startPolling = () => {
      if (pollIntervalId) return;
      // run immediately then every 15s when visible
      poll();
      pollIntervalId = setInterval(poll, 15000);
    };

    const stopPolling = () => {
      if (pollIntervalId) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    };

    // Start only when page is visible
    if (typeof document !== "undefined") {
      if (document.visibilityState === "visible") startPolling();
      const onVisibility = () => {
        if (document.visibilityState === "visible") startPolling();
        else stopPolling();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        mounted = false;
        stopPolling();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
    return () => {
      mounted = false;
      stopPolling();
    };
  }, [user, ctxToken]);

  // Hydrate persisted notifications from server when user logs in
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = ctxToken || localStorage.getItem("token");
        const res = await fetch("http://localhost:5000/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          // Normalize timestamps (Neo4j Integer) and sort newest-first
          const normalized = data
            .map((n) => {
              // Prefer explicit timestamp/timeString from server if provided
              const { ts, timeString } =
                n.timestamp || n.timeString
                  ? {
                      ts: n.timestamp == null ? null : Number(n.timestamp),
                      timeString: n.timeString || null,
                    }
                  : normalizeTimestamp(n.createdAt);
              // preserve any existing client-side timeString/timestamp (from realtime)
              // Try to match by id first, then by logical signature so realtime
              // notifications (which may use a different id) keep their display time.
              const existingById = (notifications || []).find(
                (x) => x.id === n.id
              );
              const existingBySig = (notifications || []).find(
                (x) => notifSignature(x) === notifSignature(n)
              );
              const existing = existingById || existingBySig || null;
              const wasViewedLocally = viewedLocallyRef.current.has(
                String(n.id)
              );
              return {
                id: n.id,
                type: n.type,
                message: n.message,
                from: n.fromName || n.from || "Someone",
                fromUserId: n.fromUserId,
                postId: n.postId,
                commentText:
                  n.commentText || (existing && existing.commentText) || null,
                commentId: n.commentId || null,
                threadId: n.threadId || null,
                timestamp: ts || (existing && existing.timestamp) || null,
                timeString:
                  timeString || (existing && existing.timeString) || null,
                read: wasViewedLocally ? true : n.read === true, // respect persisted read but prefer local view
              };
            })
            .sort((a, b) => {
              // place items with timestamps first (newest -> oldest), then items without timestamps
              if (a.timestamp == null && b.timestamp == null) return 0;
              if (a.timestamp == null) return 1;
              if (b.timestamp == null) return -1;
              return Number(b.timestamp) - Number(a.timestamp);
            });

          // Filter out any normalized items whose logical signature was
          // already viewed locally so they don't reappear briefly.
          const filtered = normalized.filter(
            (n) => !viewedSignaturesRef.current.has(notifSignature(n))
          );
          setNotifications(uniqueById(dedupeBySignature(filtered)));

          // Compute unread count from persisted read flags when available, otherwise fall back to total
          const unread = normalized.filter((n) => !n.read).length;
          setNotifCount(
            typeof unread === "number" ? unread : normalized.length
          );
        }
      } catch (err) {
        console.warn("Failed to load persisted notifications", err);
      }
    })();
  }, [user]);

  const handleUpdateProfile = () => {
    setMenuOpen(false);
    setShowUpdateProfile(true);
  };

  const handleChangePassword = () => {
    setMenuOpen(false);
    setShowChangePassword(true);
  };

  // ...existing code...

  const handleNotificationClick = () => {
    // Only toggle the dropdown on bell clicks. Do NOT mark notifications
    // as read just by opening/closing the dropdown. The small blue dot
    // remains the explicit control for marking a single notification read.
    const willOpen = !showNotifications;
    setShowNotifications(willOpen);
    openedByUserRef.current = willOpen;
    // Do not modify notifications, viewedLocally, signatures, or call server.
  };

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
        // reset user-open tracking when dropdown closes due to outside click
        openedByUserRef.current = false;
      }
    }
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
    return () => {};
  }, [showNotifications]);

  // When connections modal opens, mark + button active and unset Home
  useEffect(() => {
    // If Connections, Chat, or Notifications are open, unset Home; otherwise Home is active
    if (showConnections || showChat || showNotifications)
      setIsHomeActive(false);
    else setIsHomeActive(true);
  }, [showConnections, showChat, showNotifications]);

  const avatarContent = () => {
    if (user?.avatarUrl)
      return (
        <img
          src={`http://localhost:5000${user.avatarUrl}`}
          alt="avatar"
          className="w-8 h-8 rounded-full object-cover shadow-avatar"
        />
      );
    return (
      <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-avatar">
        {(user?.displayName?.[0] || user?.username?.[0])?.toUpperCase() || "U"}
      </div>
    );
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm z-50">
        <div className="flex max-w-7xl w-full gap-10 mx-auto px-6 items-center justify-between h-20">
          {/* Logo */}
          <div className="text-2xl font-black uppercase text-blue-800 font-['Inter',sans-serif] tracking-wide">
            MẠNG XÃ HỘI MINI
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-2xl mx-8 relative">
            <div className="relative">
              <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="text"
                placeholder="Tìm kiếm người dùng, bài viết..."
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-base text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200 font-['Inter',sans-serif] shadow-sm"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <button
                  aria-label="Trang chủ"
                  className={`p-3 rounded-xl transition-all duration-200 ${
                    isHomeActive
                      ? "bg-blue-100 text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
                  }`}
                  onClick={() => {
                    setIsHomeActive(true);
                    setShowChat(false);
                    setShowConnections(false);
                    openedByUserRef.current = false;
                  }}
                >
                  <AiOutlineHome className="w-5 h-5" />
                </button>

                <button
                  aria-label="Kết nối"
                  className={`p-3 rounded-xl transition-all duration-200 ${
                    showConnections
                      ? "bg-blue-100 text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
                  }`}
                  onClick={() => setShowConnections((s) => !s)}
                >
                  <FaUsers className="w-5 h-5" />
                </button>

                <button
                  onClick={() => {
                    // open chat and ensure connections modal is closed
                    setShowConnections(false);
                    setShowChat(true);
                  }}
                  aria-label="Tin nhắn"
                  className={`p-3 rounded-xl transition-all duration-200 ${
                    showChat
                      ? "bg-blue-100 text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
                  }`}
                >
                  <FiMessageCircle className="w-5 h-5" />
                </button>

                <div className="relative" ref={notifRef}>
                  <button
                    aria-label="Thông báo"
                    className={`p-3 rounded-xl transition-all duration-200 relative ${
                      showNotifications
                        ? "bg-blue-100 text-blue-600 shadow-sm"
                        : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
                    }`}
                    onClick={handleNotificationClick}
                  >
                    <div className="relative">
                      <FaBell className="w-5 h-5" />
                      {notifCount > 0 && (
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center font-medium">
                          {notifCount}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 max-h-96 overflow-y-auto">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900 font-['Inter',sans-serif]">
                          Thông báo
                        </h3>
                      </div>

                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500 text-sm font-['Inter',sans-serif]">
                          Chưa có thông báo nào
                        </div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto">
                          {notifications.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationItemClick(notif)}
                              role="button"
                              tabIndex={0}
                              className={`px-4 py-3 border-b last:border-b-0 transition-colors flex items-start gap-3 cursor-pointer ${
                                !notif.read
                                  ? "bg-gradient-to-r from-blue-50 to-white border-l-4 border-blue-400"
                                  : "hover:bg-gray-50"
                              }`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ")
                                  handleNotificationItemClick(notif);
                              }}
                            >
                              <div className="w-12 h-12 bg-gradient-to-r from-pink-400 to-red-400 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-md">
                                ❤️
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-900 font-['Inter',sans-serif]">
                                  <span className="font-semibold text-gray-900 mr-1">
                                    {notif.from}
                                  </span>
                                  <span className="text-gray-800">
                                    {notif.message
                                      ? notif.message
                                      : notif.type === "comment"
                                      ? "đã bình luận vào bài viết của bạn"
                                      : notif.type === "reply"
                                      ? "đã trả lời bình luận của bạn"
                                      : notif.type === "like"
                                      ? "đã thích bài viết của bạn"
                                      : "đã tương tác với bài viết của bạn"}
                                  </span>
                                </p>
                                {notif.commentText && (
                                  <p className="text-sm text-gray-700 mt-1 truncate max-w-full font-['Inter',sans-serif]">
                                    "
                                    {notif.commentText.length > 120
                                      ? notif.commentText.slice(0, 120) + "..."
                                      : notif.commentText}
                                    "
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 mt-1 font-['Inter',sans-serif]">
                                  {notif.timeString ||
                                    (typeof notif.timestamp === "number" &&
                                    !Number.isNaN(Number(notif.timestamp))
                                      ? new Date(
                                          Number(notif.timestamp)
                                        ).toLocaleString("vi-VN")
                                      : "")}
                                </p>
                              </div>
                              {!notif.read && (
                                <button
                                  onClick={(e) => handleDotClick(e, notif)}
                                  className="w-3 h-3 bg-blue-600 rounded-full flex-shrink-0 mt-2 shadow-sm border-0"
                                  aria-label="Đánh dấu đã xem"
                                  title="Đánh dấu đã xem"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* end notifications list */}
                    </div>
                  )}
                </div>

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen((s) => !s)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-all duration-200"
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                  >
                    {avatarContent()}
                    <FaChevronDown className="text-gray-500 w-3 h-3" />
                  </button>

                  {menuOpen && (
                    <div className="absolute left-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 translate-x-4 md:translate-x-6">
                      <button
                        onClick={handleUpdateProfile}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 font-['Inter',sans-serif] transition-colors"
                      >
                        Cập nhật tài khoản
                      </button>
                      <button
                        onClick={handleChangePassword}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 font-['Inter',sans-serif] transition-colors"
                      >
                        Đổi mật khẩu
                      </button>
                      <div className="border-t my-1 mx-2" />
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 font-['Inter',sans-serif] transition-colors"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-sm font-['Inter',sans-serif]"
              >
                Đăng nhập
              </button>
            )}
          </div>
        </div>
      </header>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {showUpdateProfile && (
        <UpdateProfileModal onClose={() => setShowUpdateProfile(false)} />
      )}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      {showConnections && (
        <ConnectionsModal
          isOpen={showConnections}
          onClose={() => setShowConnections(false)}
        />
      )}

      {/* Chat Modal - OpenChat */}
      {showChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-5xl h-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Tin nhắn</h2>
              <button
                onClick={() => setShowChat(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPage />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Header;
