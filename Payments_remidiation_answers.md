### Q1 — Postgres's own clock and timezone
| now_raw                       | pg_session_tz | pg_current_date | manila_today | utc_today  |
| ----------------------------- | ------------- | --------------- | ------------ | ---------- |
| 2026-08-16 07:21:48.117799+00 | UTC           | 2026-08-16      | 2026-08-16   | 2026-08-16 |


### Q2 — Are stored cutoffs correct, and has anyone been double-paid?
| helper_id                            | cutoff_start | cutoff_end | payout_status | rows_for_this_cutoff | first_attempt                 | last_attempt                  |
| ------------------------------------ | ------------ | ---------- | ------------- | -------------------- | ----------------------------- | ----------------------------- |
| e13ecc26-8d47-4bd6-b887-6406e594247d | 2026-08-01   | 2026-08-15 | processing    | 1                    | 2026-08-14 12:59:41.129985+00 | 2026-08-14 12:59:41.129985+00 |

### Q3 — The duplicate check on its own, stated plainly
Success. No rows returned

### Q4 — Payout states in flight
| payout_status | count | min                           | max                           |
| ------------- | ----- | ----------------------------- | ----------------------------- |
| processing    | 1     | 2026-08-14 12:59:41.129985+00 | 2026-08-14 12:59:41.129985+00 |

### Q5 — Vale settlement sanity
| approved_unsettled | approved_settled | orphaned |
| ------------------ | ---------------- | -------- |
| 0                  | 1                | 0        |

### Q6 — Two dashboard checks, not SQL
This is incorrect, we are subscribed to the correct payout. We even have a successful transaction history for 10k in disbursement from testing. Theres also an attempted transaction which is pending atm, and is how we found out about the currency conversion issue: the (roughly) 3250 peso transaction became PHP 356,250.00. so we ended up dividing it by 100.

