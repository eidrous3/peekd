# Compose tracking pixel — manual test plan

Prerequisites: migration `20250623120000_create_tracked_emails.sql` applied in Supabase; Netlify env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Gmail OAuth configured; deploy includes `fetch-apple-egress-ips.js` build step.

---

## 1. Send injects pixel and saves DB rows

1. Log in to the dashboard and open **Compose**.
2. Send a test email to an address you control (subject: `Peekd tracking test 1`).
3. In Gmail **Sent**, open the message → **Show original** or view HTML source.
4. **Expect:** one hidden `<img>` per recipient pointing to `/.netlify/functions/track-open?k=...`.
5. In Supabase **Table Editor**:
   - `tracked_emails`: new row with your `user_id`, `subject`, `gmail_message_id` filled.
   - `tracked_recipients`: one row per TO address with unique `pixel_token`.

| Pass | Fail |
|------|------|
| Pixel in HTML + DB rows | Missing pixel or empty `tracked_emails` |

---

## 2. Pixel endpoint records opens

1. Copy a `pixel_token` from `tracked_recipients`.
2. Visit `https://getpeekd.com/.netlify/functions/track-open?k=TOKEN` in a browser (or curl).
3. **Expect:** tiny/blank image loads (1×1 GIF).
4. In Supabase `email_open_events`: new row with `classification` (`unknown` or `likely_proxy` from browser).

Repeat the URL once.

| Pass | Fail |
|------|------|
| Two rows in `email_open_events` | No rows or 500 error |

---

## 3. Real open from recipient inbox

1. Open the test email in a second mailbox (Gmail web with images enabled).
2. Wait ~30 seconds, refresh Supabase `email_open_events`.
3. **Expect:** at least one new event; if Gmail proxy UA, `classification = likely_proxy`.

| Pass | Fail |
|------|------|
| New open event after reading mail | No new events |

---

## 4. Inbox shows tracking on sent mail

1. In Peekd **Inbox**, refresh (or re-open page).
2. Find the sent test email (now loads **INBOX + SENT**).
3. **Expect:**
   - Row shows recipient name (not your own Gmail) for sent items.
   - If countable opens > 0: badge **OPENED**, opens chip, timeline with **Sent** + open entries.
4. Open detail → **Activity Timeline**.
5. **Expect:** proxy opens (if any) show muted *Likely proxy open (Apple Mail)* line; countable opens increment the badge.

| Pass | Fail |
|------|------|
| Sent email visible with correct opens/timeline | `opens: 0` forever or email missing |

---

## 5. Re-open (“opened again”)

1. Close and re-open the same test email in the recipient client (or hit pixel URL again if simulating human opens).
2. Refresh Peekd Inbox detail.
3. **Expect:** open count increases; timeline shows *opened again (×N)* for countable events.

| Pass | Fail |
|------|------|
| Count increases on re-open | Stuck at 1 |

---

## 6. Multi-recipient send

1. Compose to **two** addresses you control.
2. **Expect:** two pixels in HTML; two `tracked_recipients` rows.
3. Open from only one recipient.
4. **Expect:** `recipientOpens` / per-recipient stats differ in detail view.

| Pass | Fail |
|------|------|
| Independent tokens and counts per recipient | Single shared token |

---

## 7. Apple Mail Privacy (optional)

1. Send to an **iCloud / Apple Mail** address with Mail Privacy Protection on.
2. **Expect:** often an immediate `likely_proxy` open (seconds after send).
3. In Peekd timeline: flagged proxy line; **open badge may stay SENT** if only proxy events exist.

| Pass | Fail |
|------|------|
| Proxy event flagged, excluded from count | Proxy counted as real open |

---

## 8. Free plan branding + tracking together

1. As free user, send tracked email.
2. **Expect:** “Tracked by Peekd” footer **and** pixel still present before footer.

---

## Quick SQL checks

```sql
-- Latest tracked send
select * from tracked_emails order by sent_at desc limit 5;

-- Opens for a send
select e.*, r.email
from email_open_events e
join tracked_recipients r on r.id = e.tracked_recipient_id
join tracked_emails t on t.id = r.tracked_email_id
order by e.opened_at desc limit 20;
```

---

## Rollback / debug

- **No pixel on send:** check Netlify function logs for `[gmail-send] tracking setup failed`.
- **Pixel 404:** confirm `track-open.mjs` deployed.
- **DB empty:** confirm service role key on Netlify; migration applied.
- **Inbox still 0 opens:** confirm `gmail_message_id` on `tracked_emails` matches Gmail message `id` in SENT.
