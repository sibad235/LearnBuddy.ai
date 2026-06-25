// Vercel Serverless Function — secure Groq proxy.
//
// The browser calls THIS endpoint (/api/groq) instead of Groq directly.
// The secret key lives only in the GROQ_API_KEY environment variable on the
// server, so it is never shipped to the browser and never appears in the code.
//
// Set GROQ_API_KEY in: Vercel Dashboard → Project → Settings → Environment Variables.

module.exports = async function handler(req, res) {
  // Only allow POST — this endpoint just forwards chat-completion requests.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[api/groq] GROQ_API_KEY environment variable is not set.');
    return res.status(500).json({ error: 'Server is not configured with a Groq API key.' });
  }

  try {
    // req.body is already parsed by Vercel when Content-Type is application/json.
    // Forward the exact body the client built (model, messages, temperature, etc.).
    const payload = req.body;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    // Preserve the retry-after header so the client's 429 backoff keeps working.
    const retryAfter = groqResponse.headers.get('retry-after');
    if (retryAfter) res.setHeader('retry-after', retryAfter);

    // Pass Groq's status and JSON body straight through to the client.
    const data = await groqResponse.json().catch(() => ({}));
    return res.status(groqResponse.status).json(data);
  } catch (error) {
    console.error('[api/groq] Proxy error:', error);
    return res.status(502).json({ error: 'Failed to reach Groq.', detail: String(error) });
  }
};
