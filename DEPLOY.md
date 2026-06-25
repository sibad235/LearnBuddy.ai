# Deploying LearnBuddy.ai securely to Vercel

No API key is in the code. The browser calls our own serverless functions,
which add the secret keys on the server and forward the requests:

- `api/groq.js`  → handles question generation (Groq).
- `api/elevenlabs.js` → handles text-to-speech and voice management (ElevenLabs).

## One-time setup

1. **Revoke BOTH leaked keys and create new ones:**
   - Groq: https://console.groq.com/keys — delete the old `gsk_ITRR…` key.
   - ElevenLabs: https://elevenlabs.io/app/settings/api-keys — delete the old
     `sk_de84…` key.
   Never reuse a leaked key.

2. **Push the cleaned code to GitHub** (the old key is gone from `main.js`).

3. **Import the repo into Vercel** (https://vercel.com/new). It auto-detects
   the static site and the `api/` serverless function — no build settings needed.

4. **Add the environment variables** in Vercel:
   - Project → **Settings → Environment Variables**
   - Add `GROQ_API_KEY` = *your new Groq key*
   - Add `ELEVENLABS_API_KEY` = *your new ElevenLabs key*
   - Apply each to **Production, Preview, and Development**, then **Save**.

5. **Deploy.** Done — the key lives only on Vercel's servers.

## Important: the leaked key is in your Git history

Even after this commit, the old key still exists in earlier commits on GitHub.
That's fine **as long as you revoked it** (step 1) — a revoked key is useless.
You do not need to rewrite history. Just make sure the old key is deleted in
the Groq console.

## Run locally

```bash
npm i -g vercel       # one time
cp .env.example .env.local   # then put your new key in .env.local
vercel dev            # serves index.html + the /api/groq function
```

Opening `index.html` directly (file://) will NOT work anymore, because the
`/api/groq` endpoint needs a server. Use `vercel dev` for local testing.
