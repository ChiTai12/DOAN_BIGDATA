/*
  test-share.mjs (ESM)

  Usage (PowerShell):
    # unauthenticated (may fail if API requires auth)
    node .\test-share.mjs 123

    # with token and post id
    $env:TOKEN = 'your-jwt-token-here'; $env:POST_ID = '123'; node .\test-share.mjs

  Environment variables:
    TOKEN  - optional Bearer token for Authorization header
    POST_ID - required: the id of the post you want to share
    USE_ALL - optional: if set (any value), will share to all followings instead of just the first
*/

import axios from "axios";

const API_BASE = process.env.API_BASE_URL || "http://localhost:5000";
let TOKEN = process.env.TOKEN || null;
const POST_ID = process.env.POST_ID || process.argv[2];
const USE_ALL = process.env.USE_ALL;
const LOGIN_USER = process.env.LOGIN_USER;
const LOGIN_PASS = process.env.LOGIN_PASS;
const LOGIN_BODY = process.env.LOGIN_BODY; // optional raw JSON for login payload

// test-share.mjs - neutralized (share feature removed)
// Previously used for quick API testing. Kept as placeholder.
