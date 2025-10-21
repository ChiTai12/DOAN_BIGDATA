Usage

Create an admin user for the Neo4j-backed app.

Requirements:

- Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD in environment or .env at repo root.

Run:

node tools/create_admin.js <username> <password> [displayName]

Examples:

# create admin with username admin and password secret

node tools/create_admin.js admin secret "Site Admin"

You can also set environment variables ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DISPLAYNAME before running to avoid CLI args.
