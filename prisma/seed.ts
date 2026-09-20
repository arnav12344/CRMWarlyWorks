/**
 * Placeholder seed. The full seed (contact types, pipeline stages, sample
 * data, templates, snippets, sequences) lands in FEAT-005. For now we insert
 * the data-driven config rows the app shell relies on, using upserts so this
 * is safe to run repeatedly.
 *
 * IMPORTANT: contact types are DATA, not a hardcoded enum. Adding a new type
 * (e.g. another organization category) is just another row here or in the UI.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTACT_TYPES = [
  { name: "Schools", color: "#4f46e5", description: "Primary/secondary schools" },
  { name: "Tuition Centres", color: "#0ea5e9", description: "Tuition and enrichment centres" },
  { name: "NGOs", color: "#10b981", description: "Non-governmental organizations" },
  { name: "Funders", color: "#f59e0b", description: "Grant makers and funders" },
  { name: "Partners", color: "#8b5cf6", description: "Distribution and content partners" },
  { name: "Educators", color: "#ec4899", description: "Individual teachers and tutors" },
];

const PIPELINE_STAGES = [
  { name: "New", order: 0, isPositive: false, isTerminal: false },
  { name: "Contacted", order: 1, isPositive: false, isTerminal: false },
  { name: "Replied", order: 2, isPositive: true, isTerminal: false },
  { name: "Meeting", order: 3, isPositive: true, isTerminal: false },
  { name: "Won", order: 4, isPositive: true, isTerminal: true },
  { name: "Not Interested", order: 5, isPositive: false, isTerminal: true },
];

async function main() {
  for (const t of CONTACT_TYPES) {
    await prisma.contactType.upsert({
      where: { name: t.name },
      update: {},
      create: t,
    });
  }

  for (const s of PIPELINE_STAGES) {
    await prisma.pipelineStage.upsert({
      where: { name: s.name },
      update: {},
      create: s,
    });
  }

  console.log("Seed complete: contact types and pipeline stages ready.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
