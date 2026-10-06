import fs from 'node:fs';
import path from 'node:path';

// Append-only log of confirmed registrations, one JSON object per line.
// Keyed by Razorpay order id so the browser callback and the webhook can
// both report the same payment without creating a duplicate.
export function createRegistrationStore(dir) {
  const file = path.join(dir, 'registrations.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  const byOrder = new Map();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); byOrder.set(r.orderId, r); } catch { /* skip a torn line */ }
    }
  }
  return {
    get: orderId => byOrder.get(orderId),
    // Returns { row, created } — the existing row (created: false) if this order was already recorded.
    record(rec) {
      const existing = byOrder.get(rec.orderId);
      if (existing) return { row: existing, created: false };
      const row = { ...rec, recordedAt: new Date().toISOString() };
      fs.appendFileSync(file, JSON.stringify(row) + '\n');
      byOrder.set(row.orderId, row);
      return { row, created: true };
    },
  };
}
