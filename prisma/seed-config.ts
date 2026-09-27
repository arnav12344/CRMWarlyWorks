/**
 * Config-only seed: contact types, pipeline stages, snippets, templates and
 * sequences. Idempotent — each model is only seeded when its table is empty,
 * so it is safe to run against production (`npm run seed:config`).
 */
import { PrismaClient } from "@prisma/client";
import { seedConfig } from "../src/lib/seed/config";

const prisma = new PrismaClient();

seedConfig(prisma)
  .then(({ created }) => {
    console.log(created.length ? `Seeded: ${created.join(", ")}.` : "Config already present — nothing to do.");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
