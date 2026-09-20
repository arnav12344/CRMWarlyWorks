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

// Proof-point / value-prop snippet library (editable data, not hardcoded).
const SNIPPETS = [
  {
    label: "PSLE Proof",
    category: "Proof point",
    body: "Students on WarlyWorks PSLE English practised 3x more comprehension passages and saw an average improvement of 1.5 grades over a term.",
  },
  {
    label: "Teacher Time Saved",
    category: "Proof point",
    body: "Teachers save ~4 hours a week on marking because WarlyWorks auto-grades open-ended English answers with model-based feedback.",
  },
  {
    label: "Free Pilot",
    category: "Offer",
    body: "We can set up a free 4-week pilot for one class — no commitment, and we handle the onboarding.",
  },
  {
    label: "Sign-off",
    category: "Closing",
    body: "Happy to share a 10-minute walkthrough whenever suits you.",
  },
];

// Example templates using merge variables + snippet insertion.
const TEMPLATES = [
  {
    name: "PSLE English — First Touch",
    subject: "Helping {{orgName}} lift PSLE English results",
    body:
      "Hi {{firstName}},\n\nI'm reaching out from WarlyWorks — we build PSLE English practice that adapts to each student. {{snippet:PSLE Proof}}\n\n{{snippet:Free Pilot}}\n\nWould a short chat be useful for the team at {{orgName}}?\n\n{{snippet:Sign-off}}",
  },
  {
    name: "PSLE English — Follow Up",
    subject: "Following up: WarlyWorks for {{orgName}}",
    body:
      "Hi {{firstName}},\n\nJust floating this back to the top of your inbox. {{snippet:Teacher Time Saved}}\n\nWorth a quick look for {{orgName}}?\n\n{{snippet:Sign-off}}",
  },
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

  // Snippets — upsert-by-label (label is not unique, so guard manually).
  for (const s of SNIPPETS) {
    const existing = await prisma.snippet.findFirst({ where: { label: s.label } });
    if (!existing) {
      await prisma.snippet.create({ data: s });
    }
  }

  // Templates — guard by name (not unique in schema).
  const templateIds: Record<string, string> = {};
  for (const t of TEMPLATES) {
    const existing = await prisma.template.findFirst({ where: { name: t.name } });
    const row =
      existing ??
      (await prisma.template.create({
        data: { ...t, variables: JSON.stringify(["firstName", "orgName"]) },
      }));
    templateIds[t.name] = row.id;
  }

  // A starter two-step sequence (first touch + a 2-business-day bump).
  const existingSeq = await prisma.sequence.findFirst({
    where: { name: "PSLE English Outreach" },
  });
  if (!existingSeq) {
    await prisma.sequence.create({
      data: {
        name: "PSLE English Outreach",
        isActive: true,
        steps: {
          create: [
            {
              order: 0,
              dayOffset: 0,
              templateId: templateIds["PSLE English — First Touch"],
              stopOnReply: true,
            },
            {
              order: 1,
              dayOffset: 2,
              templateId: templateIds["PSLE English — Follow Up"],
              stopOnReply: true,
            },
          ],
        },
      },
    });
  }

  console.log(
    "Seed complete: contact types, pipeline stages, snippets, templates, and a starter sequence ready."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
