// Cloudflare Pages Function — FREE tier AI proxy
// Routes to Cerebras (llama-3.3-70b) using server-side API key
// No Gemini key required for free users

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { prompt, personaMode } = await context.request.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const apiKey = context.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Free tier unavailable — server not configured.' }), {
        status: 503,
        headers: corsHeaders
      });
    }

    // Cerebras uses OpenAI-compatible API format
    const cerebrasRes = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3.3-70b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2048,
        temperature: 0.7
      })
    });

    if (!cerebrasRes.ok) {
      const errData = await cerebrasRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: errData?.error?.message || `Cerebras error ${cerebrasRes.status}` }), {
        status: cerebrasRes.status,
        headers: corsHeaders
      });
    }

    const data = await cerebrasRes.json();
    const text = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ text }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
