# Diamond Chatbot

An AI sales assistant for diamond dealers. It talks to customers in natural
language, and answers every question about stock and price by calling the
dealer's own ERP live — it never stores diamond data of its own.

Implements the integration contract in
[`docs/Diamond-Chatbot-Data-and-API-Spec.pdf`](docs/Diamond-Chatbot-Data-and-API-Spec.pdf).

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS 11 (TypeScript) |
| AI | Claude API via `@anthropic-ai/sdk`, tool calling |
| Database | PostgreSQL via TypeORM |
| Cache & jobs | Redis + BullMQ |
| Admin panel | React 19 + Vite |
| Chat widget | React 19 + Vite (embeddable) |

## Layout

```
apps/
  api/       NestJS backend — chat loop, ERP client, webhooks, admin API
  erp-mock/  NestJS stand-in for the dealer's ERP, serving data/diamonds.json
  admin/     React admin panel ("Connect Your System")
  widget/    React chat widget for the dealer's website
packages/
  shared/    The spec's data model and API contract, typed once
```

## How a conversation works

```
Customer message
      ↓
Claude decides which tool it needs
      ↓
Our API calls the dealer's endpoint (spec §3)
      ↓
Result goes back to Claude, and out to the widget as product cards
      ↓
Natural-language reply + cards
```

The nine tools map one-to-one onto the spec's endpoints. Browsing reads go
through a short-TTL Redis cache; anything that commits — availability, hold,
quotation, order — always hits the ERP live.

## Running locally

You need Postgres and Redis. With a working Docker daemon:

```bash
docker compose up -d
```

Without Docker (no root required), `pnpm db:start` creates a private Postgres
cluster under `.devdata/` and runs it on port **5433**, so it never collides
with a system Postgres on 5432. Stop it again with `pnpm db:stop`. Either way,
`REDIS_URL` uses database `1` to keep our cache and queues isolated from
anything else on your Redis.

```bash
cp .env.example .env      # then set ANTHROPIC_API_KEY
pnpm install
pnpm db:start             # or: docker compose up -d
pnpm dev                  # api :3000, admin :5173, widget :5174
```

`pnpm dev` also starts the stand-in ERP on **:4010** with 48 diamonds. To run it
alone:

```bash
pnpm erp                  # :4010, Bearer test-key
```

### The stand-in ERP

[`apps/erp-mock`](apps/erp-mock) implements the full section 3 contract over a
plain JSON file — no database. Edit
[`apps/erp-mock/data/diamonds.json`](apps/erp-mock/data/diamonds.json) to change
the inventory; it is a normal array of the objects described in section 2.

Writes (hold, release, order) mutate an in-memory copy and never rewrite the
file, so restarting returns to a known state and the fixture stays clean in git.
`POST /api/_test/reset` restores it mid-run without a restart — useful between
test cases.

It shares the `@diamond/shared` contract types with the chatbot, so if the spec
changes, both sides fail to compile together instead of drifting apart.

Then open the admin panel at http://localhost:5173 and connect a showroom:

- **API base URL** — `http://localhost:4010`
- **API key** — `test-key`

Hit **Test connection**; it runs a real search against the ERP and reports how
many diamonds it can see. Copy the **widget key** it gives you into
`apps/widget/.env` as `VITE_WIDGET_KEY`, and the widget on :5174 will talk to
your showroom.

## What the dealer's developer has to build

The nine endpoints in spec §3, in whatever language their existing software
already uses. [`apps/erp-mock`](apps/erp-mock) is a working reference covering
every endpoint, including the auth header check, the ordered colour/clarity
scales, and the stock-status transition on hold.

(`apps/api/tools/mock-erp.mjs` is the earlier dependency-free version of the same
thing, kept as a zero-install option and runnable via `pnpm mock-erp:legacy`. The
NestJS app supersedes it — delete the script if you don't want two.)

They should also POST to the **webhook URL** shown in the admin panel whenever a
diamond's price or stock changes (spec §3.11). That keeps our cached search
index fresh so the bot never offers a stone that has just sold. Sign the body
with HMAC-SHA256 using the webhook secret and send it as `X-Webhook-Signature`.

## Design notes

**Every stone is unique, so availability is re-checked before committing.**
`check_availability` is deliberately uncached, and `HoldsService.createHold`
re-verifies against the ERP before reserving — without that, two customers can
be shown the same available diamond and both try to buy it. Orders re-verify
every stone in the basket the same way.

**Holds expire.** When the ERP returns `expires_at`, a BullMQ job is scheduled
for exactly that moment so the local record stays honest and there is a hook for
following up with the customer before the stone goes back on the market.

**The dealer's API key never leaves the server.** The widget authenticates with a
separate public widget key; the ERP credential is encrypted at rest with
AES-256-GCM and only decrypted at the moment of a request.

**We stay under the dealer's rate limit.** A per-tenant token bucket throttles
outbound calls to the configured requests-per-minute, and `429` responses are
retried honouring `Retry-After`.

**The agent loop is hand-written rather than using the SDK's tool runner.** Each
tool result has to fan out two ways — back to the model as a `tool_result`, and
out to the widget as structured cards or a receipt. See
`apps/api/src/chat/chat.service.ts`.

## Before production

- [ ] Put authentication in front of `/admin/*` — it is currently open
- [ ] Replace `DB_SYNCHRONIZE=true` with generated migrations
- [ ] Narrow CORS from `origin: true` to the dealer's domains
- [ ] Add WhatsApp Business Cloud API as a second channel (the `channel` column
      on conversations is already there for it)
- [ ] Rate-limit the public `/chat/message` endpoint per IP
- [ ] Ship structured logging and per-tenant token-cost accounting
