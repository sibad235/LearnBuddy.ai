// Vercel Serverless Function — secure ElevenLabs proxy.
//
// The browser calls /api/elevenlabs?action=... instead of ElevenLabs directly.
// The secret key lives only in the ELEVENLABS_API_KEY environment variable on
// the server, so it never ships to the browser.
//
// Set ELEVENLABS_API_KEY in: Vercel Dashboard → Settings → Environment Variables.

const BASE = 'https://api.elevenlabs.io/v1';

// Only allow simple alphanumeric voice ids — prevents path injection / SSRF.
function safeVoiceId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id) ? id : null;
}

// Read the raw request body as a Buffer — used only for multipart uploads.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
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

  // Always send the secret key from the server.
  const headers = { 'xi-api-key': apiKey };
  let body;

  if (method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      // TTS: Vercel already parsed the JSON into req.body — re-serialize it.
      // (Reconstructing from req.body is more reliable than reading the raw
      // stream, which Vercel's body parser may have already consumed.)
      headers['Content-Type'] = 'application/json';
      headers['Accept'] = req.headers['accept'] || 'audio/mpeg';
      body = JSON.stringify(req.body || {});
    } else {
      // Voice cloning upload (multipart): forward the raw bytes untouched,
      // keeping the original Content-Type so the multipart boundary survives.
      headers['Content-Type'] = contentType;
      body = await readRawBody(req);
    }
  }

  try {
    const upstream = await fetch(url, { method, headers, body });

    // Stream the response back unchanged: same status, same content-type, raw
    // bytes. This transparently handles JSON and binary audio (audio/mpeg).
    const upstreamType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    res.setHeader('Content-Type', upstreamType);
    return res.send(buffer);
  } catch (error) {
    console.error('[api/elevenlabs] Proxy error:', error);
    return res.status(502).json({ error: 'Failed to reach ElevenLabs.', detail: String(error) });
  }
};
