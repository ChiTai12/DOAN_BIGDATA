Run this small script to validate real-time post deletion propagation.

Prereqs: backend server running on http://localhost:5000 and Neo4j accessible.

In PowerShell (project root uses d:\New folder (2)):

cd "d:\New folder (2)\\neo4j-social-backend"
node test-realtime-delete.js

Optional env vars:

- TEST_USER_A: username for user A (default: testuserA)
- TEST_USER_B: username for user B (default: testuserB)
- TEST_PASS: password for both test users (default: password123)
- BASE_URL: base URL for backend (default: http://localhost:5000)

The script will:

- register/login two test users if needed
- open a socket connection as user B and listen for `post:deleted`
- create a post as user A and delete it
- report whether user B received the delete event within 8 seconds
