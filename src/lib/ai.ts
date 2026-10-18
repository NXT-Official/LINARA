/**
 * The AI features (SOP generator, appointment sentence parser, Quick Utos
 * router) are hidden until a provider is hooked up. Their edge functions only
 * return canned mock output (KNOWN_GAPS O26), and the mock router rewrote
 * what managers typed. Flip this when they're live.
 */
export const AI_ENABLED = false;
