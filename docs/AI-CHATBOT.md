# 🤖 Domner Trip Copilot — Beginner's Guide

A plain-English guide to how the floating "✦" Copilot answers questions.
No AI/machine-learning background needed.

---

## What you got

| File | What it is |
| --- | --- |
| `lib/domnerAI.ts` | **The thinking part.** Sends the traveller's question to Claude (a real AI model) together with Domner's knowledge, and returns the answer. |
| `lib/domnerBrain.ts` | **The knowledge.** Everything Claude needs to know about Domner — products, eSIM setup, prices, customs rules, scam warnings, airport walkthroughs, phrases, tone, and rules. |
| `lib/domnerEngine.ts` | **The free brain.** Answers without any external service — instant, no key, no cost. Used for everyday questions and as the safety net whenever Claude is unavailable. |
| `lib/domnerSearch.ts` | **The understanding.** Matches questions to answers by MEANING rather than by keyword. This is what makes the free brain actually useful. |
| `app/api/chat/route.ts` | **The endpoint** (`POST /api/chat`). Tries Claude first, falls back to the safety net. |
| `components/copilot/TripCopilot.tsx` | **The chat UI** — the floating "✦" button and chat window. |

---

## Why the Copilot used to feel "not smart"

Originally `/api/chat` only ever used `lib/domnerEngine.ts`, and that file matched
**raw keywords**: it scanned your message for letters it had been told about
("esim", "price", "flight") and replied with a sentence written in advance.

Ask *"What can I carry on a flight?"* and it saw the word **flight** and answered
about flight tracking — confidently wrong. Adding more text to it didn't help,
because a keyword matcher has no understanding to improve. That is exactly why
editing it changed nothing.

Both halves of that are now fixed: the free brain understands meaning
(`lib/domnerSearch.ts`), and Claude handles what it can't.

## The free brain: matching meaning, not words

`lib/domnerSearch.ts` replaces keyword matching with **concepts**. "carry",
"bring", "pack", "luggage", "liquids", "power bank" and the Khmer "យក" all point
at one idea — BAGGAGE. Every answer is tagged with the ideas it covers, so a
question finds the right answer even when it uses wording nobody wrote down.

It scores three signals and takes the best answer above a confidence bar:

1. **Concepts** — which ideas is this question about? (the meaning layer)
2. **Words** — which answers share rare, informative words with it?
3. **Places** — did they name a country or airport we have data for?

Real results, all with no API key and no cost:

| Question | Answer it now finds |
| --- | --- |
| "What can I carry on a flight?" | Liquids, power banks, prohibited items |
| "can I bring a power bank in my luggage?" | Same — different words, same idea |
| "is Thailand safe for tourists?" | Thailand's scam warnings |
| "someone tried to rip me off in Bangkok" | Thailand's scams (Bangkok ⇒ Thailand) |
| "how much cash can I bring into Japan" | Japan's cash limit, not eSIM prices |
| "which handset models does this work with" | Phone compatibility |
| "my internet is not working after landing" | eSIM setup steps |
| "what is the capital of Peru" | Honestly says it doesn't know |

That last row matters as much as the rest. If nothing is a confident match it
says so and points at what it does cover, instead of guessing — a wrong answer
delivered confidently is worse than no answer.

**Khmer note:** Khmer is written without spaces between words, so it can't be
split into words the way English can. The search compares short character
sequences instead, which works for both languages with no Khmer dictionary.

**What it is not:** not a neural AI model. It does not learn, and it cannot reason
about something genuinely new — it finds prepared answers, it does not invent
them. Think of it as a very good librarian. Claude is what does the reasoning.

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

## Teaching the free brain new wording

Open `lib/domnerSearch.ts`:

- **New way of asking about something it already covers** → add the phrase to the
  matching entry in `CONCEPTS`. For example, adding `'hand carry'` to `baggage`
  teaches every baggage answer to recognise it. This is the most common edit and
  takes seconds.
- **A brand-new topic** → add an entry to `TOPIC_ANSWERS` with its Khmer and
  English answer and the concepts it covers.
- **New countries, prices, scams, customs rules, airports** → just edit the files
  in `data/`. Those answers are generated automatically; nothing to change here.

> ⚠️ One trap to know about: a passage's concepts are **only** the ones you list
> in its `concepts` field. They are deliberately not guessed from the answer's own
> wording — the phone-compatibility answer contains the word "support", which
> would otherwise tag it as the "contact support" topic and hijack every help
> request. (That bug was real; this is the fix.)

## Teaching Claude new facts

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
