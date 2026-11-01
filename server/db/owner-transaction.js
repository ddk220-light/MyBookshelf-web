const USER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

// ownerId is resolved by the server's session guard; never take it from JSON.
export async function withOwner(pool, ownerId, run) {
  if (!USER_ID.test(ownerId)) throw new Error('Invalid owner identity.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('mybookshelf.user_id', $1, true)", [ownerId]);
    const user = await client.query('SELECT status FROM app_users WHERE id=$1 FOR UPDATE', [ownerId]);
    if (user.rowCount !== 1 || user.rows[0].status !== 'active') throw new Error('Account is unavailable.');
    const result = await run(client);
    const committed = await client.query('COMMIT');
    if (committed.command !== 'COMMIT') throw new Error('Owner transaction was aborted.');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function assertReadingRole(pool) {
  const { rows: [role] } = await pool.query(`SELECT r.rolsuper, r.rolbypassrls,
    pg_has_role(current_user, c.relowner, 'USAGE') AS owns_private_tables
    FROM pg_roles r CROSS JOIN pg_class c
    WHERE r.rolname=current_user AND c.oid='app_users'::regclass`);
  if (!role || role.rolsuper || role.rolbypassrls || role.owns_private_tables) throw new Error('Reading database role is not isolated.');
}
