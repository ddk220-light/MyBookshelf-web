// Called only after the auth library has validated a verified server session.
// auth_user_id is taken from that session, never client-supplied JSON.
export async function resolveAppIdentity(pool, authUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO app_users(auth_user_id) VALUES ($1) ON CONFLICT (auth_user_id) DO NOTHING', [authUserId]);
    const { rows: [user] } = await client.query('SELECT id, status FROM app_users WHERE auth_user_id=$1 FOR UPDATE', [authUserId]);
    if (!user || user.status !== 'active') { await client.query('ROLLBACK'); return null; }
    await client.query('INSERT INTO user_settings(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
    await client.query('COMMIT');
    return user.id;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function assertAuthRole(pool) {
  const { rows: [role] } = await pool.query(`SELECT r.rolsuper, r.rolbypassrls,
    pg_has_role(current_user, c.relowner, 'USAGE') AS owns_auth_tables
    FROM pg_roles r CROSS JOIN pg_class c
    WHERE r.rolname=current_user AND c.oid='"user"'::regclass`);
  if (!role || role.rolsuper || role.rolbypassrls || role.owns_auth_tables) throw new Error('Auth database role is not isolated.');
}
