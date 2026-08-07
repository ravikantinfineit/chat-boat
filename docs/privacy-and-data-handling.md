# Privacy and data handling

What this platform stores, who else sees it, and what a dealer must tell their
own customers. Written to be handed to a dealer's counsel without a follow-up
call.

## Whose data this is

Two different sets of people, with different protections:

- **Platform users** — the dealer's own staff who sign in. Email, name, a scrypt
  password hash, and a session record in Redis.
- **The dealer's customers** — people who chatted with a widget on a dealer's
  website. They never signed up for anything, cannot log in, and cannot rotate
  what they gave us. Their data gets the stronger treatment below.

Diamond inventory is deliberately **not** stored. It is read live from the
dealer's own system on every request and never persisted.

## What is held about a customer

| Data | Where | At rest |
|---|---|---|
| Name, phone, email | `conversations`, `holds` | **Encrypted** (AES-256-GCM) |
| Phone / email fingerprint | `conversations`, `holds` | HMAC-SHA256, not reversible |
| Message transcript | `chat_messages.content` | **Not encrypted** — see below |
| Anonymous visitor id | `conversations.visitor_id` | Random, browser-local |
| Which tools ran | `tool_call_events` | Tool name and outcome only |

The blind index exists because encryption destroys equality search. Without it,
"delete everything about this customer" could not be executed — the one privacy
operation a dealer is obliged to be able to perform.

The visitor id is a random value in the browser's `localStorage`. It is not a
cookie, carries no identity, and is used only to tell ten conversations from ten
people. Clearing site data ends it.

### Transcripts are not encrypted — say so plainly

`chat_messages.content` holds the full conversation in the model's wire format,
including anything the customer typed. It is replayed to the model on every
turn, so encrypting it would put a decrypt on the hot path of every reply.

That risk is **managed, not eliminated**:

- the retention window deletes it on the client's chosen schedule
- access requires a signed-in session scoped to the owning organisation
- every transcript read writes an `audit_logs` row naming who read it

A customer who volunteers a phone number mid-sentence has it stored in readable
form inside the transcript, even though the same number in the contact columns is
encrypted. This is the honest limitation of the design.

## Sub-processors

**Anthropic, PBC** — conversation content is sent to the Claude API to generate
replies. This makes Anthropic a sub-processor that the dealer **must disclose in
their own privacy notice**. It covers the customer's messages, the assistant's
replies, and the diamond data returned by the dealer's own API during the
conversation.

Not sent to Anthropic: the dealer's ERP credentials, the webhook secret, staff
account details, or any stored contact detail that the customer did not type
into the chat.

There are no other third-party processors. No analytics service, no error
tracker, no CDN, and no webfont request — the admin panel and widget load no
external resources at all.

## Retention

Client-configurable per showroom, default **365 days**, minimum 30, maximum 7
years. A nightly job (03:15) deletes conversations older than the window;
messages and tool-call events cascade with them.

Holds are deliberately **not** swept. An active hold is a live commitment and the
dealer's ERP is still reserving the stone. They are anonymised rather than
deleted on an erasure request, so the dealer keeps the record that a stone was
reserved without keeping who reserved it.

## Right to erasure

`POST /admin/tenants/:tenantId/privacy/erase-customer` with a phone number or
email. It resolves the blind index, deletes every matching conversation and its
messages, and anonymises matching holds. Owners only, irreversible, audited.

The matching lookup endpoint answers "what do you hold about me?" without
deleting anything. Both are audited — an erasure tool that can also be used to
look people up needs a record of who looked.

## Audit log

`audit_logs` records actor, action, showroom, target, IP and timestamp for:
credential reveals, showroom and agent-rule changes, transcript reads, customer
searches, erasures, retention changes, and the nightly sweep.

It holds **no foreign keys** on purpose. The trail must outlive the user, the
showroom and the organisation it describes, so the actor's email is copied in
rather than joined to.

## Security controls relevant to a data-protection review

- Sessions are opaque Redis-backed tokens in an httpOnly cookie, not JWTs, so a
  removed colleague loses access immediately rather than at token expiry.
- Every admin route is scoped to the caller's organisation by a global guard.
  Another organisation's showroom returns **404, not 403** — a 403 would confirm
  the id exists.
- The dealer's ERP API key is encrypted at rest and decrypted only in the moment
  of an outbound request.
- Inventory webhooks are HMAC-SHA256 signed with a per-showroom secret.
- Passwords are scrypt (N=32768, r=8, p=1) and verified in constant time.

## What is not done yet

Stated so nobody assumes otherwise:

- No team invitations — accounts are provisioned directly (Phase 4).
- No automated export of a customer's data. Erasure is implemented; a
  "download everything you hold about me" response would currently be assembled
  by hand from the lookup endpoint.
- Backups, if any are configured at the infrastructure layer, are outside this
  application's retention and erasure guarantees. An erased customer may persist
  in a database backup until that backup expires.
