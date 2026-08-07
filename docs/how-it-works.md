# How the chatbot works

The flow from a customer typing a message to a diamond being reserved.

## The rule everything follows from

**We store no diamond data.** Stock and prices live in the dealer's ERP and are
read live on every question (spec §1). The chatbot keeps only conversations,
holds it created, and each showroom's connection settings.

That single constraint explains most of the design below: why there is a tool
loop at all, why availability is re-checked before every commitment, and why the
cache is deliberately short-lived.

## The pieces

| Part | Job |
|---|---|
| **Widget** (`apps/widget`) | Chat UI on the dealer's website. Talks only to our API. |
| **API** (`apps/api`) | Runs the conversation, calls Claude, calls the dealer's ERP. |
| **Claude** | Decides *which* question to ask the ERP, and writes the reply. |
| **Dealer's ERP** | The truth about stock and price. We never write inventory, only holds/quotes/orders. |
| **Postgres** | Conversations, messages, holds, showroom settings. |
| **Redis** | Short-lived cache of browsing results, plus the hold-expiry queue. |

## A turn, step by step

Customer: *"Please hold the 0.82 carat one. I'm Pandit, +91 98765 43210."*

```
Widget ──POST /chat/message (X-Widget-Key)──▶ API
                                              │
                                    1. resolve showroom from widget key
                                    2. load conversation history from Postgres
                                    3. open SSE stream back to the widget
                                              │
                                              ▼
                                        ┌── Claude ──┐
                                        │            │  "I need to check stock first"
                                        └─────┬──────┘
                                              │ tool_use: check_availability
                                    4. call the dealer's ERP, live
                                              │ tool_result
                                        ┌── Claude ──┐
                                        │            │  "still available — reserve it"
                                        └─────┬──────┘
                                              │ tool_use: hold_diamond
                                    5. re-verify, reserve in ERP, save locally,
                                       queue the expiry job
                                              │ tool_result
                                        ┌── Claude ──┐
                                        │            │  writes the reply
                                        └─────┬──────┘
                                              ▼
                                    6. text streams to the widget, then done
```

The loop ends when Claude stops asking for tools. It is capped at 8 iterations
so a confused turn cannot spin.

### What the widget actually receives

Server-Sent Events, in this real order from the turn above:

```
1. conversation                 the id, so follow-up messages join the same thread
2. tool  -> check_availability  drives the "Confirming availability…" indicator
3. tool  -> hold_diamond
4. receipt (hold)               structured confirmation block
5. text (streaming deltas)      the reply, a few characters at a time
6. done
```

Two channels, one turn. Prose streams as `text`; anything structured — product
cards, comparison tables, receipts — arrives as its own event built from the
tool result, not parsed out of the model's words. The widget holds the
structured blocks until `done` so the customer reads the recommendation first
and *then* sees what it refers to.

## Read path vs write path

The difference matters, and it is deliberate.

**Reading (browsing)** goes through a Redis cache with a short TTL — 60s for
searches, 5min for one diamond. A customer refining "show me ovals… now under
$8,000" would otherwise hammer the dealer's database. If the ERP pushes an
inventory webhook (§3.11), the affected entries are dropped immediately.

**Writing (committing)** never touches the cache. `check_availability`,
`hold_diamond`, `create_quotation` and `place_order` always hit the ERP live.

### The write flow in detail — `hold_diamond`

Every stone is one of a kind, so the order here is load-bearing:

1. **Re-verify with the ERP.** A search result seconds old is not proof. If the
   status is anything but `In Stock`, stop and tell the customer honestly.
2. **Reserve in the ERP.** The dealer's system is the one that decides; it
   returns a `hold_id` and an `expires_at`.
3. **Record it locally** so the bot can answer "is my stone still held?" and the
   dealer can see what the chatbot reserved.
4. **Queue an expiry job** for exactly `expires_at`.

Steps 1–3 are the guard against selling the same stone twice. Step 4 is a
convenience and is explicitly **not allowed to fail the hold** — by then the
stone is already reserved and recorded, so throwing would report failure for
something that succeeded, and the retry would find the stone "taken" by the
customer's own hold.

`place_order` follows the same shape, re-verifying *every* stone in the basket
before taking payment details.

## What keeps it honest

- **Nothing about stock is said from memory.** The system prompt forbids
  quoting a price or availability that did not come from a tool call.
- **Contact details are never invented.** Name and phone are required before any
  hold, quote or order; the model must ask.
- **The dealer's API key never reaches the browser.** The widget authenticates
  with a separate public key; the ERP credential is encrypted at rest and
  decrypted only for the moment of a request.
- **We stay under the dealer's rate limit.** A per-showroom token bucket
  throttles outbound calls, and `429` responses are retried honouring
  `Retry-After`.
- **Tool failures are handed back to the model**, not thrown at the customer, so
  it can apologise or try another route instead of the turn dying.

## Cost shape

Input tokens dominate — the tool definitions and system prompt are re-sent on
every model call, and a turn makes roughly two. Both are therefore held behind a
cache breakpoint, shared across every conversation and every showroom, which
cuts billed input by about two thirds. The model is also given a trimmed copy of
each tool result: image and certificate URLs are stripped, since it can neither
fetch nor reason about them, while the widget's cards keep the full objects.
