import { PrismaClient } from '@prisma/client';
import { startOfMonthIST } from '../src/lib/period';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

/**
 * Seed sample project data for a Neon Auth user.
 *
 * Credentials are managed by Neon Auth, so this script does not create a user
 * with a password. Instead, sign up in the app first, copy your Neon Auth user
 * id/email, and run with:
 *
 *   SEED_USER_ID=<neon-auth-user-id> SEED_USER_EMAIL=you@example.com npm run db:seed
 *
 * The user mirror row is created here so the project has an owner.
 */
async function main() {
  const userId = process.env.SEED_USER_ID;
  const email = process.env.SEED_USER_EMAIL;
  const name = process.env.SEED_USER_NAME ?? 'Project Admin';

  if (!userId || !email) {
    console.log(
      'No SEED_USER_ID / SEED_USER_EMAIL provided — skipping sample data.\n' +
        'Sign up in the app, then run:\n' +
        '  SEED_USER_ID=<id> SEED_USER_EMAIL=<email> npm run db:seed',
    );
    return;
  }

  await prisma.user.upsert({
    where: { id: userId },
    update: { email, name },
    create: { id: userId, email, name },
  });

  const existing = await prisma.project.findFirst({ where: { createdBy: userId } });
  if (existing) {
    console.log(`Seed already applied for this user (project ${existing.id}).`);
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: 'My House',
      description: 'Personal house construction ledger',
      startDate: new Date(Date.now() - 30 * DAY),
      status: 'active',
      createdBy: userId,
      members: { create: { userId, role: 'admin' } },
      categories: {
        create: [
          { name: 'Cement', type: 'material' },
          { name: 'Steel', type: 'material' },
          { name: 'Labour', type: 'labour' },
          { name: 'GST', type: 'tax' },
          { name: 'Electricity', type: 'utility' },
        ],
      },
    },
    include: { categories: true },
  });

  const periodStart = startOfMonthIST(new Date());
  const budgetPlan: Record<string, number> = {
    Cement: 50000,
    Steel: 80000,
    Labour: 120000,
    Electricity: 8000,
  };

  for (const cat of project.categories) {
    const planned = budgetPlan[cat.name];
    if (!planned) continue;
    await prisma.budget.create({
      data: {
        projectId: project.id,
        categoryId: cat.id,
        periodType: 'month',
        periodStart,
        plannedAmount: planned,
        createdBy: userId,
        note: 'Initial plan',
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  Project: ${project.name} (${project.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
