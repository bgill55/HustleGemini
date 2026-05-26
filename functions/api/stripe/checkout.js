import Stripe from 'stripe';

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
    const { email, userId, origin } = await context.request.json();
    
    if (!email || !userId) {
      return new Response(JSON.stringify({ error: 'email and userId are required' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const stripeSecret = context.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return new Response(JSON.stringify({ error: 'Stripe is not configured on the server.' }), {
        status: 503,
        headers: corsHeaders
      });
    }

    const stripe = new Stripe(stripeSecret);
    
    // Midias AI Pro Monthly Price ID
    const priceId = 'price_1TbGYWPWRrTLuOX9PdJm192Z'; 

    // Search for existing Stripe customer by email
    let customers = await stripe.customers.list({ email: email, limit: 1 });
    let customerId;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      // Create new customer if not found
      const customer = await stripe.customers.create({
        email: email,
        metadata: { userId: userId }
      });
      customerId = customer.id;
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin || 'http://localhost:8789'}?payment=success`,
      cancel_url: `${origin || 'http://localhost:8789'}?payment=cancelled`,
      metadata: {
        userId: userId
      },
      subscription_data: {
        metadata: {
          userId: userId
        }
      }
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: corsHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
