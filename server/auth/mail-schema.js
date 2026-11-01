// Custom application models registered with the pinned library's public adapter.
// This lets mail enqueue join its current signup/reset transaction.
export const accountMailSchema = {
  id: 'mybookshelf-account-mail',
  schema: {
    accountMail: { modelName: 'account_mail_jobs', fields: {
      kind: { type: 'string', required: true },
      authUserId: { type: 'string', required: false, index: true },
      payload: { type: 'string', required: true },
      status: { type: 'string', required: true, index: true },
      attempts: { type: 'number', required: true },
      availableAt: { type: 'date', required: true, index: true },
      leaseUntil: { type: 'date', required: false },
      leaseOwner: { type: 'string', required: false },
      expiresAt: { type: 'date', required: true },
      createdAt: { type: 'date', required: true },
      lastError: { type: 'string', required: false },
    } },
    accountChallenge: { modelName: 'account_email_challenges', fields: {
      digest: { type: 'string', required: true, unique: true },
      authUserId: { type: 'string', required: true, index: true },
      purpose: { type: 'string', required: true },
      sessionId: { type:'string',required:false,references:{model:'session',field:'id',onDelete:'cascade'} },
      targetEmail: { type:'string',required:false },
      expiresAt: { type: 'date', required: true },
      usedAt: { type: 'date', required: false },
      createdAt: { type: 'date', required: true },
    } },
  },
};
