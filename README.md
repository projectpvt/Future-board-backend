# Future Board Backend

This is a small server that sits between the Future Board app and Anthropic's
Claude API. Its only job is to keep your API key private — the app itself
never sees it.

## Files in this folder

- `server.js` — the actual server code
- `package.json` — lists what the server needs to run
- `.env.example` — shows what secret setting is needed (the real key goes into
  Render's dashboard, never into this file or into GitHub)

## How this gets deployed

You don't need to run this on your own computer. It's deployed on Render.com,
a free hosting service that reads the code straight from GitHub and runs it
for you.

Once deployed, Render gives you a URL like:

`https://future-board-backend-xxxx.onrender.com`

That URL is what gets added into the Future Board app so it can call this
server instead of using placeholder content.

## What it does

The server exposes one endpoint: `/api/generate`. The app sends it a prompt
(built from whatever the person answered — category, questions, profile
data) and the server sends that prompt to the real Claude API, then returns
the generated text back to the app.
