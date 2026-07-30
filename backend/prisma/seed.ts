import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma";
import { env } from "../src/config/env";

const TIER_LEVELS = [
  { name: "Bronze", minXp: 0, order: 1 },
  { name: "Silver", minXp: 500, order: 2 },
  { name: "Gold", minXp: 1500, order: 3 },
  { name: "Platinum", minXp: 3500, order: 4 },
  { name: "Diamond", minXp: 7000, order: 5 },
];

const ACHIEVEMENTS = [
  { code: "FIRST_JOB", name: "First Job", description: "Completed your first booking." },
  { code: "JOBS_50", name: "50 Jobs Completed", description: "Completed 50 bookings." },
  { code: "JOBS_100", name: "100 Jobs Completed", description: "Completed 100 bookings." },
  { code: "JOBS_500", name: "500 Jobs Completed", description: "Completed 500 bookings." },
  { code: "YEAR_1", name: "1 Year on Platform", description: "Member of EverySkill for 1 year." },
  { code: "YEAR_5", name: "5 Years on Platform", description: "Member of EverySkill for 5 years." },
  { code: "FIVE_STAR_100", name: "100 Five-Star Reviews", description: "Received 100 five-star reviews." },
];

async function seedGamification() {
  for (const tier of TIER_LEVELS) {
    await prisma.tierLevel.upsert({
      where: { name: tier.name },
      update: { minXp: tier.minXp, order: tier.order },
      create: tier,
    });
  }

  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      update: { name: achievement.name, description: achievement.description },
      create: achievement,
    });
  }

  const existingSettings = await prisma.gamificationSettings.findFirst();
  if (!existingSettings) {
    await prisma.gamificationSettings.create({ data: {} });
  }

  console.log(`Seeded ${TIER_LEVELS.length} tiers, ${ACHIEVEMENTS.length} achievements, gamification settings.`);
}

async function main() {
  await seedGamification();

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
