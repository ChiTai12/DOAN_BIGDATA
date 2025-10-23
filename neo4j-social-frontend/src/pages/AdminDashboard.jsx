import React, { useEffect, useState, useRef } from "react";
// Chart.js imports (optional dependency)
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);
import { useAuth } from "../components/AuthContext";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config.js";
import AdminDashboardMenu from "./AdminDashboardMenu";
import AdminPosts from "./AdminPosts";
import AdminReports from "./AdminReports";
import AdminUsers from "./AdminUsers";

const StatCard = ({ colorClass, title, value, icon }) => (
  <div className={`p-6 rounded-lg ${colorClass} text-white shadow-sm w-full`}>
    <div className="flex items-center justify-between">
      <div>
        <div className="text-3xl font-bold leading-tight">{value}</div>
        <div className="text-sm opacity-90 mt-1">{title}</div>
      </div>
      <div className="text-4xl opacity-90">{icon}</div>
    </div>
  </div>
);

const ActivityItem = ({ avatar, name, followers }) => (
  <div className="flex items-center gap-4 py-3">
    <img
      src={avatar}
      alt={name}
      className="w-12 h-12 rounded-full object-cover"
      onError={(e) => (e.target.style.display = "none")}
    />
    <div className="flex-1">
      <div className="text-lg font-semibold text-gray-900">{name}</div>
      <div className="text-sm text-gray-500">{followers} followers</div>
    </div>
    <div className="text-base font-bold text-gray-900">{followers}</div>
  </div>
);

const PostItem = ({ author, title, interactions, onClick }) => (
  <div
    className="flex items-center justify-between py-3 cursor-pointer"
    onClick={onClick}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "Enter") onClick && onClick();
    }}
  >
    {/* Left: flexible area that will truncate content when too long */}
    <div className="flex-1 min-w-0 text-base text-gray-800">
      <div className="flex items-center gap-2 min-w-0">
        {author && (
          <span
            className="font-semibold flex-shrink-0"
            style={{ marginRight: 8 }}
          >
            {author}
          </span>
        )}
        <span className="truncate" title={title}>
          {title}
        </span>
      </div>
    </div>

    {/* Right: fixed-width area for interactions so it never gets pushed out */}
    <div className="ml-4 w-12 flex-shrink-0 text-right text-lg font-semibold text-gray-900">
      {interactions}
    </div>
  </div>
);

export default function AdminDashboard() {
  // Hàm fetch số liệu từ backend
  const fetchStats = async () => {
    try {
      const response = await fetch("http://localhost:5000/stats");
      if (!response.ok) {
        console.error(
          "API /stats trả về lỗi:",
          response.status,
          response.statusText
        );
        return;
      }
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error("Lỗi khi gọi API /stats:", error);
    }
  };

  // Lần đầu load số liệu
  React.useEffect(() => {
    fetchStats();
  }, []);

  // Kết nối socket realtime, lắng nghe sự kiện stats:update
  React.useEffect(() => {
    const token = localStorage.getItem("token");
    const socket = ioClient(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    socket.on("connect", () => {
      // console.log("[AdminDashboard] Socket connected", socket.id);
    });
    socket.on("stats:update", () => {
      // console.log("[AdminDashboard] Nhận sự kiện stats:update, fetch lại số liệu");
      fetchStats();
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
  const { logout, user } = useAuth();
  const [stats, setStats] = useState({
    users: 0,
    posts: 0,
    comments: 0,
    likes: 0,
    messages: 0,
  });
  const [modalPost, setModalPost] = useState(null);
  const socketRef = useRef(null);

  // Map server-provided top users and posts into UI-friendly shape
  const topUsers = (stats.topUsers || []).map((u) => ({
    id: u.id,
    name: u.displayName || u.username || "-",
    avatar:
      u.avatarUrl && u.avatarUrl.startsWith("/")
        ? `${window.location.origin}${u.avatarUrl}`
        : u.avatarUrl || "/default-avatar.png",
    followers:
      typeof u.followers === "number" ? u.followers : Number(u.followers) || 0,
  }));

  const topPosts = (stats.topPosts || []).map((p) => ({
    id: p.id,
    title: p.title || "Untitled",
    author: p.authorName || "-",
    interactions:
      typeof p.interactions === "number"
        ? p.interactions
        : Number(p.interactions) || 0,
  }));

  // Chart data state (7-day user growth). If backend has /stats/trends use it, otherwise build from total users.
  const [trendData, setTrendData] = useState(null);

  useEffect(() => {
    // try fetching /stats/trends; fallback to generating fake 7-day points
    const fetchTrends = async () => {
      try {
        const r = await fetch(
          "http://localhost:5000/stats/trends?type=users&days=7"
        );
        if (r.ok) {
          const json = await r.json();
          // expect [{date: '2025-10-01', users: 123}, ...]
          setTrendData(json);
          return;
        }
      } catch (err) {
        // ignore, we'll fallback
      }

      // fallback: create 7-day series ending today using stats.users as last value
      const end = new Date();
      const days = 7;
      const base = toNumber(stats.users) || 0;
      const arr = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        const label = d.toISOString().slice(0, 10);
        // generate descending values so last day is `base`
        const val = Math.max(
          0,
          Math.round(base - (days - 1 - i) * Math.max(1, base / days))
        );
        arr.push({ date: label, users: val });
      }
      // ensure last point equals base
      if (arr.length > 0) arr[arr.length - 1].users = base;
      setTrendData(arr);
    };
    fetchTrends();
  }, [stats.users]);

  // Hàm fetch số liệu

  // Use topPosts from /stats (fallback to empty array)

  // Helper: convert Neo4j integer object to number
  function toNumber(val) {
    if (val && typeof val === "object" && typeof val.toNumber === "function")
      return val.toNumber();
    if (typeof val === "object" && typeof val.low === "number") return val.low;
    return typeof val === "number" ? val : 0;
  }

  // current path for sidebar active state
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar - visible on md+ */}
        <aside className="hidden md:flex md:fixed md:top-0 md:left-0 md:h-screen w-96 bg-gradient-to-b from-blue-900 to-blue-800 text-white shadow-inner z-20">
          <div className="px-6 py-8 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden">
                  <img
                    src="/logo.png"
                    alt="Admin logo"
                    className="w-10 h-10 object-contain"
                    onError={(e) => {
                      try {
                        e.target.onerror = null;
                        e.target.src = "/admin-logo.svg";
                      } catch {}
                    }}
                  />
                </div>
                <div className="text-lg font-semibold">
                  Mạng xã hội Mini Big data
                </div>
              </div>

              <nav className="mt-6">
                <ul className="mt-2 space-y-4">
                  <li
                    onClick={() => (window.location.pathname = "/admin")}
                    className={
                      "flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer " +
                      (currentPath === "/admin" || currentPath === "/admin/"
                        ? "bg-blue-600"
                        : "hover:bg-blue-700/60")
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 opacity-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 7h18M3 12h18M3 17h18"
                      />
                    </svg>
                    <span className="text-sm font-medium">Bảng điều khiển</span>
                  </li>

                  <li
                    onClick={() => (window.location.pathname = "/admin/posts")}
                    className={
                      "flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer " +
                      (currentPath === "/admin/posts"
                        ? "bg-blue-600"
                        : "hover:bg-blue-700/60")
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 opacity-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 8h10M7 12h6m-6 4h10M5 6h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z"
                      />
                    </svg>
                    <span className="text-sm">Quản Lý Bài Viết</span>
                  </li>

                  <li
                    onClick={() => (window.location.pathname = "/admin/users")}
                    className={
                      "flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer " +
                      (currentPath === "/admin/users"
                        ? "bg-blue-600"
                        : "hover:bg-blue-700/60")
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 opacity-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M5.121 17.804A9 9 0 1118.879 6.196 9 9 0 015.12 17.804z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    <span className="text-sm">Quản Lý Người Dùng</span>
                  </li>

                  <li
                    onClick={() =>
                      (window.location.pathname = "/admin/reports")
                    }
                    className={
                      "flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer " +
                      (currentPath === "/admin/reports"
                        ? "bg-blue-600"
                        : "hover:bg-blue-700/60")
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 opacity-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm">Báo cáo phản hồi</span>
                  </li>

                  <li className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-blue-700/60">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-6 w-6 opacity-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M11.049 2.927c.3-1.14 1.603-1.14 1.902 0a1.724 1.724 0 002.573 1.02c.952-.66 2.273.3 1.903 1.44-.3 1.14-.3 2.338 0 3.478.37 1.14-.951 2.1-1.902 1.44a1.724 1.724 0 00-2.573 1.02c-.299 1.14-1.602 1.14-1.902 0a1.724 1.724 0 00-2.573-1.02c-.951.66-2.273-.3-1.903-1.44.3-1.14.3-2.338 0-3.478-.37-1.14.951-2.1 1.902-1.44.86.6 1.974.06 2.573-1.02z"
                      />
                    </svg>
                    <span className="text-sm">Cài Đặt Cấu Hình</span>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="text-sm opacity-80 px-4">v1.0</div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 md:ml-96">
          <div className="max-w-7xl ml-8">
            {typeof window !== "undefined" &&
            window.location.pathname === "/admin/posts" ? (
              <AdminPosts />
            ) : typeof window !== "undefined" &&
              window.location.pathname === "/admin/users" ? (
              <AdminUsers />
            ) : typeof window !== "undefined" &&
              window.location.pathname === "/admin/reports" ? (
              <AdminReports />
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h1 className="text-3xl font-bold text-gray-900">
                    BẢNG ĐIỀU KHIỂN
                  </h1>
                  <div className="relative">
                    {/* Avatar dropdown cho admin */}
                    <AdminDashboardMenu logout={logout} admin={user} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8 md:ml-auto md:mr-8">
                  <StatCard
                    colorClass="bg-blue-600"
                    title="Người Dùng"
                    value={toNumber(stats.users)}
                    icon={
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M5.121 17.804A9 9 0 1118.879 6.196 9 9 0 015.12 17.804z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    }
                  />
                  <StatCard
                    colorClass="bg-red-500"
                    title="Bài Viết"
                    value={toNumber(stats.posts)}
                    icon={
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 8h10M7 12h6m-6 4h10M5 6h14a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1z"
                        />
                      </svg>
                    }
                  />
                  <StatCard
                    colorClass="bg-green-600"
                    title="Bình Luận"
                    value={toNumber(stats.comments)}
                    icon={
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4-.8L3 20l1.2-3.8A7.963 7.963 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    }
                  />
                  <StatCard
                    colorClass="bg-orange-500"
                    title="Lượt Thích"
                    value={toNumber(stats.likes)}
                    icon={
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 21.364 4.318 12.682a4.5 4.5 0 010-6.364z"
                        />
                      </svg>
                    }
                  />
                  <StatCard
                    colorClass="bg-indigo-600"
                    title="Tin Nhắn"
                    value={toNumber(stats.messages)}
                    icon={
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-8 w-8"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 8h10M7 12h6m-6 4h10M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4-.8L3 20l1.2-3.8A7.963 7.963 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                    }
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: large User Growth card */}
                  <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm min-h-[500px]">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">
                      Tăng trưởng người dùng
                    </h3>
                    <div className="h-[460px] rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400">
                      {trendData ? (
                        <Line
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                          }}
                          data={{
                            labels: trendData.map((p) => p.date),
                            datasets: [
                              {
                                label: "Users",
                                data: trendData.map((p) => p.users),
                                borderColor: "#2563eb",
                                backgroundColor: "rgba(37,99,235,0.1)",
                                tension: 0.3,
                              },
                            ],
                          }}
                        />
                      ) : (
                        "Chart placeholder"
                      )}
                    </div>
                  </div>

                  {/* Right: stacked cards */}
                  <div className="flex flex-col gap-6">
                    <div className="bg-white rounded-xl p-6 shadow-sm">
                      <h3 className="text-xl font-semibold text-gray-800 mb-4">
                        Hoạt động hàng đầu
                      </h3>
                      <div className="space-y-2">
                        {topUsers.map((u) => (
                          <ActivityItem
                            key={u.id}
                            avatar={u.avatar}
                            name={u.name}
                            followers={u.followers}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-6 shadow-sm">
                      <h3 className="text-xl font-semibold text-gray-800 mb-4">
                        Bài viết tương tác nhiều
                      </h3>
                      <div className="space-y-2">
                        {topPosts.map((p) => (
                          <PostItem
                            key={p.id}
                            author={p.author}
                            title={p.title}
                            interactions={p.interactions}
                            onClick={() => setModalPost(p)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
        {modalPost && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg w-11/12 max-w-2xl">
              <h4 className="text-lg font-semibold mb-2">
                {modalPost.author || "Người dùng"}
              </h4>
              <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                {modalPost.title}
              </div>
              <div className="mt-4 text-right">
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                  onClick={() => setModalPost(null)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
