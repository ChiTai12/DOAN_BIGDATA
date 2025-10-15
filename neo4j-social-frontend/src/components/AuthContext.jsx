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
          if (updated) updateUserAndPersist(updated);
        } catch (e) {
          console.warn("AuthContext: failed to apply user:updated payload", e);
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
      if (authToken) {
        localStorage.setItem("token", authToken);
        console.log("AuthContext.login: token written to localStorage");
      } else {
        // If no token provided, ensure we don't keep a stale token from a
        // previous session which could cause the app to call APIs as the
        // wrong user (observed as switching back to another account).
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
