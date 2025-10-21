# Pictogram - Social Network Frontend

React frontend cho Neo4j social backend, giao diện giống Instagram.

# DOAN_BIGDATA — Mạng xã hội Neo4j (toàn bộ)

Kho chứa này chứa một ứng dụng mạng xã hội nhỏ, backend Node.js/Express kết hợp Neo4j và frontend React (Vite). Ứng dụng minh hoạ các chức năng phổ biến: bài viết, bình luận, thích, thông báo và nhắn tin theo thời gian thực (Socket.IO).

## Tóm tắt nhanh

- Backend: Node.js + Express, Neo4j driver, Socket.IO cho realtime.
- Frontend: React (Vite) với các component cho auth, feed, messenger và các modal.
- CSDL: Neo4j (mô hình đồ thị: User, Post, Comment, Notification, Message).
- Upload: ảnh được lưu bằng `multer` vào thư mục `uploads/`.

## Cấu trúc repository

- `neo4j-social-backend/`: server Express, các route, truy vấn Cypher và phát sự kiện realtime.
  - `routes/posts.js` — quản lý post (tạo, lấy feed, cập nhật, xóa toàn diện), tạo comment và notification.
  - `routes/notifications.js` — lấy notification, đánh dấu đã đọc, xóa sạch, helper cho dev.
  - `routes/messages.js` — endpoint nhắn tin và hook realtime.
  - `db/driver.js` — tạo Neo4j driver và helper session.
- `neo4j-social-frontend/`: ứng dụng React (Vite).
  - `src/components/` — các component UI chính (Header, Feed, PostCard, Messenger, modal cập nhật hồ sơ...)
- `tools/` — script tiện ích (ví dụ backfill notifications). Lưu ý: đây là tiện ích vận hành, không phải nghiệp vụ người dùng.

## Những quy trình nghiệp vụ đã triển khai (thực tế trong code)

Những mục dưới đây là những workflow thực sự có trong code — không tính script hay utility:

- Xác thực & quản lý tài khoản
  - Đăng ký, Đăng nhập, Đăng xuất
  - Đổi mật khẩu
  - Cập nhật hồ sơ (displayName, avatar)
- Quản lý bài viết (vòng đời đầy đủ)
  - Tạo bài (hỗ trợ upload ảnh, trích emoji thành icon)
  - Lấy feed (hiển thị số lượt thích và flag liked)
  - Cập nhật bài (chỉ author)
  - Xóa bài (chỉ author) — xóa cascade comment, notification, likes
- Bình luận
  - Tạo bình luận (top-level hoặc reply bằng `parentId`)
  - Duy trì `threadId` và mối quan hệ `REPLIED_TO` giữa người dùng khi reply
- Thích (Like)
  - Like/unlike bài viết và đếm lượt like
- Thông báo
  - Tạo Notification khi có comment/reply và gắn tới người nhận
  - Lấy notifications, mark-read (1 / nhiều / tất cả), clear-all
  - Gửi realtime notification cho người nhận (Socket.IO)
- Nhắn tin
  - Gửi và lấy tin nhắn; realtime delivery qua socket
  - Lưu ý: chức năng xóa tin nhắn không có trong code hiện tại

Các script trong `tools/` (ví dụ `backfill_notifications.cjs`) và cơ chế lưu file (`uploads/`) là phần triển khai/hoạt động, không phải nghiệp vụ nghiệp chính của người dùng.

## Mô hình dữ liệu (khái quát)

- User: { id, username, displayName, passwordHash, ... }
- Post: { id, content, imageUrl, icon:[], createdAt, updatedAt }
- Comment: { id, content, parentId, threadId, icon, createdAt }
- Notification: { id, type, message, fromUserId, fromName, postId, commentId, commentText, createdAt, read }
- Message: { id, fromUserId, toUserId, content, createdAt }

Quan hệ mẫu:

- (User)-[:POSTED]->(Post)
- (User)-[:COMMENTED]->(Comment)-[:ABOUT]->(Post)
- (User)-[:LIKES]->(Post)
- (User)-[:HAS_NOTIFICATION]->(Notification)-[:ABOUT]->(Post)
- (User)-[:REPLIED_TO]->(User)

## Các API chính (tổng quan)

Dưới đây là tóm tắt các endpoint backend chính. Xem file route để biết chi tiết request/response.

- Auth & User

  - POST `/auth/register` — đăng ký tài khoản
  - POST `/auth/login` — lấy JWT
  - POST `/auth/change-password` — đổi mật khẩu (cần auth)
  - PUT `/users/:userId` — cập nhật hồ sơ (cần auth)

- Posts

  - POST `/posts/` — tạo bài (auth, multipart/form-data cho ảnh)
  - GET `/posts/feed` — lấy feed (có thể truyền Bearer token để biết `liked`)
  - PUT `/posts/:postId` — cập nhật bài (auth, chỉ author)
  - DELETE `/posts/delete/:postId` — xóa bài (auth, chỉ author, xóa cascade)
  - POST `/posts/:postId/comments` — tạo comment (auth)

- Notifications

  - GET `/notifications/` — lấy notifications cho user hiện tại (auth)
  - POST `/notifications/mark-read` — mark đã đọc (1 / mảng / tất cả)
  - POST `/notifications/clear-all` — mark-read + xóa tất cả notifications (auth)
  - GET `/notifications/all` — helper cho dev: liệt kê tất cả Notification nodes (không auth)

- Messages
  - Xem `neo4j-social-backend/routes/messages.js` — gửi và lấy tin nhắn; realtime qua socket

## Sự kiện realtime (Socket.IO)

- `post:created` — khi tạo bài mới (payload: author + post)
- `post:updated` — khi cập nhật bài
- `post:deleted` — khi xóa bài (gồm danh sách notification id đã xóa)
- `notification:new` — gửi tới người nhận khi có notification mới
- `notification:remove` — yêu cầu client xoá notification (ví dụ sau khi xóa post)
- `stats:update` — cập nhật số liệu dashboard

## Hướng dẫn phát triển (nhanh)

Project có nhiều package root: root `package.json`, `neo4j-social-backend/` và `neo4j-social-frontend/`.

1. Cài phụ thuộc (PowerShell):

```powershell
cd "d:\New folder (2)"
npm install
cd neo4j-social-backend
npm install
cd ..\neo4j-social-frontend
npm install
```

2. Biến môi trường (backend)

Tạo `.env` hoặc set biến môi trường cho backend. Các giá trị tối thiểu:

- `PORT` — cổng server (ví dụ `4000`)
- `JWT_SECRET` — secret cho JWT
- `NEO4J_URI` — ví dụ `bolt://localhost:7687`
- `NEO4J_USER`, `NEO4J_PASSWORD` — credentials Neo4j

3. Chạy ứng dụng (phát triển)

```powershell
# ở neo4j-social-backend
npm run dev

# ở neo4j-social-frontend
npm run dev
```

Lưu ý: tên script (`dev` / `start`) có thể khác — kiểm tra `package.json` từng thư mục.

## Ghi chú cho developer

- Thư mục `uploads/` dùng cho ảnh upload; đảm bảo process có quyền ghi.
- Một số Notification node cũ có thể thiếu `commentText`; có script `tools/backfill_notifications.cjs` để bổ sung.
- Xóa tin nhắn chưa được triển khai.
- Khi sửa Cypher, để ý kiểu integer trả về từ driver (cần `.toNumber()` để chuyển về Number trong nhiều chỗ).

## Kiểm thử nhanh thủ công (smoke test)

1. Đăng ký và đăng nhập user để lấy JWT.
2. Tạo một bài viết (có thể upload ảnh).
3. Dùng user khác bình luận trên bài — đảm bảo user chủ bài nhận `notification:new` realtime và Notification node có `commentText`.

## Các bước tôi có thể giúp tiếp

- Tạo mô tả API chi tiết cho tất cả route (method/path/params/response).
- Viết script smoke test tự động (create-post → comment → verify-notification).
- Thêm vài integration test nhỏ (supertest + test Neo4j).

---

Nói bước nào bạn muốn tiếp theo, tôi sẽ làm tiếp.

## Useful developer notes

- Uploads directory: backend uses `multer` and saves files under `uploads/`. Ensure writable permissions.
- Notifications: legacy Notification nodes may lack `commentText`; `tools/backfill_notifications.cjs` exists to populate missing values.
- Message deletion: not implemented in the current codebase.
- Neo4j integers: driver returns integer objects; code often calls `.toNumber()` to normalize values.

## Smoke test (manual)

1. Register and login a user to get a JWT.
2. Create a post (upload an image optionally).
3. From a second user, comment on the post — verify the first user receives `notification:new` and that a Notification node contains `commentText`.

## Next steps I can help with

- Generate a full API reference (method/path/params/response) for all routes.
- Add a smoke test script for create-post → comment → verify-notification.
- Add minimal integration tests (supertest + test Neo4j).

---

If you'd like one of the next steps, tell me which and I will implement it.
