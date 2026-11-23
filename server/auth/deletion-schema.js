export const deletionSchema = {
  id: "mybookshelf-account-deletion",
  schema: {
    accountDeletion: {
      modelName: "account_deletions",
      fields: {
        authUserId: { type: "string", required: true },
        appUserId: { type: "string", required: true },
        receiptDigest: { type: "string", required: true },
        status: { type: "string", required: true },
        requestedAt: { type: "date", required: true },
        cleanedAt: { type: "date", required: false },
        ledgerCompletedAt: { type: "date", required: false },
        availableAt: { type: "date", required: true },
        leaseUntil: { type: "date", required: false },
        leaseOwner: { type: "string", required: false },
        attempts: { type: "number", required: true },
        lastError: { type: "string", required: false },
      },
    },
    providerCleanup: {
      modelName: "account_provider_cleanup",
      fields: {
        authUserId: { type: "string", required: true },
        deletionId: { type: "string", required: false },
        provider: { type: "string", required: true },
        payload: { type: "string", required: true },
        status: { type: "string", required: true },
        availableAt: { type: "date", required: true },
        expiresAt: { type: "date", required: true },
        leaseUntil: { type: "date", required: false },
        leaseOwner: { type: "string", required: false },
        attempts: { type: "number", required: true },
        createdAt: { type: "date", required: true },
        lastError: { type: "string", required: false },
      },
    },
  },
};
