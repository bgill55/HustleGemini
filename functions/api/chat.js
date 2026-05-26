// Cloudflare Pages Function — AI proxy
// Routes ALL server-side calls through Cerebras (Qwen 3 235B).
// Pro users: unlimited messages. Free users: capped at 5 messages (enforced client-side).
// Gemini is only used when the user provides their own API key (handled client-side in app.js).

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

    // NOTE: Server-side proxy always uses Cerebras for all users.
    // The Pro/Free distinction is enforced client-side (5-message cap for Free).
    // Users with their own Gemini key are handled entirely in app.js (client-side).

    // ---- FREE & PRO TIER BACKEND CALL: Route through Cerebras, fallback to Groq on 429 or failure ----
    let fallbackToGroq = false;
    let cerebrasErrorMsg = '';

    const apiKey = context.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      fallbackToGroq = true;
      cerebrasErrorMsg = 'Cerebras key not configured on server.';
    } else {
      try {
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

        if (cerebrasRes.ok) {
          const data = await cerebrasRes.json();
          const text = data.choices?.[0]?.message?.content || '';
          return new Response(JSON.stringify({ text }), { headers: corsHeaders });
        } else {
          cerebrasErrorMsg = `Cerebras HTTP ${cerebrasRes.status}`;
          if (cerebrasRes.status === 429 || cerebrasRes.status >= 500) {
            fallbackToGroq = true;
          } else {
            const errData = await cerebrasRes.json().catch(() => ({}));
            return new Response(JSON.stringify({ error: errData?.error?.message || `Cerebras error ${cerebrasRes.status}` }), {
              status: cerebrasRes.status,
              headers: corsHeaders
            });
          }
        }
      } catch (fetchErr) {
        cerebrasErrorMsg = fetchErr.message;
        fallbackToGroq = true;
      }
    }

    // ---- FALLBACK TO GROQ ----
    if (fallbackToGroq) {
      console.warn(`Cerebras failed (${cerebrasErrorMsg}). Falling back to Groq...`);
      const groqApiKey = context.env.GROQ_API_KEY;
      if (!groqApiKey) {
        return new Response(JSON.stringify({ error: `Cerebras overloaded (${cerebrasErrorMsg}). Groq fallback failed: GROQ_API_KEY environment variable is not configured.` }), {
          status: 503,
          headers: corsHeaders
        });
      }
      
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
            temperature: 0.7
          })
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          const text = data.choices?.[0]?.message?.content || '';
          return new Response(JSON.stringify({ text, fallback: 'groq' }), { headers: corsHeaders });
        } else {
          const errData = await groqRes.json().catch(() => ({}));
          return new Response(JSON.stringify({ error: `Cerebras overloaded (${cerebrasErrorMsg}). Groq fallback also failed: ${errData?.error?.message || groqRes.status}` }), {
            status: groqRes.status,
            headers: corsHeaders
          });
        }
      } catch (groqErr) {
        return new Response(JSON.stringify({ error: `Cerebras overloaded (${cerebrasErrorMsg}). Groq fallback exception: ${groqErr.message}` }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

