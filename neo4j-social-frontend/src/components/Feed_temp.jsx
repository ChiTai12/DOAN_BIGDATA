import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import CreatePost from "./CreatePost";
import PostCard from "./PostCard";
import api from "../services/api";

function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await api.get("/posts/feed");
      setPosts(response.data);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewPost = () => {
    fetchPosts(); // Refresh posts after new post
  };

  const handleDeletePost = (deletedPostId) => {
    // Remove post from local state immediately for better UX
    setPosts((prevPosts) =>
      prevPosts.filter((item) => item.post.id !== deletedPostId)
    );
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="animate-pulse space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-gray-300 rounded-lg p-4"
            >
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {user && <CreatePost onPostCreated={handleNewPost} />}

      <div className="space-y-6">
        {posts.length === 0 ? (
          <div className="bg-white border border-gray-300 rounded-lg p-8 text-center">
            <p className="text-gray-500">
              No posts yet. Be the first to share something!
            </p>
          </div>
        ) : (
          posts.map((item) => (
            <PostCard
              key={item.post.id}
              post={item.post}
              author={item.author}
              onDelete={handleDeletePost}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default Feed;
