// Pushes lead rows to a Google Sheet through the Apps Script web app in
// integrations/google-sheets.gs. Each push upserts one row keyed by leadId,
// so a lead's row moves from "Lead" → "Checkout started" → "Paid".
export function createSheets({ url, secret, fetchImpl = globalThis.fetch, log = console }) {
  const configured = Boolean(url && secret);
  return {
    configured,
    // Fire-and-forget: a slow or failing sheet must never block registration or payment.
    push(row) {
      if (!configured) return Promise.resolve(false);
      return fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, row }),
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      })
        .then(async res => {
          const json = await res.json().catch(() => ({}));
          if (!res.ok || json.ok !== true) throw new Error(json.error || `Sheet responded ${res.status}`);
          return true;
        })
        .catch(err => { log.error('sheets push', row.leadId, row.status, err.message); return false; });
    },
  };
}
