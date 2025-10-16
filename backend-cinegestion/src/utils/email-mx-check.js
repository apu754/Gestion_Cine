import dns from 'node:dns/promises';
// Comprueba si un email tiene registros MX válidos
export async function hasMxRecord(email) {
const domain = String(email.split('@')[1] || '').trim();
  if (!domain) return false;
  try {
    const mx = await dns.resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}