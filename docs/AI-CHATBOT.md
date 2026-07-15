# 🤖 Domner AI Chatbot — Beginner's Guide

A plain-English guide to the AI chatbot "brain" and the beginner chatbot API.
No AI/machine-learning background needed.

---

## What you got

| File | What it is |
| --- | --- |
| `lib/domnerBrain.ts` | **The brain.** A big, organised block of text that teaches Claude everything about the Domner business — products, eSIM setup, prices, policies, tone, and rules. |
| `app/api/chat/route.ts` | **The beginner chatbot API.** A small, heavily-commented endpoint (`POST /api/chat`) that uses the brain to answer questions. Read it to learn how a chatbot works. |
| `app/api/copilot/route.ts` | The existing **production** chatbot (already wired into the floating "✦" Copilot button in the app). More advanced: it adds a free FAQ layer and live flight context. |

---

## How an AI chatbot actually works (the 30-second version)

1. An AI model (we use **Claude**) is very good at predicting helpful text.
2. On its own it knows general facts but **nothing about your business**.
3. So on every message we send Claude two things:
   - the **brain** (`DOMNER_SYSTEM_PROMPT`) — the "training manual" for a new agent, and
   - the **conversation** so far.
4. Claude reads both and writes a reply as if it were a Domner travel agent.

That's it. The brain is where all the "intelligence about Domner" lives — and it's
just editable text, so you can improve the chatbot without writing AI code.

---

## Editing the brain

Open `lib/domnerBrain.ts`. It's split into clearly labelled sections:

- **IDENTITY** — who Domner is
- **PRODUCTS** — what Domner sells/does
- **ESIM_HOWTO** — the eSIM setup rules the AI must get right
- **POLICIES** — payments & support
- **TRAVEL_TIPS** — general advice
- **PERSONA** — the tone/voice (warm, Khmer-first, concise)
- **GUARDRAILS** — the "never do this" rules (don't invent flight/gate info, can't
  refund orders, stay on-topic, never ask for passwords)

To change how the chatbot answers, just edit the English text in the relevant
section. You do **not** need to touch any AI code.

> 💡 The **eSIM catalogue** (countries + prices) is generated automatically from
> `data/destinations.ts`. Add a country or change a price there and the chatbot's
> answers update on their own — no edits to the brain needed.

---

## Trying it out

Start the app (`npm run dev`), then in a terminal:

```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
```

You'll get JSON back like:

```json
{ "reply": "Install your eSIM before you fly...", "demo": true }
```

`"demo": true` means it answered without a real AI (see the next section).

### Sending a back-and-forth conversation

The `messages` array is the whole conversation. Add past turns so the AI has context:

```json
{
  "messages": [
    { "role": "user", "content": "I'm flying to Japan" },
    { "role": "assistant", "content": "Great! Do you need an eSIM?" },
    { "role": "user", "content": "yes, how much?" }
  ]
}
```

---

## Turning on real AI answers

Without a key, the chatbot runs in **demo mode** — it returns a friendly canned
reply and sets `"demo": true`. To get real AI answers:

1. Get an API key from **console.anthropic.com** → API Keys, and add some credits.
   ⚠️ Set a **monthly spend cap** first.
2. Add it to your environment:
   - **Local:** put `ANTHROPIC_API_KEY=sk-ant-...` in `.env.local`
   - **Live (Vercel):** Project → Settings → Environment Variables → add
     `ANTHROPIC_API_KEY`, then redeploy.

That's the only setup. With the key present, `/api/chat` returns real answers and
`"demo": false`.

> **Security:** never put the key in the code or commit it to GitHub — it always
> lives in environment variables.

---

## Cost & model choice

The chatbot uses **`claude-haiku-4-5`** — Anthropic's fastest and cheapest model,
which fits a high-volume support chatbot (and matches Domner's cost strategy in
`STRATEGY.md`).

Want smarter answers? Open `app/api/chat/route.ts` and change one line:

```ts
const MODEL = 'claude-haiku-4-5';   // fast + cheap (default)
// const MODEL = 'claude-opus-4-8';  // higher quality, costs more per message
```

---

## Making the production Copilot use this brain (optional)

The production Copilot (`app/api/copilot/route.ts`) currently uses its own
knowledge text in `lib/copilotKnowledge.ts`. If you'd like it to use this richer,
auto-syncing brain instead, import `DOMNER_SYSTEM_PROMPT` from `lib/domnerBrain.ts`
and use it as the `system` value there. The free FAQ layer can stay as-is.

---

## Where to go next

- Add more FAQ entries to the free layer in `lib/copilotKnowledge.ts` (those are
  answered instantly with zero AI cost).
- Add new facts to the brain as the business grows (new products, new policies).
- Keep the **guardrails** section strong — never letting the AI invent flight or
  price details is what keeps travellers trusting Domner.
