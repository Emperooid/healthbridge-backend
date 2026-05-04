import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@healthbridge.com';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: await bcrypt.hash('Admin@1234', 12),
        firstName: 'Super',
        lastName: 'Admin',
        role: Role.ADMIN,
      },
    });
    console.log('Seed: admin user created →', adminEmail);
  } else {
    console.log('Seed: admin user already exists, skipping');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
