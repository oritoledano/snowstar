/**
 * StreamDAW through Creem (2026-11-11): its plans move here from Paddle next (streamdaw-paddle.js is the model).
 * Until then an event for a StreamDAW product is recorded by creem.js and left alone here.
 */
export async function onCreemEvent() { return 'streamdaw: not sold through Creem yet'; }
export async function claims() { return false; }
