export async function transaction(db, action) {
  // pg.Pool needs one checked-out connection; PGlite supplies a transaction client.
  if (typeof db.connect !== 'function' && typeof db.transaction === 'function') return db.transaction(action);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
