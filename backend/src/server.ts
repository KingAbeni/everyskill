import { createApp } from "./app";
import { env } from "./config/env";
import { ensureUploadBucketsExist } from "./config/supabaseStorage";

async function main() {
  await ensureUploadBucketsExist();

  const app = createApp();

  app.listen(env.port, () => {
    console.log(`EverySkill backend listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
