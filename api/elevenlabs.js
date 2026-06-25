// Vercel Serverless Function — secure ElevenLabs proxy.
//
// The browser calls /api/elevenlabs?action=... instead of ElevenLabs directly.
// The secret key lives only in the ELEVENLABS_API_KEY environment variable on
// the server, so it never ships to the browser.
//
// Set ELEVENLABS_API_KEY in: Vercel Dashboard → Settings → Environment Variables.
//
// We disable Vercel's body parser so we can stream the raw request body straight
// through. That lets ONE handler forward JSON (TTS), multipart file uploads
// (voice cloning), and receive binary audio back — all without re-encoding.

module.exports.config = { api: { bodyParser: false } };

const BASE = 'https://api.elevenlabs.io/v1';

// Read the raw request body as a Buffer (works for JSON and multipart alike).
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Only allow simple alphanumeric voice ids — prevents path injection / SSRF.
function safeVoiceId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id) ? id : null;
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('[api/elevenlabs] ELEVENLABS_API_KEY environment variable is not set.');
    return res.status(500).json({ error: 'Server is not configured with an ElevenLabs API key.' });
  }

  const { action, voiceId } = req.query;

  // Decide which ElevenLabs endpoint + method this maps to.
  let url;
  let method;
  switch (action) {
    case 'voices':
      url = `${BASE}/voices`;
      method = 'GET';
      break;
    case 'tts': {
      const id = safeVoiceId(voiceId);
      if (!id) return res.status(400).json({ error: 'Invalid or missing voiceId.' });
      url = `${BASE}/text-to-speech/${id}`;
      method = 'POST';
      break;
    }
    case 'add':
      url = `${BASE}/voices/add`;
      method = 'POST';
      break;
    case 'delete': {
      const id = safeVoiceId(voiceId);
      if (!id) return res.status(400).json({ error: 'Invalid or missing voiceId.' });
      url = `${BASE}/voices/${id}`;
      method = 'DELETE';
      break;
    }
    default:
      return res.status(400).json({ error: 'Unknown action.' });
  }

  // Always send the secret key from the server. Forward the client's
  // Content-Type (carries the multipart boundary for uploads) and Accept.
  const headers = { 'xi-api-key': apiKey };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers['accept']) headers['Accept'] = req.headers['accept'];

  const init = { method, headers };
  if (method === 'POST') {
    init.body = await readRawBody(req);
  }

  try {
    const upstream = await fetch(url, init);

    // Stream the response back unchanged: same status, same content-type,
    // raw bytes. This transparently handles JSON and binary audio.
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    return res.send(buffer);
  } catch (error) {
    console.error('[api/elevenlabs] Proxy error:', error);
    return res.status(502).json({ error: 'Failed to reach ElevenLabs.', detail: String(error) });
  }
};
