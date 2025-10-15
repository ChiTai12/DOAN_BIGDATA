import driver from '../db/driver.js';

function toNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && typeof raw.toNumber === 'function') return raw.toNumber();
  if (typeof raw === 'object' && typeof raw.low === 'number') return raw.low;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsedIso = Date.parse(raw);
    if (!isNaN(parsedIso)) return parsedIso;
    const n = Number(raw);
    if (!isNaN(n)) return n;
  }
  return null;
}

function normalizeMillis(ts) {
  if (ts == null) return null;
  // heuristic: if looks like seconds (less than 1e11), convert to ms
  if (ts < 1e11) return ts * 1000;
  return ts;
}

async function main() {
  const dateArg = process.argv[2] || '2025-10-15';
  const target = new Date(dateArg + 'T00:00:00');
  const start = new Date(target);
  const end = new Date(target);
  end.setDate(end.getDate() + 1);
  const startMs = start.getTime();
  const endMs = end.getTime();

  console.log(`Checking registrations between ${new Date(startMs).toISOString()} and ${new Date(endMs).toISOString()}`);

  const session = driver.session();
  try {
    const res = await session.run(`MATCH (u:User) RETURN u.id AS id, u.username AS username, u.createdAt AS createdAt`);
    let count = 0;
    const rows = [];
    for (const r of res.records) {
      const raw = r.get('createdAt');
      const n = toNumber(raw);
      const ms = normalizeMillis(n);
      if (ms && ms >= startMs && ms < endMs) {
        count++;
        rows.push({ id: r.get('id'), username: r.get('username'), createdAt: ms });
      }
    }
    console.log('Count for', dateArg, ':', count);
    if (rows.length > 0) {
      console.log('Sample entries (first 50):');
      for (let i = 0; i < Math.min(50, rows.length); i++) {
        const it = rows[i];
        console.log(i + 1, it.id, it.username, new Date(it.createdAt).toISOString());
      }
    }
  } catch (e) {
    console.error('Error querying users:', e);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
