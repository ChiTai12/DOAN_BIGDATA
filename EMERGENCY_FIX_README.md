# 🚨 EMERGENCY FIX - Notification Badge Issue

## Vấn đề

Notification badge hiển thị "1" mặc dù đã xem rồi, F5 lại vẫn hiện "1".

## Root Cause

Notification trong database thiếu property `read` (undefined), gây ra loop vô tận:

- Frontend nhận notification với `read: undefined`
- Logic `!notification.read` trả về `true` → notification được tính là unread
- Badge hiển thị "1"

## Giải pháp ngay lập tức

### 1. Frontend Emergency Fix

Chạy script này trong browser console:

```javascript
// Copy toàn bộ nội dung file emergency_fix.js và paste vào console
```

### 2. Backend Fix (khi có thời gian)

Cần update notification trong Neo4j database:

```cypher
MATCH (n:Notification {id: '61290492-aae1-48c0-a544-19eed43072b4'})
SET n.read = false
RETURN n
```

### 3. Verification

Sau khi chạy emergency fix:

1. Badge sẽ hiển thị "0"
2. F5 reload vẫn hiển thị "0"
3. Click notification không còn tăng badge

## Lưu ý

- Emergency fix chỉ tác động frontend, không fix root cause
- Cần fix database để giải quyết hoàn toàn
- Script sẽ auto-reload trang sau 2 giây
