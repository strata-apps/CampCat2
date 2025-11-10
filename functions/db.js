// functions/db.js  (shim)
// Re-export the real root-level db.js
export * from '../db.js';
export { default } from '../db.js'; // harmless if no default export
