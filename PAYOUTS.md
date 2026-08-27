# Paying artists their cut

## What is built

Every paid licence now writes one `earnings` row per shareholder — the licence,
the gross, the share in basis points, the amount in agorot — and queues an email
to that person telling them their track was licensed and what they earned. The
email goes through `mail_outbox`, so it waits for you before it leaves.

Splits come from `collaborators.share_bp` on the original submission. If a track
has no declared split, the uploader holds 100% of the artist pool, because they
are the only person who has claimed it. The house keeps `ARTIST_SHARE_BP`
(currently 50%) before splitting; that constant lives in one place in
`worker/src/earnings.js`.

Shares are divided against the **declared** total rather than an assumed 100%,
so a half-filled split sheet pays the right ratio instead of quietly paying out
less than was collected.

`/earnings` shows who is owed what. `/earnings/settle` records that somebody was
paid, and requires a reference.

## What is deliberately not built

**Anything that moves money.** No automatic transfers, no stored bank details,
no card-on-file payouts. Three reasons, in order of how much they should worry
you:

1. Paying a person is a taxable event on both sides. In Israel you generally
   need a **חשבונית מס / קבלה** from them, or you are withholding tax you have
   not accounted for. A button that transfers money does not produce that
   document, and the missing paperwork is your problem at year end, not theirs.
2. An automated payout fires on a database row. If the row is wrong — a
   duplicated webhook, a mis-parsed split, a test licence in production — the
   money is gone before anyone reads it. Every other irreversible thing in this
   system asks first.
3. Holding artists' bank details raises your obligations sharply for very little
   gain at this volume.

## Recommended strategy

**Accrue automatically, settle manually, on request, against an invoice.**

1. **Accrue on every paid licence.** Already working. The artist hears within
   minutes that their track earned, which is most of the perceived value — the
   complaint artists have about libraries is silence, not slowness.
2. **Set a threshold.** ₪250 is in the email copy now. Below that the paperwork
   costs more than the payment. Artists can ask earlier and you can say yes.
3. **Settle on request, not on schedule.** A quarterly run means chasing invoices
   from people who have moved on. Reply-to-be-paid puts the initiative with the
   person who wants the money.
4. **Require an invoice** (חשבונית or a signed receipt for an עוסק פטור). This
   is the step that makes the whole thing legal and auditable, and it is why the
   settle endpoint refuses to record a payout without a reference.
5. **Pay by bank transfer**, and paste the transfer reference into settle. For
   artists abroad, Wise costs less than PayPal and produces a cleaner record.

## When to revisit

If you pass roughly **50 settlements a quarter**, the manual step becomes the
bottleneck and it is worth looking at a payouts provider — Tipalti and Trolley
both handle the invoice collection and tax forms, which is the part you actually
want automated, not the transfer itself. Below that volume they cost more than
they save.

## The number to watch

`SELECT SUM(amount_agorot) FROM earnings WHERE status='accrued'` is your
liability. It is real money you owe whether or not anyone has asked for it, and
it should be visible next to the revenue figures rather than discovered.
