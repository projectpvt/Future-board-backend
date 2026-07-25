const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors());
app.use(express.json());
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const APP_SECRET = process.env.APP_SECRET;
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS_CEILING = 1000;
const MAX_PROMPT_CHARS = 8000;
const MAX_QUERY_CHARS = 100;

function isAuthorised(req) {
  if (!APP_SECRET) return true;
  return req.headers['x-app-secret'] === APP_SECRET;
}

async function callClaude(prompt, maxTokens) {
  const safeTokens = Math.min(Number(maxTokens) || 300, MAX_TOKENS_CEILING);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: safeTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return (data.content || []).map((block) => block.text || '').join('\n');
}

// ── Image search — real, human-made only ────────────────────────────────
// Every result is checked here for a name attached to a real human, or a
// named real institution, before it's ever sent back. A missing credit
// means the item is dropped, not passed through uncredited.

async function searchUnsplash(query) {
  if (!UNSPLASH_ACCESS_KEY) return [];
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10`;
  const response = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.results || [])
    .filter((p) => p?.urls?.regular && p?.user?.name)
    .map((p) => ({
      id: `unsplash-${p.id}`,
      type: 'image',
      uri: p.urls.regular,
      height: 200 + Math.round((p.height / p.width) * 40),
      source: 'unsplash',
      credit: 'Unsplash',
      artist: p.user.name,
      pageUrl: p.links?.html || null,
      downloadTrigger: p.links?.download_location || null,
    }));
}

async function searchMet(query) {
  const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return [];
  const searchData = await searchRes.json();
  const ids = (searchData.objectIDs || []).slice(0, 12);
  const objects = await Promise.all(
    ids.map(async (id) => {
      try {
        const objRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        if (!objRes.ok) return null;
        return await objRes.json();
      } catch {
        return null;
      }
    })
  );
  return objects
    .filter((o) => o && o.isPublicDomain && o.primaryImageSmall)
    .slice(0, 6)
    .map((o) => ({
      id: `met-${o.objectID}`,
      type: 'image',
      uri: o.primaryImageSmall,
      height: 220,
      source: 'met',
      credit: 'The Met — open access',
      artist: (o.artistDisplayName && o.artistDisplayName.trim()) || null,
      pageUrl: o.objectURL || null,
    }));
}

app.get('/api/images', async (req, res) => {
  try {
    if (!isAuthorised(req)) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    const query = String(req.query.q || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Missing "q" query parameter.' });
    }
    if (query.length > MAX_QUERY_CHARS) {
      return res.status(400).json({ error: 'Query too long.' });
    }
    const [unsplashResults, metResults] = await Promise.all([
      searchUnsplash(query).catch(() => []),
      searchMet(query).catch(() => []),
    ]);
    res.json({ images: [...unsplashResults, ...metResults] });
  } catch (err) {
    console.error('Image search error:', err.message);
    res.status(502).json({ error: 'Upstream API error' });
  }
});

// Unsplash's API terms require notifying them whenever a photo is actually
// used (saved, displayed prominently) so photographers get proper credit
// toward their stats. Fire-and-forget — never blocks the person's app.
app.post('/api/unsplash/track', async (req, res) => {
  try {
    if (!isAuthorised(req)) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    const { downloadTrigger } = req.body;
    if (!downloadTrigger || typeof downloadTrigger !== 'string' || !downloadTrigger.startsWith('https://api.unsplash.com/')) {
      return res.status(400).json({ error: 'Invalid downloadTrigger' });
    }
    fetch(downloadTrigger, { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('Unsplash track error:', err.message);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    if (!isAuthorised(req)) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
    const { prompt, maxTokens } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Missing "prompt" in request body.' });
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return res.status(400).json({ error: 'Prompt too long.' });
    }
    const text = await callClaude(prompt, maxTokens);
    res.json({ text });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(502).json({ error: 'Upstream API error' });
  }
});

app.get('/', (req, res) => {
  res.send('Future Board backend is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Future Board backend listening on port ${PORT}`);
});
