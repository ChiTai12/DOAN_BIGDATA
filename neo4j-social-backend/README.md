# Neo4j Social Backend

Minimal Express + Neo4j social backend skeleton.

## Quick start (Windows PowerShell)

1. Install dependencies

```powershell
Set-Location 'D:\New folder (2)\neo4j-social-backend'
npm install
```

2. Start the server

```powershell
npm start
```

Server will run on the `PORT` in `.env` (default 5000).

## Useful endpoints

- POST /auth/register - create account
- POST /auth/login - returns JWT token
- PUT /users/update - update profile (requires Authorization: Bearer <token>)
- POST /users/upload-avatar - upload avatar form field `avatar` (requires token)
- POST /posts (with image form field `image`) - create post (requires token)
- GET /posts/feed - get latest posts

## Quick curl / PowerShell examples

Register (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/auth/register' -Body (@{username='alice';password='pass123';email='a@x.com';displayName='Alice'} | ConvertTo-Json) -ContentType 'application/json'
```

Login (PowerShell):

```powershell
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/auth/login' -Body (@{username='alice';password='pass123'} | ConvertTo-Json) -ContentType 'application/json'
$token = $login.token
```

Update profile (PowerShell):

```powershell
Invoke-RestMethod -Method Put -Uri 'http://localhost:5000/users/update' -Headers @{ Authorization = "Bearer $token" } -Body (@{bio='Hi'; displayName='Alice'} | ConvertTo-Json) -ContentType 'application/json'
```

Upload avatar (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/users/upload-avatar' -Headers @{ Authorization = "Bearer $token" } -Form @{ avatar = Get-Item 'C:\path\to\avatar.jpg' }
```

Create post with image (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/posts' -Headers @{ Authorization = "Bearer $token" } -Form @{ content='Hello'; image = Get-Item 'C:\path\to\img.jpg' }
```

Get feed (curl):

```bash
curl http://localhost:5000/posts/feed
```

## Next suggestions

I can implement any of these next:

- Add input validation and better error handling
- Add JWT token refresh and logout
- Add follow/unfollow and an authenticated feed
- Add Docker + docker-compose with Neo4j
- Add unit/integration tests

Tell me which one you want next or I can start with a small task (README and package.json updates applied).
