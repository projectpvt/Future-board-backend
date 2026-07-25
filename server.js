const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Optional shared secret. If APP_SECRET is not set in Render, requests are
// allowed through as before — so setting this up can never lock you out.
const APP_SECRET = process.env.APP_SECRET;

const MODEL = 'claude-sonnet-4-6';

// Hard ceiling so a request can never ask for an expensive response.
const MAX_TOKENS_CEILING = 1000;
const MAX_PROMPT_CHARS = 8000;

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

// One general-purpose endpoint. The app sends a finished prompt (built from
// the person's category, questions/answers, taste tags, or profile data) and
// gets back real, freshly-generated text. No feature-specific logic lives
// here, so new features never need server changes.
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

// Simple page so visiting the URL directly in a browser confirms it's alive.
app.get('/', (req, res) => {
  res.send('Future Board backend is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Future Board backend listening on port ${PORT}`);
});
