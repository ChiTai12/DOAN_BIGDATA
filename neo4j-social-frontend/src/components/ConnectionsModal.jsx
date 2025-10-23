import React, { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";
import Swal from "sweetalert2";

// Modern React Icons
function UserPlusIcon({ className = "w-4 h-4" }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
      />
    </svg>
  );
}

function UserMinusIcon({ className = "w-4 h-4" }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
      />
    </svg>
  );
}

function TrashIcon({ className = "w-4 h-4" }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

export default function ConnectionsModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await api.get("/users/connections");
      // res.data => { following: [userObjs], followers: [userObjs] }
      setFollowing(res.data.following || []);
      setFollowers(res.data.followers || []);
    } catch (e) {
      console.error("Failed to load connections", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadConnections();
  }, [isOpen]);

  // Listen for server-sent detailed connections update and apply immediately
  useEffect(() => {
    const handler = (e) => {
      try {
        const payload = e.detail || {};
        // If the payload contains explicit lists, apply them. If targetId is
        // present, ensure it matches the current user. If targetId is missing
        // (some servers may omit it), allow update when the modal is open so
        // the UI reflects the latest server-side state immediately.
        if (payload.following || payload.followers) {
          if (!payload.targetId || payload.targetId === user?.id || isOpen) {
            setFollowing(payload.following || []);
            setFollowers(payload.followers || []);
          }
        } else if (payload.targetId && payload.targetId === user?.id) {
          setFollowing(payload.following || []);
          setFollowers(payload.followers || []);
        }
      } catch (err) {
        console.warn("Failed to apply connections:update", err);
      }
    };
    window.addEventListener("app:connections:update", handler);
    return () => window.removeEventListener("app:connections:update", handler);
  }, [user?.id, isOpen]);

  // Patch individual profile entries when a user's profile is updated
  useEffect(() => {
    function onUserUpdated(e) {
      const payload = e.detail || e;
      if (!payload || !payload.user) return;
      const updated = payload.user;
      try {
        setFollowing((prev) =>
          prev.map((p) => {
            try {
              if (!p) return p;
              if (p.id && updated.id && String(p.id) === String(updated.id))
                return { ...p, ...updated };
              if (
                p.username &&
                updated.username &&
                String(p.username) === String(updated.username)
              )
                return { ...p, ...updated };
            } catch (err) {}
            return p;
          })
        );
        setFollowers((prev) =>
          prev.map((p) => {
            try {
              if (!p) return p;
              if (p.id && updated.id && String(p.id) === String(updated.id))
                return { ...p, ...updated };
              if (
                p.username &&
                updated.username &&
                String(p.username) === String(updated.username)
              )
                return { ...p, ...updated };
            } catch (err) {}
            return p;
          })
        );
      } catch (err) {}
    }
    window.addEventListener("app:user:updated", onUserUpdated);
    return () => window.removeEventListener("app:user:updated", onUserUpdated);
  }, []);

  // Listen for real-time follow/unfollow events forwarded by Header socket
  // Always register follow/unfollow handlers so updates forwarded by the
  // Header socket reach this component; only trigger a reload when the
  // modal is open to avoid unnecessary background requests.
  useEffect(() => {
    const onFollow = (e) => {
      if (isOpen) loadConnections();
    };
    const onUnfollow = (e) => {
      if (isOpen) loadConnections();
    };
    window.addEventListener("app:user:follow", onFollow);
    window.addEventListener("app:user:unfollow", onUnfollow);
    return () => {
      window.removeEventListener("app:user:follow", onFollow);
      window.removeEventListener("app:user:unfollow", onUnfollow);
    };
  }, [isOpen]);

  const handleToggleFollow = async (targetId, isFollowing) => {
    try {
      if (isFollowing) {
        // confirm unfollow
        const c = await Swal.fire({
          title: "Hủy theo dõi?",
          text: "Bạn có chắc muốn hủy theo dõi người này?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Hủy theo dõi",
          cancelButtonText: "Hủy",
        });
        if (!c.isConfirmed) return;
        await api.delete(`/users/follow/${targetId}`);
        await loadConnections();
        try {
          Swal.fire({
            position: "top-end",
            toast: true,
            showConfirmButton: false,
            timer: 1400,
            icon: "success",
            title: "Đã hủy theo dõi",
          });
        } catch (e) {}
      } else {
        await api.post(`/users/follow/${targetId}`);
        await loadConnections();
        try {
          Swal.fire({
            position: "top-end",
            toast: true,
            showConfirmButton: false,
            timer: 1400,
            icon: "success",
            title: "Đã theo dõi",
          });
        } catch (e) {}
      }

      // dispatch a local event so other UI in the same tab updates immediately
      try {
        const payload = { followerId: user?.id, followingId: targetId };
        const evtName = isFollowing ? "app:user:unfollow" : "app:user:follow";
        window.dispatchEvent(new CustomEvent(evtName, { detail: payload }));
      } catch (e) {
        /* ignore */
      }
    } catch (e) {
      console.error("Follow toggle failed", e);
      try {
        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: "Không thể thay đổi trạng thái theo dõi.",
        });
      } catch (e) {}
    }
  };

  if (!isOpen) return null;
  // compute a set of ids the current user is following for quick lookup
  const followingSet = new Set(following.map((u) => u.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-start md:items-center justify-center p-6">
      <div className="bg-white rounded-lg w-full max-w-6xl shadow-xl overflow-hidden ring-1 ring-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-3xl font-semibold">Kết nối</h2>
            <p className="text-base text-gray-500">
              Quản lý những người bạn theo dõi và người đang theo dõi bạn
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md bg-gradient-to-r from-slate-600 to-gray-700 text-white font-medium hover:from-slate-700 hover:to-gray-800 shadow-md transition transform hover:scale-105"
              aria-label="Đóng kết nối"
            >
              <span className="uppercase tracking-wide">ĐÓNG</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-600">
              Đang tải kết nối…
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section>
                <h3 className="font-medium text-lg mb-3">Đang theo dõi</h3>
                <div className="space-y-4">
                  {following.length === 0 && (
                    <div className="text-sm text-gray-600">
                      Bạn chưa theo dõi ai.
                    </div>
                  )}
                  {following.map((profile) => (
                    <FollowRow
                      key={`f-${profile.id}`}
                      profile={profile}
                      isFollowing={true}
                      onToggle={handleToggleFollow}
                    />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="font-medium text-lg mb-3">Người theo dõi</h3>
                <div className="space-y-4">
                  {followers.length === 0 && (
                    <div className="text-sm text-gray-600">
                      Chưa có người theo dõi.
                    </div>
                  )}
                  {followers.map((profile) => (
                    <FollowRow
                      key={`r-${profile.id}`}
                      profile={profile}
                      isFollowing={followingSet.has(profile.id)}
                      isFollower={true}
                      onToggle={handleToggleFollow}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FollowRow({ profile, isFollowing, isFollower, onToggle }) {
  const { user } = useAuth();

  const handleRemoveFollower = async () => {
    if (!profile || !profile.id) return;
    try {
      const c = await Swal.fire({
        title: "Loại bỏ người theo dõi?",
        text: `Bạn có chắc muốn loại bỏ ${
          profile.displayName || profile.username
        } khỏi danh sách người theo dõi?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Loại bỏ",
        cancelButtonText: "Hủy",
      });
      if (!c.isConfirmed) return;
      await api.delete(`/users/remove-follower/${profile.id}`);
      // dispatch local event to refresh UI immediately
      window.dispatchEvent(
        new CustomEvent("app:user:unfollow", {
          detail: { followerId: profile.id, followingId: user?.id },
        })
      );
      try {
        Swal.fire({
          position: "top-end",
          toast: true,
          showConfirmButton: false,
          timer: 1400,
          icon: "success",
          title: "Đã loại bỏ",
        });
      } catch (e) {}
    } catch (e) {
      console.error("Failed to remove follower", e);
      try {
        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: "Không thể loại bỏ người theo dõi.",
        });
      } catch (e) {}
    }
  };

  const handleClick = () => {
    if (!profile || !profile.id) return;
    onToggle(profile.id, Boolean(isFollowing));
  };

  return (
    <div className="flex items-center justify-between p-5 rounded-lg shadow-sm hover:shadow-lg transition-colors duration-150 bg-gradient-to-r from-gray-50 to-white">
      <div className="flex items-center gap-4">
        {profile.avatarUrl ? (
          <img
            src={`http://localhost:5000${profile.avatarUrl}`}
            alt={profile.displayName || profile.username}
            className="w-12 h-12 rounded-full object-cover shadow-avatar"
          />
        ) : (
          <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold text-base shadow-avatar">
            {(profile.displayName || profile.username || "?")[0]}
          </div>
        )}

        <div>
          <div className="font-medium text-gray-800">
            {profile.displayName || profile.username}
          </div>
          <div className="text-sm text-gray-500">@{profile.username}</div>
          {profile.bio && (
            <div className="text-xs text-gray-400 mt-1">{profile.bio}</div>
          )}
        </div>
      </div>

      <div>
        {profile.id === user.id ? (
          <span className="text-sm text-gray-500">Bạn</span>
        ) : isFollower ? (
          <div className="relative">
            <button
              onClick={handleRemoveFollower}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-red-500 to-pink-600 text-white text-sm font-medium hover:from-red-600 hover:to-pink-700 shadow-md transition transform hover:scale-105"
              title="Loại bỏ người này khỏi danh sách theo dõi"
            >
              <TrashIcon className="w-4 h-4 text-white" />
              <span className="uppercase tracking-wide">LOẠI BỎ</span>
            </button>
          </div>
        ) : isFollowing ? (
          <button
            onClick={handleClick}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-orange-500 to-amber-600 text-white text-sm font-medium hover:from-orange-600 hover:to-amber-700 shadow-md transition transform hover:scale-105"
            title="Hủy theo dõi"
          >
            <UserMinusIcon className="w-4 h-4 text-white" />
            <span className="uppercase tracking-wide">HỦY THEO DÕI</span>
          </button>
        ) : (
          <button
            onClick={handleClick}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium hover:from-emerald-600 hover:to-teal-700 shadow-md transition transform hover:scale-105"
            title="Theo dõi"
          >
            <UserPlusIcon className="w-4 h-4 text-white" />
            <span className="uppercase tracking-wide">THEO DÕI</span>
          </button>
        )}
      </div>
    </div>
  );
}
