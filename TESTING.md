# Authentication Testing Guide

## Root Cause of `Error 400: redirect_uri_mismatch`

NextAuth builds this exact URL when sending the user to Google:

```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=<GOOGLE_CLIENT_ID>
  &redirect_uri=http://localhost:3000/api/auth/callback/google   ← THIS must be registered
  &response_type=code
  &scope=openid email profile
```

Google rejects the request if `redirect_uri` is not in the **Authorized redirect URIs** list
for that OAuth client in Google Cloud Console. The app code is generating the correct URI — the
fix is always in the Console.

---

## Step 1 — Fix Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Navigate to **APIs & Services → Credentials**
4. Click the OAuth 2.0 Client ID named for this app
5. Under **Authorized JavaScript origins** add:
   ```
   http://localhost:3000
   ```
6. Under **Authorized redirect URIs** add:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
7. Click **Save** (changes propagate in ~5 minutes)

For production (Vercel), also add:
```
# Authorized JavaScript origins
https://your-app.vercel.app

# Authorized redirect URIs
https://your-app.vercel.app/api/auth/callback/google
```

---

## Step 2 — Verify `.env.local`

`frontend-next/.env.local` must contain:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<any random string>
GOOGLE_CLIENT_ID=<from Google Console>
GOOGLE_CLIENT_SECRET=<from Google Console>
BACKEND_JWT_SECRET=<must match root .env BACKEND_JWT_SECRET>
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

`NEXTAUTH_URL` is critical. NextAuth derives the redirect URI as:
```
${NEXTAUTH_URL}/api/auth/callback/google
```
If `NEXTAUTH_URL` is wrong, the URI sent to Google won't match what's registered.

---

## Step 3 — Start both servers

```bash
# Terminal 1 — Backend
cd universal-data-assistant/backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd universal-data-assistant/frontend-next
node node_modules/next/dist/bin/next dev --port 3000
```

---

## Step 4 — Test login

1. Open `http://localhost:3000` in a browser
2. You should be redirected to `http://localhost:3000/auth/signin`
   (if not, the middleware is not running — see "Verify middleware" below)
3. Click **Continue with Google**
4. Complete Google login
5. You should land on `http://localhost:3000/` (the dashboard)

### Verify the callback URL at runtime (before logging in)

```bash
curl -s http://localhost:3000/api/auth/providers | python3 -m json.tool
```

Expected output:
```json
{
    "google": {
        "id": "google",
        "name": "Google",
        "type": "oauth",
        "signinUrl": "http://localhost:3000/api/auth/signin/google",
        "callbackUrl": "http://localhost:3000/api/auth/callback/google"
    }
}
```

The `callbackUrl` value is exactly what NextAuth sends as `redirect_uri` to Google.
It must appear verbatim in the Console's Authorized redirect URIs list.

### Verify the full Google auth URL NextAuth generates

```bash
CSRF=$(curl -s -c /tmp/cookies.txt http://localhost:3000/api/auth/csrf \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")

curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt \
  -X POST http://localhost:3000/api/auth/signin/google \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrfToken=${CSRF}&callbackUrl=http%3A%2F%2Flocalhost%3A3000" \
  -D - -o /dev/null 2>&1 | grep "location:"
```

You will see a URL starting with `https://accounts.google.com/o/oauth2/v2/auth?...`.
Decode the `redirect_uri` parameter — it must match what's registered in Google Console.

---

## Step 5 — Retrieve your Google `sub`

After a successful login, call the `/me` endpoint:

```bash
# Get the backend token from your browser session
# In the browser's DevTools → Application → Cookies → localhost:3000
# Find the cookie named: next-auth.session-token

# Or call the NextAuth session endpoint
curl -s http://localhost:3000/api/auth/session | python3 -m json.tool
```

The response includes the session but NOT the sub directly (it's inside the JWT).

**Easier method — use the backend /me endpoint:**

1. Log in to the app at `http://localhost:3000`
2. Open DevTools → Network tab → filter by `me`
3. After login, the frontend calls `GET /api/v1/me`
4. In the response you will see:
   ```json
   {
     "sub": "108123456789012345678",
     "email": "you@gmail.com",
     "name": "Your Name",
     "role": "analyst"
   }
   ```
5. Copy the `sub` value

**Alternative — browser console:**
```javascript
// In the browser console on any app page:
fetch('/api/auth/session')
  .then(r => r.json())
  .then(s => console.log(s))
```

The session object has `sub` nested inside the JWT decoded claims.

**Alternative — curl after extracting token:**
```bash
# After login, copy the backendToken from browser local storage or the session
# Then call:
curl -s -H "Authorization: Bearer <your-backend-token>" \
  http://localhost:8000/api/v1/me | python3 -m json.tool
```

---

## Step 6 — Set `ADMIN_SUBS` to become Admin

Once you have your Google `sub` (e.g. `108123456789012345678`):

1. Open the root `.env` file:
   ```bash
   # universal-data-assistant/.env
   ```

2. Add:
   ```env
   ADMIN_SUBS=108123456789012345678
   ```
   For multiple admins, comma-separate:
   ```env
   ADMIN_SUBS=108123456789012345678,117987654321098765432
   ```

3. Restart the backend:
   ```bash
   # Kill the running uvicorn process then:
   uvicorn app.main:app --reload --port 8000
   ```

4. Verify you are now admin:
   ```bash
   curl -s -H "Authorization: Bearer <your-backend-token>" \
     http://localhost:8000/api/v1/me | python3 -m json.tool
   ```
   Expected: `"role": "admin"`

5. The **Admin** section will appear in the sidebar at `http://localhost:3000/admin`

---

## Verify middleware is running

The file `frontend-next/src/middleware.ts` protects all routes. To confirm it's active:

```bash
# Should redirect (302) to /auth/signin — not return the page content
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

Expected: `307` (redirect to sign-in)

If it returns `200`, the middleware is not running. Ensure the file exists at:
```
frontend-next/src/middleware.ts   ← correct location for src/ layout
```
Not `proxy.ts` or any other name — Next.js only loads a file named `middleware.ts`.

---

## Production deployment checklist

| Item | Value |
|------|-------|
| Frontend env `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| Google Console — Authorized redirect URI | `https://your-app.vercel.app/api/auth/callback/google` |
| Google Console — Authorized JS origin | `https://your-app.vercel.app` |
| Backend env `FRONTEND_URL` | `https://your-app.vercel.app` |
| Both envs `BACKEND_JWT_SECRET` | Must be identical |
| Backend env `ADMIN_SUBS` | Your production Google sub |

---

## Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Error 400: redirect_uri_mismatch` | URI not registered in Google Console | Add `${NEXTAUTH_URL}/api/auth/callback/google` to Authorized redirect URIs |
| `Error 401: invalid_client` | Wrong `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` | Copy credentials again from Google Console |
| `Error: NEXTAUTH_SECRET is not set` | Missing `NEXTAUTH_SECRET` in `.env.local` | Generate with `openssl rand -base64 32` |
| App accessible without login | `middleware.ts` not found | Ensure file is at `src/middleware.ts` (not `proxy.ts`) |
| Backend returns 401 on all calls | `BACKEND_JWT_SECRET` mismatch | Both `.env` files must have the exact same value |
| Role shows `analyst` after setting `ADMIN_SUBS` | Backend not restarted | Restart uvicorn — `ADMIN_SUBS` is read at startup |
