import Stripe from 'stripe';

export async function onRequestPost(context) {
  const stripeSecret = context.env.STRIPE_SECRET_KEY;
  const webhookSecret = context.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = context.env.SUPABASE_URL || 'https://plrtjzuwqvkkopuruxux.supabase.co';
  const supabaseServiceKey = context.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecret || !webhookSecret) {
    return new Response(JSON.stringify({ error: 'Server environment not configured.' }), { status: 503 });
  }

  const stripe = new Stripe(stripeSecret);
  const signature = context.request.headers.get('stripe-signature');

  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing stripe signature header.' }), { status: 400 });
  }

  try {
    const rawBody = await context.request.text();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    let userId = null;
    let isPro = false;
    let customerId = null;
    let subscriptionId = null;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      userId = session.metadata?.userId;
      customerId = session.customer;
      subscriptionId = session.subscription;
      isPro = session.payment_status === 'paid';
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
      const subscription = event.data.object;
      userId = subscription.metadata?.userId;
      customerId = subscription.customer;
      subscriptionId = subscription.id;
      isPro = subscription.status === 'active';
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      userId = subscription.metadata?.userId;
      customerId = subscription.customer;
      subscriptionId = subscription.id;
      isPro = false;
    }

    // If we have a userId, update their subscription status in Supabase database
    if (userId && supabaseServiceKey) {
      const updateRes = await fetch(`${supabaseUrl}/rest/v1/user_states?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          is_pro: isPro,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          updated_at: new Date().toISOString()
        })
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.error(`Failed to update Supabase record: ${errText}`);
        return new Response(JSON.stringify({ error: `Supabase update error: ${errText}` }), { status: 500 });
      }

      console.log(`Successfully updated subscription state for user ${userId}. Pro status: ${isPro}`);
    } else if (!supabaseServiceKey) {
      console.warn('SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Webhook cannot update database.');
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });

  } catch (err) {
    console.error(`Webhook handler error: ${err.message}`);
    return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), { status: 400 });
  }
}
