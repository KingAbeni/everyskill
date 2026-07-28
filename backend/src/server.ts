import { createApp } from "./app";
import { env } from "./config/env";
import { ensureUploadBucketsExist } from "./config/supabaseStorage";
import { startOfflineBillingCron } from "./jobs/offlineBillingCron";

async function main() {
  await ensureUploadBucketsExist();

  const app = createApp();

  app.listen(env.port, () => {
    console.log(`EverySkill backend listening on port ${env.port}`);
  });

  startOfflineBillingCron();
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
