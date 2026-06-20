const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

async function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  const idToken = auth.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    console.error('Token verify failed', e);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Save/Update the user's ElevenLabs API key (stored server-side in Firestore)
app.post('/saveKey', verifyToken, async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Missing key' });
  try {
    await db.collection('eleven_keys').doc(req.uid).set({ key }, { merge: true });
    return res.json({ ok: true });
  } catch (e) {
    console.error('saveKey failed', e);
    return res.status(500).json({ error: e.message || 'saveKey failed' });
  }
});

// Proxy route: forwards requests to ElevenLabs on behalf of the authenticated user
app.all('/el/*', verifyToken, async (req, res) => {
  try {
    const path = req.path.replace(/^\/el/, '');
    const doc = await db.collection('eleven_keys').doc(req.uid).get();
    if (!doc.exists || !doc.data().key) return res.status(403).json({ error: 'No ElevenLabs key stored for this user' });
    const key = doc.data().key;
    const target = `https://api.elevenlabs.io/v1${path}`;

    const headers = {
      'xi-api-key': key,
      'accept': '*/*',
      ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
    };

    const fetchOpts = {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body)
    };

    const r = await fetch(target, fetchOpts);
    const buf = await r.arrayBuffer();
    const b = Buffer.from(buf);
    const contentType = r.headers.get('content-type') || '';

    // Forward JSON responses normally
    if (contentType.includes('application/json')) {
      const text = b.toString('utf8');
      try {
        const j = JSON.parse(text);
        return res.status(r.status).json(j);
      } catch (e) {
        return res.status(r.status).send(text);
      }
    }

    // For binary responses (audio), return base64 payload and content-type
    return res.status(r.status).json({ binary: b.toString('base64'), contentType });
  } catch (e) {
    console.error('Proxy error', e);
    return res.status(500).json({ error: e.message || 'Proxy error' });
  }
});

exports.api = functions.https.onRequest(app);
