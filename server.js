const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';

// One general-purpose endpoint. The app sends a finished prompt (built from
// the person's category, questions/answers, or profile data) and gets back
// real, freshly-generated text — no hardcoded logic here about what Future
// Board's features are, so new features don't need server changes later.
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, maxTokens } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing "prompt" in request body.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens || 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({ error: 'Upstream API error', details: errText });
    }

    const data = await response.json();
    const text = (data.content || []).map((block) => block.text || '').join('\n');
    res.json({ text });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Server error' });
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
