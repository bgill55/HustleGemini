# Midias AI ⚡ AI Co-Founder Command Center

Midias AI is a premium, highly responsive SaaS command center designed to act as your AI co-founder. It empowers non-technical founders to brainstorm side hustles using real-time market trends, score their feasibility, generate phased checklists, and proactively execute coding, copywriting, and research tasks—starting with a $100 budget.

---

## 🚀 Key Features

- **Co-founder Chat Console:** Collaborate with Midias in real-time. Features styled syntax-highlighted code blocks, inline copy actions, and custom action buttons.
- **Proactive Task execution ("Help Me"):** Click "Help Me" next to any checklist item to have Midias automatically write the code, draft outreach templates, or compile research, then save them directly to the **Resource Vault**.
- **Real-Time Niche Brainstorming:** Pulls real-time Google Trends to find trending business models under a $100 budget.
- **Three-Phase Action Plan:** Interactive setup, launch, and scaling checklists that sync to the database.
- **Resource Vault:** A secure locker for auto-generated Landing Page Copy, Target Buyer Personas, SWOT Analyses, and Task Code Deliverables.
- **Stripe Billing Integration:** Secure Pro Tier upgrades, 5-message free usage caps, and webhook sync.
- **Dual-Tier Proxy Routing:** Serverless routing using **Cerebras (Qwen 3 235B)** for blazing-fast inference, with automatic fallback to **Groq (Llama 3.3 70B)** during rate limits. Custom API keys route straight to **Gemini Pro**.
- **Proactive Search Grounding (RAG):** Live search grounding via **Tavily API** whenever research, news, or source compilations are requested.

---

## 🛠️ The Tech Stack

- **Frontend:** Vanilla HTML5, CSS3 Custom Theme (Dark Mode, Gold Ambient Glows, Glassmorphism, Responsive Grid), Custom JavaScript Core.
- **Backend:** Cloudflare Pages Functions (Serverless proxy logic).
- **Database & Auth:** Supabase (PostgreSQL, user state persistence, row-level security).
- **Payment Gateway:** Stripe API (Checkout Sessions, Webhooks).
- **Search Retrieval:** Tavily Search API.
- **AI Inference:** Cerebras LPU & Groq Cloud.

---

## ⚙️ Configuration & Environment Setup

To run Midias AI locally or in production, you will need to configure environment variables for the serverless functions and add Supabase credentials on the client.

### 1. Supabase Client Credentials
Rename/configure [config.js](file:///c:/Users/brica/Midas/config.js) in the root of the project:
```javascript
const CONFIG = {
    SUPABASE_URL: "https://your-project.supabase.co",
    SUPABASE_ANON_KEY: "your-anon-publishable-key"
};
```

### 2. Database Schema
Execute the following SQL inside your Supabase SQL editor to create the necessary workspace structures:
```sql
alter table user_states 
  add column is_pro boolean default false,
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column vault jsonb default '{"copy":"","persona":"","swot":"","assets":""}'::jsonb;
```

### 3. Serverless Environment Variables
Create a gitignored `.dev.vars` file in the root of your repository for local testing:

```env
CEREBRAS_API_KEY=your_cerebras_api_key
GROQ_API_KEY=your_groq_api_key
TAVILY_API_KEY=your_tavily_search_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_secret_key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

> [!IMPORTANT]  
> In production, configure these identical variables under **Cloudflare Pages > Settings > Environment Variables**.

---

## 📦 Local Deployment

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the local server:**
   ```bash
   npm run dev
   ```
   *The command spins up Wrangler Pages dev proxy at `http://localhost:8789`.*

3. **Verify compilation:**
   To make sure there are no syntax or bundler errors in functions, run:
   ```bash
   npm run build
   ```

---

## 📄 License
Licensed under the [ISC License](LICENSE).
