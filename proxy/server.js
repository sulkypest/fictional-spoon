import express from 'express';
import cors from 'cors';
import { request as nodeRequest } from 'node:http';

// Minimal Express proxy for ElevenLabs API
// Usage:
//   ELEVENLABS_API_KEY=sk-... node server.js
// or set ELEVENLABS_API_KEY in your environment.

const PORT = process.env.PORT || 8787;
const ELEVEN_API = 'https://api.elevenlabs.io/v1';
const SERVER_API_KEY = process.env.ELEVENLABS_API_KEY || null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.all('/el/*', async (req, res) => {
  try {
    const path = req.path.replace(/^\/el/, '');
    const target = ELEVEN_API + path;

    const headers = {
      'xi-api-key': req.header('xi-api-key') || SERVER_API_KEY || '',
      'accept': 'application/json',
    };

    // Preserve content-type for POST bodies
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

    const fetchOpts = {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
    };

    const r = await fetch(target, fetchOpts);

    // Forward status and headers
    res.status(r.status);
    r.headers.forEach((v, k) => res.setHeader(k, v));

    // Stream response back
    const buf = await r.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (e) {
    console.error('Proxy error', e);
    res.status(500).json({ error: e.message || 'Proxy error' });
  }
});

app.get('/', (req, res) => res.send(`ElevenLabs proxy listening on ${PORT}`));

app.listen(PORT, () => console.log(`Proxy listening on http://localhost:${PORT} — forwarding to ${ELEVEN_API}`));
