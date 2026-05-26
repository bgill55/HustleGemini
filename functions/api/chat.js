// Cloudflare Pages Function — Dual-tier AI proxy
// Routes to Gemini Pro for subscribed Pro users, or Cerebras for Free users

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
    const { prompt, personaMode, userId, email } = await context.request.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const supabaseUrl = context.env.SUPABASE_URL || 'https://plrtjzuwqvkkopuruxux.supabase.co';
    const supabaseServiceKey = context.env.SUPABASE_SERVICE_ROLE_KEY;

    // Developer backdoor bypass: your email is always Pro
    let isPro = email === 'bricam55@gmail.com';

    // Verify subscription status in database if userId is provided
    if (!isPro && userId && supabaseServiceKey) {
      try {
        const userRes = await fetch(`${supabaseUrl}/rest/v1/user_states?user_id=eq.${userId}&select=is_pro`, {
          method: 'GET',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData && userData.length > 0 && userData[0].is_pro) {
            isPro = true;
          }
        }
      } catch (dbErr) {
        console.error('Failed to verify Pro status in database:', dbErr);
      }
    }

    // ---- PRO TIER: Route through Gemini Pro ----
    if (isPro) {
      const geminiApiKey = context.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return new Response(JSON.stringify({ error: 'Pro tier unavailable — Gemini key not configured on server.' }), {
          status: 503,
          headers: corsHeaders
        });
      }

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!geminiRes.ok) {
        const errData = await geminiRes.json().catch(() => ({}));
        return new Response(JSON.stringify({ error: errData?.error?.message || `Gemini error ${geminiRes.status}` }), {
          status: geminiRes.status,
          headers: corsHeaders
        });
      }

      const data = await geminiRes.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return new Response(JSON.stringify({ text }), { headers: corsHeaders });
    }

    // ---- FREE TIER: Route through Cerebras proxy ----
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
        model: 'qwen-3-235b-a22b-instruct-2507',
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

