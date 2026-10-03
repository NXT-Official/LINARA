/**
 * Whether Linara pays out through its own Xendit account (initiatePayoutFn).
 * Off unless XENDIT_PAYOUTS=on at build time: the household pays her GCash or
 * Maya directly and Linara records it (PayDirectModal, KNOWN_GAPS O35), so
 * Linara holds and moves no money. The Xendit code stays for the client's
 * "debit in advance" option, should they take it.
 */
export const XENDIT_PAYOUTS_ON = process.env.XENDIT_PAYOUTS === "on";
