export const lifecycleSchema = {
  id: 'mybookshelf-account-lifecycle',
  schema: {
    appUser: { modelName: 'app_users', fields: {
      authUserId: { type: 'string', required: true, unique: true, fieldName: 'auth_user_id' },
      status: { type: 'string', required: true },
      profileRevision: { type: 'number', required: true, fieldName: 'profile_revision' },
      createdAt: { type: 'date', required: true, fieldName: 'created_at' },
    } },
    recentProof: { modelName: 'account_recent_proofs', fields: {
      digest: { type: 'string', required: true, unique: true },
      authUserId: { type: 'string', required: true, index: true },
      sessionId: { type: 'string', required: true, references: { model: 'session', field: 'id', onDelete: 'cascade' } },
      action: { type: 'string', required: true },
      expiresAt: { type: 'date', required: true },
      verifiedAt: { type: 'date', required: false },
      consumedAt: { type: 'date', required: false },
      emailDigest: { type: 'string', required: false },
      createdAt: { type: 'date', required: true },
    } },
  },
};
