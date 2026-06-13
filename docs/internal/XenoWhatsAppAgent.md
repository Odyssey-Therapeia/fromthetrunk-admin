# Xeno WhatsApp Agent

## Purpose

Xeno is the automation persona for the FTT WhatsApp group. Abe remains the human operator and product owner; Xeno is the visible responder that captures bugs, creates tickets, and reports progress.

The agent must keep LLM usage low. It should not run a model every few minutes just to check whether anything happened. Message ingestion, trigger detection, de-duplication, and routing should be deterministic. The LLM should run only after a relevant trigger is found.

## Identity Model

| Actor | Meaning | System handling |
| --- | --- | --- |
| Abe | Human owner and final product decision-maker | Treated as an operator instruction source |
| Xeno | Dedicated automation persona | Own WhatsApp number or API channel; signs all automated replies |
| Reporter | Person who posts a bug or request | Stored on the ticket as reporter/source |
| Group | FTT website WhatsApp group | Stored as the source channel |

Every ticket or reply should record:

- `sourceChannel`: WhatsApp group name or group id
- `sourceMessageId`: provider message id
- `reporterName`
- `reporterPhoneHash` when available. This must be an HMAC-SHA256 of the full
  E.164 phone number using a service-wide secret key, not a plain hash. Store
  only the hex or base64 HMAC value and never persist the raw phone number.
- `detectedTrigger`
- `actor`: `abe`, `xeno`, `reporter`, or `system`
- `notionPageId`
- `replyStatus`: `drafted`, `sent`, `failed`, or `skipped`

Phone hash handling:

- Include a key id with every generated `reporterPhoneHash` so old hashes can be
  verified after rotation.
- Rotate the HMAC secret quarterly.
- Keep the current key plus the previous key ids available for verification for
  up to 30 days.
- Verify hashes by trying the current key first, then falling back to the prior
  key id recorded with the event.
- Retain `reporterPhoneHash` values for 90 days unless a ticket still needs the
  reporter link for active support follow-up.
- Securely delete expired reporter hash values and keep only aggregate counts
  where possible.

## Trigger Rules

The first pass is a string matcher, not an LLM call.

Trigger when a message contains any of:

- `#bug`
- `@xeno`
- `@ai`
- `xeno` plus an imperative phrase such as `look at this`, `ticket this`, `fix this`, `track this`, or `what is this`

Ignore normal chatter unless it is addressed to Xeno. If someone says something social directly to Xeno, create a lightweight acknowledgment event and reply without making a bug ticket.

## Bug Intake Flow

1. Receive message from webhook or watcher.
2. Normalize text and check deterministic triggers.
3. De-dupe by provider message id first, then by channel, reporter identity,
   content hash, and a configurable time window.
4. If no trigger, store minimal metadata and stop.
5. If trigger is present:
   - Split multiple bugs into separate items.
   - Infer tags from deterministic keywords first.
   - Call an LLM only if the message needs summarizing, title generation, or ambiguous splitting.
6. Create one Notion ticket per bug in the FTT bug tracker.
7. Reply as Xeno with an acknowledgment and ticket links.
8. Queue engineering work or create implementation tasks.

## Reply Style

Xeno replies should be short, explicit, and separated from Abe:

```text
Xeno here. Acknowledged and ticketed:

#bug [Website / UI] Our Why section has too many white/blank pages
<notion-link>

I am working through the bugs and will update this group as each one moves live.
```

Do not imply Abe personally typed the message. Avoid using Abe's voice unless Abe explicitly says to send as himself.

## Integration Options

### Preferred: Dedicated Xeno WhatsApp Number With Webhooks

Use a dedicated Xeno phone number joined to the FTT group. A WhatsApp API provider with linked-device or group webhook support can receive group messages and post replies under Xeno's identity.

Benefits:

- Clear separation between Abe and Xeno.
- Event-driven, so no 10-minute LLM polling loop.
- Webhooks can wake the processor only when a message arrives.
- Xeno can safely maintain its own reply history and audit log.

Tradeoffs:

- Requires a provider account and QR/pairing setup.
- Linked-device/session providers can be less official than Meta's Cloud API.
- Needs rate limits and fallback alerts for session expiry.

### Official Meta Route

Use Meta WhatsApp Business Platform only if the account and group feature eligibility match FTT's use case. Group support has stricter constraints than normal one-to-one business messaging, so this must be verified before implementation.

Benefits:

- Most official compliance path.
- Better long-term business infrastructure if eligible.

Tradeoffs:

- More setup friction.
- Existing WhatsApp groups may not map cleanly to Cloud API workflows.
- Eligibility and group limitations must be confirmed live before committing to this path.

### Temporary Fallback: Local Mac Watcher

Use the WhatsApp desktop app on Abe's Mac as a temporary watcher. It can read the visible group every few minutes and run regex triggers before asking Codex or an external service to process.

Benefits:

- Fastest prototype.
- No provider setup.

Tradeoffs:

- Depends on the Mac staying awake and logged in.
- More brittle than webhook-based ingestion.
- Should be treated as a bridge, not production infrastructure.

## Low-Token Processor Shape

```text
WhatsApp webhook/watcher
  -> deterministic trigger detector
  -> de-dupe store
  -> rule-based tagger
  -> LLM only when needed
  -> Notion ticket creator
  -> Xeno reply sender
  -> audit log
```

The trigger detector and de-dupe store should be ordinary TypeScript code. The LLM prompt should receive only the triggered message, short surrounding context, and known bug tracker schema.

The de-dupe store should preserve the channel id, reporter id or
`reporterPhoneHash`, provider message id, content hash, and time-window bucket
even for ignored messages. This prevents identical text from different reporters
or repeated incidents in separate windows from collapsing into one record.

## Initial Notion Ticket Mapping

Created feature ticket:

https://www.notion.so/34d495f481f481b1b349c4be0a1172c1

## Implementation Slices

1. Choose provider and connect Xeno number.
2. Build webhook endpoint and signature/auth validation.
3. Implement deterministic trigger and de-dupe module.
4. Integrate Notion as the ticket adapter.
5. Build the Xeno reply adapter with rate limiting.
6. Maintain an audit table or Notion log.
7. Run dry-run mode for one day before enabling auto-replies.

## Safety Defaults

- Never store secrets in code.
- Store provider tokens in environment variables.
- Store the phone-hash HMAC secret in the secret manager, publish only key ids,
  and rotate it on the quarterly schedule.
- Log message ids and hashes; avoid storing full private chat history unless needed for the ticket.
- Redact OTPs, phone numbers, and unrelated personal messages.
- Add a kill switch: `XENO_WHATSAPP_AGENT_ENABLED=false`.
