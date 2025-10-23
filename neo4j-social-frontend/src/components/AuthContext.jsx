import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import api from "../services/api";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [isLoading, setIsLoading] = useState(true);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const socketRef = useRef(null);

  // Restore user data from token when app loads
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    // if we have a cached user in localStorage, set it immediately so UI stays logged in
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) setUser(JSON.parse(rawUser));
    } catch (e) {
      // ignore parse errors
    }

    if (storedToken) {
      setToken(storedToken);
      (async () => {
        try {
          console.log("AuthContext: attempting to restore user from /users/me");
          const res = await api.get("/users/me");
          const userPayload = res.data?.user ?? res.data;
          console.log("AuthContext: /users/me response", res.data);
          if (userPayload) {
            setUser(userPayload);
            try {
              localStorage.setItem("user", JSON.stringify(userPayload));
            } catch (e) {}
            // redirect admin to admin page when restoring session
            try {
              const isAdminRestored =
                userPayload?.role === "admin" ||
                String(userPayload?.username) === "admin";
              if (
                isAdminRestored &&
                typeof window !== "undefined" &&
                window.location.pathname !== "/admin"
              ) {
                window.location.pathname = "/admin";
              }
            } catch (e) {}
          }
        } catch (err) {
          console.warn(
            "Auth restore failed (will keep cached token/user)",
            err
          );
        }
      })();
    }
    setIsLoading(false);
  }, []);

  // Listen for cross-tab localStorage changes to token/user to avoid silent
  // session takeover. If a different token is written by another tab we log a
  // warning so the developer (or user) can take action; if token is removed we
  // clear local auth state.
  useEffect(() => {
    function onStorage(e) {
      try {
        if (e.key === "token") {
          console.log(
            "AuthContext: storage event token changed",
            e.oldValue,
            e.newValue
          );
          if (!e.newValue) {
            // token was removed in another tab - sign out locally
            console.log(
              "AuthContext: token removed in another tab, clearing local auth state"
            );
            setUser(null);
            setToken(null);
          } else if (e.newValue !== token) {
            // token changed in another tab - notify
            console.warn(
              "AuthContext: token changed in another tab. This tab will keep its active session to avoid unexpected switches."
            );
          }
        }
      } catch (err) {
        console.warn("AuthContext: storage event handler error", err);
      }
    }
    // Also listen for forced logout broadcast from other tabs/windows
    function onStorageBroadcast(e) {
      try {
        if (e.key === "auth_force_logout") {
          console.log(
            "AuthContext: received auth_force_logout broadcast, clearing local auth state"
          );
          setUser(null);
          setToken(null);
          try {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
          } catch (ee) {}
          try {
            window.location.pathname = "/login";
          } catch (ee) {}
        }
      } catch (err) {
        console.warn("AuthContext: storage broadcast handler error", err);
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("storage", onStorageBroadcast);
    return () => window.removeEventListener("storage", onStorage);
  }, [token]);

  // open socket to listen for server-sent user updates (keeps header in sync)
  useEffect(() => {
    if (!token) return;
    try {
      const socket = ioClient(SOCKET_URL, { auth: { token } });
      socketRef.current = socket;
      socket.on("connect", () =>
        console.log("AuthContext: socket connected", socket.id)
      );
      socket.on("user:updated", (payload) => {
        try {
          const updated = payload?.user || payload;
          // Only update local user if the incoming update is for the same user id.
          // Some server code broadcasts user:updated to all connected sockets;
          // applying those blindly would overwrite the active session in other tabs.
          try {
            const incomingId =
              updated && (updated.id || updated.userId || updated._id);
            const currentId = user && (user.id || user.userId || user._id);
            if (
              incomingId &&
              currentId &&
              String(incomingId) === String(currentId)
            ) {
              updateUserAndPersist(updated);
            } else {
              console.log(
                "AuthContext: ignoring user:updated for different user",
                { incomingId, currentId }
              );
            }
          } catch (inner) {
            console.warn(
              "AuthContext: failed to compare user ids for user:updated",
              inner
            );
          }
        } catch (e) {
          console.warn("AuthContext: failed to apply user:updated payload", e);
        }
      });
      // If server signals a status change for a user, and it affects the current
      // session's user, force a logout when the status becomes non-active
      socket.on("user:status:updated", (payload) => {
        try {
          const userId =
            payload && (payload.userId || payload.user?.id || payload.id);
          const status =
            payload &&
            (payload.status || (payload.user && payload.user.status));
          const currentId = user && (user.id || user.userId || user._id);
          if (userId && currentId && String(userId) === String(currentId)) {
            console.log(
              "AuthContext: received user:status:updated for current user",
              { userId, status }
            );
            if (String(status) !== "active") {
              try {
                // inform the user and clear session
                alert(
                  "Tài khoản của bạn đã bị khóa bởi quản trị viên. Bạn sẽ được đăng xuất."
                );
              } catch (e) {}
              try {
                // Clear local auth state via logout helper
                logout();
              } catch (e) {
                try {
                  localStorage.removeItem("token");
                  localStorage.removeItem("user");
                } catch (er) {}
              }
              // Broadcast to other tabs to ensure they also clear auth
              try {
                localStorage.setItem(
                  "auth_force_logout",
                  Date.now().toString()
                );
              } catch (e) {}
              try {
                if (socketRef.current) socketRef.current.disconnect();
              } catch (e) {}
              try {
                window.location.pathname = "/login";
              } catch (e) {}
            } else {
              // status became active again - refresh current user from server
              (async () => {
                try {
                  const res = await api.get("/users/me");
                  const refreshed = res.data?.user ?? res.data;
                  if (refreshed) updateUserAndPersist(refreshed);
                } catch (e) {
                  console.warn(
                    "AuthContext: failed to refresh user after status active",
                    e
                  );
                }
              })();
            }
          }
        } catch (e) {
          console.warn("AuthContext: error handling user:status:updated", e);
        }
      });
      socket.on("disconnect", () =>
        console.log("AuthContext: socket disconnected")
      );
    } catch (e) {
      console.warn("AuthContext: socket init failed", e);
    }
    return () => {
      try {
        if (socketRef.current) socketRef.current.disconnect();
      } catch (e) {}
      socketRef.current = null;
    };
  }, [token]);

  const login = (userData, authToken) => {
    console.log("AuthContext.login: saving user and token", {
      userData,
      authToken,
    });
    setUser(userData);
    setToken(authToken);
    try {
      const existingToken = localStorage.getItem("token");
      const existingUserRaw = localStorage.getItem("user");
      let existingUser = null;
      try {
        if (existingUserRaw) existingUser = JSON.parse(existingUserRaw);
      } catch (e) {
        existingUser = null;
      }

      // Only write token when:
      // - no token currently stored, OR
      // - the stored token belongs to the same user as the incoming userData
      // This prevents a background OAuth/redirect in another tab from silently
      // overwriting the active session in this tab.
      if (authToken) {
        if (!existingToken) {
          localStorage.setItem("token", authToken);
          console.log("AuthContext.login: token written to localStorage");
        } else if (
          existingUser &&
          userData &&
          String(existingUser.id) === String(userData.id)
        ) {
          // same user, safe to overwrite (refresh)
          localStorage.setItem("token", authToken);
          console.log("AuthContext.login: token refreshed for same user");
        } else if (existingToken && existingToken === authToken) {
          // same token value, nothing to do
        } else {
          console.warn(
            "AuthContext.login: token in localStorage belongs to a different user - skipping overwrite for safety"
          );
        }
      } else {
        // If no token provided, clear stored token to avoid stale sessions
        try {
          localStorage.removeItem("token");
          console.log(
            "AuthContext.login: no token returned, cleared stored token"
          );
        } catch (e) {}
      }

      if (userData) {
        localStorage.setItem("user", JSON.stringify(userData));
        console.log("AuthContext.login: user written to localStorage");
      }
    } catch (e) {
      console.warn(
        "AuthContext.login: failed to write auth data to localStorage",
        e
      );
    }

    // If this account is an admin, navigate to the standalone admin page
    try {
      const isAdmin =
        userData?.role === "admin" || String(userData?.username) === "admin";
      if (
        isAdmin &&
        typeof window !== "undefined" &&
        window.location.pathname !== "/admin"
      ) {
        window.location.pathname = "/admin";
      }
    } catch (e) {
      // ignore navigation errors
    }
  };

  // Function để update user mà KHÔNG lưu localStorage
  const updateUserOnly = (userData) => {
    console.log(
      "🔄 AuthContext: Updating user data (no localStorage):",
      userData
    );
    console.log("🔄 AuthContext: Previous user data:", user);

    // Tạo object mới để đảm bảo React detect thay đổi
    const newUserData = { ...userData };
    setUser(newUserData);

    // Force re-render tất cả components
    setUpdateTrigger((prev) => prev + 1);

    console.log("🔄 AuthContext: User updated successfully (no localStorage)");
  };

  // Persisting update: keep localStorage in sync when updating user via this helper
  const updateUserAndPersist = (userData) => {
    updateUserOnly(userData);
    try {
      localStorage.setItem("user", JSON.stringify(userData));
      console.log("AuthContext: persisted updated user to localStorage");
    } catch (e) {
      console.warn("AuthContext: failed to persist updated user", e);
    }
  };

  // Không cần updateUser với localStorage nữa

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch (e) {}
    // localStorage.removeItem("user"); // Không cần nữa
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        updateUserOnly: updateUserAndPersist,
        isLoading,
        setUser: updateUserAndPersist,
        updateTrigger,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
