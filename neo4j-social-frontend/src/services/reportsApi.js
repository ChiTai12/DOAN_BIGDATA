import axios from "axios";
import { API_BASE_URL } from "../config";

const instance = axios.create({ baseURL: API_BASE_URL });

export async function createReport({ postId, reason }) {
  const token = localStorage.getItem("token");
  const res = await instance.post(
    "/reports",
    { postId, reason },
    { headers: { Authorization: token ? `Bearer ${token}` : undefined } }
  );
  return res.data;
}

export default { createReport };
