/**
 * Editable CONFIG data shipped with the app: contact types, pipeline stages,
 * proof-point snippets, templates and sequences.
 *
 * These are DATA rows (not enums) — the user can rename/delete them in the UI.
 * `seedConfig()` is idempotent and respectful of user edits: a model is only
 * seeded when its table is completely empty, so re-running it in production
 * never overwrites or duplicates anything the user changed.
 *
 * NOTE: the snippet copy below is starter text. Review it (Sequences &
 * templates → Snippets) before sending real email — claims must be true.
 */
import type { PrismaClient } from "@prisma/client";

export const CONTACT_TYPES = [
  { name: "School", color: "#1E3A8A", description: "Primary and secondary schools" },
  { name: "Tuition Centre", color: "#0284C7", description: "Tuition and enrichment centres" },
  { name: "NGO", color: "#059669", description: "Non-governmental / community organizations" },
  { name: "Funder", color: "#D97706", description: "Grant makers, foundations and funders" },
  { name: "Partner", color: "#7C3AED", description: "Distribution and content partners" },
  { name: "Educator", color: "#DB2777", description: "Individual teachers and tutors" },
];

// Code resolves stages by the stable `role`, never by display name.
export const PIPELINE_STAGES = [
  { name: "New", role: null, order: 0, isPositive: false, isTerminal: false },
  { name: "Verified", role: null, order: 1, isPositive: false, isTerminal: false },
  { name: "Contacted", role: "contacted", order: 2, isPositive: false, isTerminal: false },
  { name: "Replied", role: "replied", order: 3, isPositive: true, isTerminal: false },
  { name: "Positive", role: null, order: 4, isPositive: true, isTerminal: false },
  { name: "Meeting", role: "meeting", order: 5, isPositive: true, isTerminal: false },
  { name: "Closed", role: null, order: 6, isPositive: true, isTerminal: true },
  { name: "Not Interested", role: "not_interested", order: 7, isPositive: false, isTerminal: true },
];

export const SNIPPETS = [
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
    label: "Impact Stat",
    category: "Proof point",
    body: "Over 2,000 Singapore students have completed a WarlyWorks PSLE English module this year.",
  },
  {
    label: "Sign-off",
    category: "Closing",
    body: "Happy to share a 10-minute walkthrough whenever suits you.\n\nBest,\nArnav\nWarlyWorks",
  },
];

export const TEMPLATES = [
  {
    name: "PSLE English — First Touch",
    subject: "Helping {{orgName}} lift PSLE English results",
    body:
      "Hi {{firstName|there}},\n\nI'm reaching out from WarlyWorks — we build PSLE English practice that adapts to each student. {{snippet:PSLE Proof}}\n\n{{snippet:Free Pilot}}\n\nWould a short chat be useful for the team at {{orgName|your school}}?\n\n{{snippet:Sign-off}}",
    variables: ["firstName", "orgName"],
  },
  {
    name: "PSLE English — Follow Up",
    subject: "Following up: WarlyWorks for {{orgName}}",
    body:
      "Hi {{firstName|there}},\n\nJust floating this back to the top of your inbox. {{snippet:Teacher Time Saved}}\n\nWorth a quick look for {{orgName|your team}}?\n\n{{snippet:Sign-off}}",
    variables: ["firstName", "orgName"],
  },
  {
    name: "Funder — Impact Intro",
    subject: "WarlyWorks: measurable PSLE English outcomes for {{orgName}}",
    body:
      "Hi {{firstName|there}},\n\nWarlyWorks helps under-resourced students prepare for PSLE English. {{snippet:Impact Stat}}\n\n{{snippet:PSLE Proof}}\n\nCould we share our impact deck with {{orgName|your team}}?\n\n{{snippet:Sign-off}}",
    variables: ["firstName", "orgName"],
  },
];

export const SEQUENCES = [
  {
    name: "PSLE English Outreach",
    isActive: true,
    steps: [
      { order: 0, dayOffset: 0, template: "PSLE English — First Touch", stopOnReply: true },
      { order: 1, dayOffset: 3, template: "PSLE English — Follow Up", stopOnReply: true },
    ],
  },
  {
    name: "Funder Impact Drip",
    isActive: true,
    steps: [
      { order: 0, dayOffset: 0, template: "Funder — Impact Intro", stopOnReply: true },
      { order: 1, dayOffset: 3, template: "PSLE English — Follow Up", stopOnReply: true },
    ],
  },
];

export interface SeededConfig {
  typeByName: Record<string, string>;
  stageByName: Record<string, string>;
  templateByName: Record<string, string>;
  sequenceByName: Record<string, string>;
  created: string[];
}

/**
 * Seed config data. Each model is seeded only when its table is empty, so this
 * is safe to run repeatedly (including against production).
 */
export async function seedConfig(db: PrismaClient): Promise<SeededConfig> {
  const created: string[] = [];

  if ((await db.contactType.count()) === 0) {
    for (const t of CONTACT_TYPES) await db.contactType.create({ data: t });
    created.push(`${CONTACT_TYPES.length} contact types`);
  }
  if ((await db.pipelineStage.count()) === 0) {
    for (const s of PIPELINE_STAGES) await db.pipelineStage.create({ data: s });
    created.push(`${PIPELINE_STAGES.length} pipeline stages`);
  }
  if ((await db.snippet.count()) === 0) {
    for (const s of SNIPPETS) await db.snippet.create({ data: s });
    created.push(`${SNIPPETS.length} snippets`);
  }
  if ((await db.template.count()) === 0) {
    for (const t of TEMPLATES) {
      await db.template.create({
        data: {
          name: t.name,
          subject: t.subject,
          body: t.body,
          variables: JSON.stringify(t.variables),
        },
      });
    }
    created.push(`${TEMPLATES.length} templates`);
  }

  const templates = await db.template.findMany({ select: { id: true, name: true } });
  const templateByName = Object.fromEntries(templates.map((t) => [t.name, t.id]));

  if ((await db.sequence.count()) === 0) {
    for (const seq of SEQUENCES) {
      await db.sequence.create({
        data: {
          name: seq.name,
          isActive: seq.isActive,
          steps: {
            create: seq.steps.map((st) => ({
              order: st.order,
              dayOffset: st.dayOffset,
              templateId: templateByName[st.template] ?? null,
              stopOnReply: st.stopOnReply,
            })),
          },
        },
      });
    }
    created.push(`${SEQUENCES.length} sequences`);
  }

  const [types, stages, sequences] = await Promise.all([
    db.contactType.findMany({ select: { id: true, name: true } }),
    db.pipelineStage.findMany({ select: { id: true, name: true } }),
    db.sequence.findMany({ select: { id: true, name: true } }),
  ]);

  return {
    typeByName: Object.fromEntries(types.map((t) => [t.name, t.id])),
    stageByName: Object.fromEntries(stages.map((s) => [s.name, s.id])),
    templateByName,
    sequenceByName: Object.fromEntries(sequences.map((s) => [s.name, s.id])),
    created,
  };
}
