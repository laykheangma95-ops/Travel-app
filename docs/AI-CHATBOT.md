# 🤖 Domner Trip Copilot — Beginner's Guide

A plain-English guide to how the floating "✦" Copilot answers questions.
No AI/machine-learning background needed.

---

## What you got

| File | What it is |
| --- | --- |
| `lib/domnerAI.ts` | **The thinking part.** Sends the traveller's question to Claude (a real AI model) together with Domner's knowledge, and returns the answer. |
| `lib/domnerBrain.ts` | **The knowledge.** Everything Claude needs to know about Domner — products, eSIM setup, prices, customs rules, scam warnings, airport walkthroughs, phrases, tone, and rules. |
| `lib/domnerEngine.ts` | **The safety net.** A keyword matcher with pre-written answers. Free, instant, and used automatically whenever Claude is unavailable. |
| `app/api/chat/route.ts` | **The endpoint** (`POST /api/chat`). Tries Claude first, falls back to the safety net. |
| `components/copilot/TripCopilot.tsx` | **The chat UI** — the floating "✦" button and chat window. |

---

## Why the Copilot used to feel "not smart"

Before this change, `/api/chat` only ever used `lib/domnerEngine.ts`. That file is
**not an AI model** — it is a keyword matcher. It scans your message for words it
was told about ("esim", "price", "vpn") and replies with a sentence someone wrote
in advance.

That design has a hard ceiling. It cannot reason, cannot combine two facts, and
cannot answer a question nobody wrote an answer for. Adding more text to it does
not make it cleverer, because there is no understanding there to improve — which
is exactly why editing it changed nothing.

You can still see the ceiling if Claude is switched off. Ask *"What can I carry on
a flight?"* and the matcher sees the word **flight** and replies about flight
tracking — confidently wrong. With Claude on, that question gets a real answer
about liquids, power banks, and what belongs in checked baggage.

---

## How it works now (the 30-second version)

1. A traveller sends a message.
2. `/api/chat` calls Claude with **two layers of knowledge**:
   - **The always-on manual** (`DOMNER_SYSTEM_PROMPT`) — who Domner is, how eSIMs
     work, payment and support policy, airport security basics, the full eSIM
     price list, and the guardrails. This is identical on every request, so
     Anthropic **caches** it and we pay roughly a tenth of the price to re-read
     it. That is why the manual can afford to be long.
   - **The trip briefing** (`buildTripBriefing`) — the "look it up" layer. It
     reads the conversation, notices which countries and airports it is actually
     about, and attaches only those customs rules, scam warnings, phrase lists,
     and airport walkthroughs.
3. Claude reasons over both and writes a reply in the traveller's language.
4. If anything goes wrong — no key, no credit, network down — the safety net
   answers instead. **The traveller never sees an error.**

Ask *"I fly Phnom Penh to Bangkok next week, is it safe?"* and the briefing
automatically attaches Thailand's entry rules and cash limit, the airport-taxi-tout
and "temple is closed" scam warnings, useful Thai phrases, and the step-by-step
walkthroughs for both PNH and BKK — even though the traveller never typed the word
"Thailand".

---

## Turning the smart Copilot on

Get an API key from [console.anthropic.com](https://console.anthropic.com), then:

- **Local:** put `ANTHROPIC_API_KEY=sk-ant-...` in `.env.local`
- **Live (Vercel):** Project → Settings → Environment Variables → add
  `ANTHROPIC_API_KEY`, then redeploy.

That's the whole setup. **Without a key the app still works** — it just runs on the
safety net, exactly as it did before.

> **Security:** never put the key in the code or commit it to GitHub — it always
> lives in environment variables. If a key ever leaks (pasted in a chat, a
> screenshot, a commit), revoke it in the Anthropic Console and make a new one.

### Checking which one answered

Every reply says which brain produced it:

```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"How does my eSIM work?"}]}'
```

```json
{ "reply": "After you buy, your eSIM QR code is emailed...", "engine": "offline" }
```

`"engine": "claude"` means the AI answered. `"engine": "offline"` means the safety
net did — either no key is set, or the request failed. When a request fails, the
reason is printed in the server log, prefixed with `[copilot]`.

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

## Teaching the Copilot new things

Open `lib/domnerBrain.ts`. The always-on manual is split into labelled sections:

- **IDENTITY** — who Domner is
- **PRODUCTS** — what Domner sells/does
- **ESIM_HOWTO** — the eSIM setup rules the AI must get right
- **POLICIES** — payments & support
- **TRAVEL_TIPS** — general advice
- **AIRPORT_SECURITY** — what you can carry, liquids, power banks, medication
- **PERSONA** — the tone/voice (warm, Khmer-first, concise)
- **GUARDRAILS** — the "never do this" rules (don't invent flight/gate info, can't
  refund orders, stay on-topic, never ask for passwords)

To change how the Copilot answers, edit the plain English in the relevant section.
You do **not** need to touch any AI code.

> 💡 Everything factual is generated from the data files, so the Copilot updates
> itself. Add a country to `data/destinations.ts`, a warning to
> `data/scamAlerts.ts`, a rule to `data/customsRules.ts`, or an airport to
> `data/airportGuides.ts` — the Copilot starts using it immediately, with no edits
> to the brain at all.

---

## Cost & model choice

The Copilot uses **Claude Opus 5** (`claude-opus-5`), set in `lib/domnerAI.ts`.
Two deliberate choices keep the bill sensible for a high-volume support chat:

- **Prompt caching** on the always-on manual — we send it every time but are
  billed a fraction to re-read it.
- **Retrieval instead of dumping** — attaching only the countries and airports
  the conversation is about, rather than the whole library every message.
- **Low effort** (`output_config: { effort: 'low' }`) — travellers want a fast
  answer in a chat bubble, not a deep essay.

To trade cost for capability, change these lines in `lib/domnerAI.ts`:

```ts
const MODEL = 'claude-opus-5';  // swap for 'claude-sonnet-5' or 'claude-haiku-4-5' to cut cost
```

Raising `effort` to `'medium'` gives more careful answers for more money. Watch the
real numbers in the Anthropic Console before tuning either — and set a monthly
spend limit there while you do.

---

## Live flight context (automatic)

When the traveller is on a flight-detail page, the chat UI
(`components/copilot/TripCopilot.tsx`) sends a short `context.flightSummary` along
with the messages. `/api/chat` hands that to Claude so answers can reference the
current flight — while the guardrails still stop the AI from inventing gate numbers
or delay times that weren't provided.

---

## Where to go next

- **Stream the replies.** Today the traveller waits for the whole answer, then sees
  it appear at once. Streaming would show it word by word, which feels much faster.
  That means changing `/api/chat` to return a stream and updating the widget to
  read it.
- Keep the **guardrails** section strong — never letting the AI invent flight or
  price details is what keeps travellers trusting Domner.
- Add new facts to the data files as the business grows; both brains pick them up.
