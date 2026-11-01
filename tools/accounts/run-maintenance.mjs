// For a trusted scheduler, with secrets supplied by its secret manager.
// Response output contains only aggregate job health; never echo headers/URLs.
const origin = "https://mybookshelf-accounts-staging.vercel.app";
const secret = process.env.ACCOUNTS_STAGING_CRON_SECRET,
  bypass = process.env.ACCOUNTS_STAGING_DEPLOYMENT_BYPASS;
if (!secret || secret.length < 32 || !bypass) {
  console.error(
    "Configure the staging maintenance and deployment-protection secrets securely.",
  );
  process.exitCode = 1;
} else
  try {
    const reply = await fetch(origin + "/api/internal/account-jobs", {
      headers: {
        Authorization: "Bearer " + secret,
        "x-vercel-protection-bypass": bypass,
      },
      redirect: "error",
      signal: AbortSignal.timeout(115000),
    });
    const body = await reply.json().catch(() => null);
    if (!reply.ok || !body?.alerts) throw Error("Maintenance unavailable.");
    const overdue = Object.values(body.alerts).some((value) => value === true);
    console.log(
      JSON.stringify({
        ok: !overdue,
        deletionProcessed: body.deletion?.processed ?? 0,
        providerProcessed: body.providers?.processed ?? 0,
        mailProcessed: body.mail?.processed ?? 0,
        alerts: body.alerts,
      }),
    );
    if (overdue) process.exitCode = 1;
  } catch {
    console.error(
      "Staging maintenance failed or exceeded its deadline. Check aggregate job health; credentials and response details are omitted.",
    );
    process.exitCode = 1;
  }
