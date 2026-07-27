import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma";
import { env } from "../src/config/env";

async function main() {
  const { email, password } = env.bootstrapSuperAdmin;

  if (!email || !password) {
    console.log("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set in .env — skipping bootstrap.");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Account already exists for ${email} (role: ${existing.role}) — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "SUPER_ADMIN", emailVerified: true },
  });

  console.log(`Bootstrapped SUPER_ADMIN: ${user.email} (${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
