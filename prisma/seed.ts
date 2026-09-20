/**
 * WarlyWorks CRM — full demonstrable seed.
 *
 * This wipes the transactional data and reseeds everything the app needs to
 * look alive: editable ContactTypes and PipelineStages (DATA rows, NOT a
 * hardcoded enum — you can add/edit/delete "types of people to contact" like
 * NGOs, Funders, etc. from the UI), a proof-point Snippet library and
 * WarlyWorks/PSLE-English Templates, a couple of multi-step Sequences,
 * ~25 sample Organizations + Contacts across every type with varied
 * verification results, several sequence enrollments, sent/replied/bounced
 * EmailMessages, FollowUps (some due today + some overdue), Suppression
 * entries, and an Activity timeline.
 *
 * `npm run seed` is reset-and-reseed: it clears rows in FK-safe order and
 * rebuilds a consistent snapshot so the dashboard, analytics, leads, verify,
 * compose and sequences pages are all populated.
 *
 * DESIGN NOTE: contact types and pipeline stages are just rows here. Adding a
 * new category is another entry in CONTACT_TYPES or a click in the UI — there
 * is no enum of "NGO"/"School" anywhere in the code.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const now = new Date();

// ---------------------------------------------------------------------------
// Editable config DATA
// ---------------------------------------------------------------------------

const CONTACT_TYPES = [
  { name: "School", color: "#4f46e5", description: "Primary and secondary schools" },
  { name: "Tuition Centre", color: "#0ea5e9", description: "Tuition and enrichment centres" },
  { name: "NGO", color: "#10b981", description: "Non-governmental / community organizations" },
  { name: "Funder", color: "#f59e0b", description: "Grant makers, foundations and funders" },
  { name: "Partner", color: "#8b5cf6", description: "Distribution and content partners" },
  { name: "Educator", color: "#ec4899", description: "Individual teachers and tutors" },
];

// Funnel-aligned stages. `isPositive`/`isTerminal` drive analytics + dashboard.
// The outreach engine (src/lib/outreach.ts) and analytics resolve stages by the
// stable `role` machine key (see src/lib/stageRoles.ts), NOT the display
// `name`, so users can freely rename these stages without breaking stage
// movement or the funnel meeting metric. `role` is null for stages with no
// special machine behavior.
const PIPELINE_STAGES = [
  { name: "New", role: null, order: 0, isPositive: false, isTerminal: false },
  { name: "Verified", role: null, order: 1, isPositive: false, isTerminal: false },
  { name: "Contacted", role: "contacted", order: 2, isPositive: false, isTerminal: false },
  { name: "Replied", role: "replied", order: 3, isPositive: true, isTerminal: false },
  { name: "Positive", role: null, order: 4, isPositive: true, isTerminal: false },
  { name: "Meeting", role: "meeting", order: 5, isPositive: true, isTerminal: false },
  { name: "Closed", role: null, order: 6, isPositive: true, isTerminal: true },
  { name: "Not Interested", role: "not_interested", order: 7, isPositive: false, isTerminal: true },
];

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
    label: "Impact Stat",
    category: "Proof point",
    body: "Over 2,000 Singapore students have completed a WarlyWorks PSLE English module this year.",
  },
  {
    label: "Sign-off",
    category: "Closing",
    body: "Happy to share a 10-minute walkthrough whenever suits you.",
  },
];

const TEMPLATES = [
  {
    name: "PSLE English — First Touch",
    subject: "Helping {{orgName}} lift PSLE English results",
    body:
      "Hi {{firstName}},\n\nI'm reaching out from WarlyWorks — we build PSLE English practice that adapts to each student. {{snippet:PSLE Proof}}\n\n{{snippet:Free Pilot}}\n\nWould a short chat be useful for the team at {{orgName}}?\n\n{{snippet:Sign-off}}",
    variables: ["firstName", "orgName"],
  },
  {
    name: "PSLE English — Follow Up",
    subject: "Following up: WarlyWorks for {{orgName}}",
    body:
      "Hi {{firstName}},\n\nJust floating this back to the top of your inbox. {{snippet:Teacher Time Saved}}\n\nWorth a quick look for {{orgName}}?\n\n{{snippet:Sign-off}}",
    variables: ["firstName", "orgName"],
  },
  {
    name: "Funder — Impact Intro",
    subject: "WarlyWorks: measurable PSLE English outcomes for {{orgName}}",
    body:
      "Hi {{firstName}},\n\nWarlyWorks helps under-resourced students prepare for PSLE English. {{snippet:Impact Stat}}\n\n{{snippet:PSLE Proof}}\n\nCould we share our impact deck with {{orgName}}?\n\n{{snippet:Sign-off}}",
    variables: ["firstName", "orgName"],
  },
];

const SEQUENCES = [
  {
    name: "PSLE English Outreach",
    isActive: true,
    steps: [
      { order: 0, dayOffset: 0, template: "PSLE English — First Touch", stopOnReply: true },
      { order: 1, dayOffset: 2, template: "PSLE English — Follow Up", stopOnReply: true },
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

// ---------------------------------------------------------------------------
// Sample organizations + contacts.
//
// `verify` describes the varied verification outcome to simulate:
//   valid | role | catch_all | invalid | unknown
// `mocked` marks the address as verified via the offline mock verifier.
// `stage` is the seeded pipeline stage; `journey` drives the messages/
// follow-ups/activities so the funnel and dashboard have real numbers.
// ---------------------------------------------------------------------------

type Journey = "new" | "verified" | "drafted" | "contacted" | "replied" | "positive" | "meeting" | "closed" | "bounced";
type VerifyKind = "valid" | "role" | "catch_all" | "invalid" | "unknown";

interface Seedling {
  org: string;
  website: string;
  city: string;
  type: string;
  first: string;
  last: string;
  title: string;
  email: string;
  verify: VerifyKind;
  mocked?: boolean;
  journey: Journey;
}

const SEEDLINGS: Seedling[] = [
  // Schools
  { org: "Rivervale Primary School", website: "rivervaleprimary.edu.sg", city: "Singapore", type: "School", first: "Grace", last: "Tan", title: "Head of English", email: "grace.tan@rivervaleprimary.edu.sg", verify: "valid", journey: "meeting" },
  { org: "Northlight Academy", website: "northlight.edu.sg", city: "Singapore", type: "School", first: "Daniel", last: "Lim", title: "Vice Principal", email: "daniel.lim@northlight.edu.sg", verify: "valid", journey: "replied" },
  { org: "Bishan Park Primary", website: "bishanpark.edu.sg", city: "Singapore", type: "School", first: "", last: "", title: "General enquiries", email: "admissions@bishanpark.edu.sg", verify: "role", journey: "contacted" },
  { org: "Greenwood Secondary", website: "greenwoodsec.edu.sg", city: "Singapore", type: "School", first: "Meera", last: "Nair", title: "English Dept Lead", email: "meera.nair@greenwoodsec.edu.sg", verify: "valid", journey: "positive" },
  { org: "Eastwind School", website: "eastwind.edu.sg", city: "Singapore", type: "School", first: "", last: "", title: "Office", email: "info@eastwind.edu.sg", verify: "catch_all", mocked: true, journey: "contacted" },

  // Tuition Centres
  { org: "BrightMinds Tuition", website: "brightminds.sg", city: "Singapore", type: "Tuition Centre", first: "Priya", last: "Sharma", title: "Centre Director", email: "priya@brightminds.sg", verify: "valid", journey: "closed" },
  { org: "ScholarTree Learning", website: "scholartree.sg", city: "Singapore", type: "Tuition Centre", first: "Kevin", last: "Ong", title: "Founder", email: "kevin.ong@scholartree.sg", verify: "valid", journey: "replied" },
  { org: "AceEnglish Centre", website: "aceenglish.sg", city: "Singapore", type: "Tuition Centre", first: "", last: "", title: "Enquiries", email: "enquiry@aceenglish.sg", verify: "role", journey: "contacted" },
  { org: "MindSpark Tuition", website: "mindspark.com.sg", city: "Singapore", type: "Tuition Centre", first: "Rachel", last: "Goh", title: "Principal Tutor", email: "rachel.goh@mindspark.com.sg", verify: "valid", mocked: true, journey: "drafted" },
  { org: "TopScore Learning Hub", website: "topscore.sg", city: "Singapore", type: "Tuition Centre", first: "Marcus", last: "Wee", title: "Owner", email: "marcus@topscore.sg", verify: "invalid", journey: "bounced" },

  // NGOs
  { org: "ReadReach Foundation", website: "readreach.org", city: "Singapore", type: "NGO", first: "Aisha", last: "Rahman", title: "Programme Manager", email: "aisha.rahman@readreach.org", verify: "valid", journey: "positive" },
  { org: "Learning For All SG", website: "learningforall.org.sg", city: "Singapore", type: "NGO", first: "", last: "", title: "Contact", email: "hello@learningforall.org.sg", verify: "role", journey: "contacted" },
  { org: "BridgeEd Community", website: "bridgeed.org", city: "Singapore", type: "NGO", first: "Samuel", last: "Chua", title: "Executive Director", email: "samuel@bridgeed.org", verify: "valid", journey: "replied" },
  { org: "Kampung Learners", website: "kampunglearners.org", city: "Singapore", type: "NGO", first: "Nurul", last: "Iskandar", title: "Outreach Lead", email: "nurul@kampunglearners.org", verify: "catch_all", mocked: true, journey: "verified" },

  // Funders
  { org: "Horizon Education Fund", website: "horizonedfund.org", city: "Singapore", type: "Funder", first: "Elaine", last: "Koh", title: "Grants Director", email: "elaine.koh@horizonedfund.org", verify: "valid", journey: "meeting" },
  { org: "Lotus Giving Circle", website: "lotusgiving.sg", city: "Singapore", type: "Funder", first: "Ravi", last: "Menon", title: "Programme Officer", email: "ravi.menon@lotusgiving.sg", verify: "valid", journey: "replied" },
  { org: "Merlion Foundation", website: "merlionfoundation.org", city: "Singapore", type: "Funder", first: "", last: "", title: "Grants inbox", email: "grants@merlionfoundation.org", verify: "role", journey: "contacted" },
  { org: "SEA Impact Ventures", website: "seaimpact.vc", city: "Singapore", type: "Funder", first: "Cheryl", last: "Ng", title: "Partner", email: "cheryl@seaimpact.vc", verify: "valid", mocked: true, journey: "drafted" },

  // Partners
  { org: "EduCart Distribution", website: "educart.sg", city: "Singapore", type: "Partner", first: "Jason", last: "Teo", title: "Head of Partnerships", email: "jason.teo@educart.sg", verify: "valid", journey: "positive" },
  { org: "PaperTrail Publishing", website: "papertrail.sg", city: "Singapore", type: "Partner", first: "Diana", last: "Lau", title: "Content Lead", email: "diana.lau@papertrail.sg", verify: "valid", journey: "contacted" },
  { org: "ClassConnect", website: "classconnect.io", city: "Singapore", type: "Partner", first: "", last: "", title: "Sales", email: "sales@classconnect.io", verify: "role", journey: "new" },

  // Educators
  { org: "Independent Tutor — Ms. Fauziah", website: "", city: "Singapore", type: "Educator", first: "Fauziah", last: "Malik", title: "Private English Tutor", email: "fauziah.tutor@gmail.com", verify: "valid", mocked: true, journey: "replied" },
  { org: "Independent Tutor — Mr. Raj", website: "", city: "Singapore", type: "Educator", first: "Raj", last: "Kumar", title: "PSLE English Coach", email: "raj.coach@gmail.com", verify: "valid", journey: "contacted" },
  { org: "Independent Tutor — Ms. Wong", website: "", city: "Singapore", type: "Educator", first: "Serene", last: "Wong", title: "English Enrichment Tutor", email: "serene.wong@yahoo.com", verify: "unknown", mocked: true, journey: "new" },
  { org: "Independent Tutor — Mr. Farid", website: "", city: "Singapore", type: "Educator", first: "Farid", last: "Hassan", title: "Language Tutor", email: "farid.badaddress@nowhere.invalid", verify: "invalid", journey: "bounced" },
];

// ---------------------------------------------------------------------------
// Verification result mapping (mirrors src/lib/verify aggregation buckets).
// ---------------------------------------------------------------------------

function verificationRows(kind: VerifyKind, mocked: boolean) {
  // provider result strings mirror EmailVerification.result buckets.
  const provider = mocked ? "mock" : "millionverifier";
  const base = { provider, isFree: false, isRole: false, isDisposable: false, isCatchAll: false };
  switch (kind) {
    case "valid":
      return { rows: [{ ...base, result: "valid", quality: "high" }], consensus: "valid", mailbox: "individual", individual: true };
    case "role":
      return { rows: [{ ...base, result: "valid", quality: "medium", isRole: true }], consensus: "valid", mailbox: "role", individual: false };
    case "catch_all":
      return { rows: [{ ...base, result: "risky", quality: "medium", isCatchAll: true }], consensus: "risky", mailbox: "catchall", individual: false };
    case "invalid":
      return { rows: [{ ...base, result: "invalid", quality: "low" }], consensus: "invalid", mailbox: "unknown", individual: false };
    case "unknown":
    default:
      return { rows: [{ ...base, result: "unknown", quality: "unknown" }], consensus: "unknown", mailbox: "unknown", individual: false };
  }
}

// Which pipeline stage each journey lands on.
const JOURNEY_STAGE: Record<Journey, string> = {
  new: "New",
  verified: "Verified",
  drafted: "Verified",
  contacted: "Contacted",
  replied: "Replied",
  positive: "Positive",
  meeting: "Meeting",
  closed: "Closed",
  bounced: "Not Interested",
};

const ROLE_LOCALPARTS = new Set([
  "info", "admin", "office", "contact", "hello", "enquiry", "enquiries",
  "admissions", "sales", "grants", "support", "team",
]);

function isRoleInbox(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase().split("+")[0] ?? "";
  return ROLE_LOCALPARTS.has(local);
}

// ---------------------------------------------------------------------------
// Reset (FK-safe order) then reseed.
// ---------------------------------------------------------------------------

async function reset() {
  // Child tables first.
  await prisma.importRow.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.sequenceEnrollment.deleteMany();
  await prisma.sequenceStep.deleteMany();
  await prisma.sequence.deleteMany();
  await prisma.suppression.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.template.deleteMany();
  await prisma.snippet.deleteMany();
  await prisma.pipelineStage.deleteMany();
  await prisma.contactType.deleteMany();
  // Keep Settings (encrypted API keys) — do NOT wipe user config.
}

async function main() {
  await reset();

  // Contact types + stages
  const typeByName: Record<string, string> = {};
  for (const t of CONTACT_TYPES) {
    const row = await prisma.contactType.create({ data: t });
    typeByName[t.name] = row.id;
  }

  const stageByName: Record<string, string> = {};
  for (const s of PIPELINE_STAGES) {
    const row = await prisma.pipelineStage.create({ data: s });
    stageByName[s.name] = row.id;
  }

  // Snippets
  for (const s of SNIPPETS) {
    await prisma.snippet.create({ data: s });
  }

  // Templates
  const templateByName: Record<string, string> = {};
  for (const t of TEMPLATES) {
    const row = await prisma.template.create({
      data: {
        name: t.name,
        subject: t.subject,
        body: t.body,
        variables: JSON.stringify(t.variables),
      },
    });
    templateByName[t.name] = row.id;
  }

  // Sequences + steps
  const sequenceByName: Record<string, string> = {};
  for (const seq of SEQUENCES) {
    const row = await prisma.sequence.create({
      data: {
        name: seq.name,
        isActive: seq.isActive,
        steps: {
          create: seq.steps.map((st) => ({
            order: st.order,
            dayOffset: st.dayOffset,
            templateId: templateByName[st.template],
            stopOnReply: st.stopOnReply,
          })),
        },
      },
    });
    sequenceByName[seq.name] = row.id;
  }

  // Organizations + contacts + full journey
  let orgCount = 0;
  let contactCount = 0;

  for (const s of SEEDLINGS) {
    orgCount += 1;
    const domain = s.website || (s.email.includes("@") ? s.email.split("@")[1] : null);
    // Individual educators share free-mail domains (gmail/yahoo), so key on the
    // org name for them to avoid a false dedupe collision.
    const freeDomain = domain
      ? ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"].includes(domain.toLowerCase())
      : false;
    const dedupeKey =
      domain && !freeDomain
        ? `domain:${domain.toLowerCase()}`
        : `name:${s.org.toLowerCase()}`;
    const org = await prisma.organization.create({
      data: {
        name: s.org,
        website: s.website || null,
        domain: domain ? domain.toLowerCase() : null,
        city: s.city,
        country: "Singapore",
        contactTypeId: typeByName[s.type] ?? null,
        source: "seed",
        dedupeKey,
      },
    });

    const fullName = [s.first, s.last].filter(Boolean).join(" ") || null;
    const stageName = JOURNEY_STAGE[s.journey];
    const contact = await prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: s.first || null,
        lastName: s.last || null,
        fullName,
        title: s.title || null,
        email: s.email,
        emailDomain: s.email.includes("@") ? s.email.split("@")[1].toLowerCase() : null,
        isRoleInbox: isRoleInbox(s.email),
        pipelineStageId: stageByName[stageName] ?? null,
        status: s.journey === "new" ? "new" : "active",
        suppressed: s.journey === "bounced",
        source: "seed",
      },
    });
    contactCount += 1;

    await prisma.activity.create({
      data: {
        contactId: contact.id,
        type: "imported",
        summary: `Imported from ${s.type} list`,
        createdAt: daysAgo(20),
      },
    });

    // Verification: everyone past "new" is verified; "verified"+ journeys too.
    const verified = s.journey !== "new";
    if (verified) {
      const v = verificationRows(s.verify, s.mocked ?? false);
      for (const r of v.rows) {
        await prisma.emailVerification.create({
          data: {
            contactId: contact.id,
            email: s.email,
            provider: r.provider,
            result: r.result,
            quality: r.quality,
            isFree: r.isFree,
            isRole: r.isRole,
            isDisposable: r.isDisposable,
            isCatchAll: r.isCatchAll,
            rawJson: JSON.stringify({ seeded: true, kind: s.verify }),
            checkedAt: daysAgo(15),
          },
        });
      }
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          verificationConsensus: v.consensus,
          mailboxType: v.mailbox,
          likelyIndividual: v.individual,
        },
      });
      await prisma.activity.create({
        data: {
          contactId: contact.id,
          type: "verified",
          summary: `Verified: ${v.consensus} (${v.mailbox})${s.mocked ? " — mock" : ""}`,
          createdAt: daysAgo(15),
        },
      });
    }

    await buildJourney(contact.id, s, sequenceByName, templateByName);
  }

  // A couple of extra suppression entries (opt-outs not tied to a bounce).
  await prisma.suppression.upsert({
    where: { email: "unsubscribe@oldlist.sg" },
    update: {},
    create: { email: "unsubscribe@oldlist.sg", reason: "opt-out" },
  });

  // A provenance import batch so the Import page shows history.
  await prisma.importBatch.create({
    data: {
      filename: "google-maps-scraper-export.csv",
      rowCount: 48,
      orgCount,
      contactCount,
      redactedSecretCount: 3,
      createdAt: daysAgo(20),
      rows: {
        create: [
          { raw: JSON.stringify({ name: "Rivervale Primary School", api_key: "[REDACTED]", city: "Singapore" }) },
          { raw: JSON.stringify({ name: "BrightMinds Tuition", token: "[REDACTED]", website: "brightminds.sg" }) },
        ],
      },
    },
  });

  console.log(
    `Seed complete: ${CONTACT_TYPES.length} contact types, ${PIPELINE_STAGES.length} stages, ` +
      `${SNIPPETS.length} snippets, ${TEMPLATES.length} templates, ${SEQUENCES.length} sequences, ` +
      `${orgCount} organizations, ${contactCount} contacts, plus messages / follow-ups / activity.`
  );
}

// ---------------------------------------------------------------------------
// Journey builder: creates messages, enrollments, follow-ups and activity so
// each contact's history is consistent with its pipeline stage.
// ---------------------------------------------------------------------------

async function buildJourney(
  contactId: string,
  s: Seedling,
  sequenceByName: Record<string, string>,
  templateByName: Record<string, string>
) {
  const j = s.journey;
  if (j === "new" || j === "verified") return; // no outbound yet

  // "drafted" — a personalized message sitting in the review-before-send queue.
  if (j === "drafted") {
    const draftTemplate =
      s.type === "Funder" ? "Funder — Impact Intro" : "PSLE English — First Touch";
    await prisma.emailMessage.create({
      data: {
        contactId,
        templateId: templateByName[draftTemplate] ?? null,
        direction: "outbound",
        subject: `Helping ${s.org} lift PSLE English results`,
        body: `Hi ${s.first || "there"},\n\nReaching out from WarlyWorks about PSLE English practice for ${s.org}.`,
        status: "queued",
        createdAt: daysAgo(1),
      },
    });
    await prisma.activity.create({
      data: {
        contactId,
        type: "email_queued",
        summary: "Drafted and queued for review",
        createdAt: daysAgo(1),
      },
    });
    return;
  }

  // Enroll everyone contacted+ into an appropriate sequence.
  const seqName = s.type === "Funder" ? "Funder Impact Drip" : "PSLE English Outreach";
  const firstTemplate =
    s.type === "Funder" ? "Funder — Impact Intro" : "PSLE English — First Touch";

  const enrollmentStatus =
    j === "replied" || j === "positive" || j === "meeting" || j === "closed"
      ? "stopped"
      : j === "bounced"
      ? "stopped"
      : "active";
  const stoppedReason =
    j === "bounced" ? "bounced" : enrollmentStatus === "stopped" ? "replied" : null;

  const enrollment = await prisma.sequenceEnrollment.create({
    data: {
      contactId,
      sequenceId: sequenceByName[seqName],
      status: enrollmentStatus,
      currentStep: 1,
      stoppedReason,
      enrolledAt: daysAgo(10),
    },
  });
  await prisma.activity.create({
    data: {
      contactId,
      type: "sequence_enrolled",
      summary: `Enrolled in ${seqName}`,
      createdAt: daysAgo(10),
    },
  });

  // Bounces are kept recent (within 7 days) so the dashboard "Recent bounces"
  // card is populated.
  const sentAt = j === "bounced" ? daysAgo(4) : daysAgo(8);
  const firstTouch = await prisma.emailMessage.create({
    data: {
      contactId,
      sequenceEnrollmentId: enrollment.id,
      templateId: templateByName[firstTemplate] ?? null,
      direction: "outbound",
      subject: `Helping ${s.org} lift PSLE English results`,
      body: `Hi ${s.first || "there"},\n\nReaching out from WarlyWorks about PSLE English practice for ${s.org}.`,
      status: j === "bounced" ? "bounced" : "sent",
      sentAt,
      bouncedAt: j === "bounced" ? daysAgo(4) : null,
    },
  });
  await prisma.activity.create({
    data: {
      contactId,
      type: "email_sent",
      summary: `Sent (simulated): Helping ${s.org} lift PSLE English results`,
      createdAt: sentAt,
    },
  });

  if (j === "bounced") {
    await prisma.activity.create({
      data: {
        contactId,
        type: "email_bounced",
        summary: "Bounced (simulated)",
        createdAt: daysAgo(4),
      },
    });
    // suppression row for the bounced contact
    await prisma.suppression.upsert({
      where: { email: s.email },
      update: { reason: "bounced" },
      create: { email: s.email, reason: "bounced" },
    });
    return;
  }

  // Contacted-only: schedule follow-ups, some overdue, some due today.
  if (j === "contacted") {
    // Overdue follow-up (in the past)
    await prisma.followUp.create({
      data: {
        contactId,
        dueAt: daysAgo(2),
        reason: "Follow-up 2 business days after send",
        businessDaysOffset: 2,
        status: "pending",
      },
    });
    // Follow-up due today
    await prisma.followUp.create({
      data: {
        contactId,
        dueAt: endOfToday(),
        reason: "Follow-up 3 business days after send",
        businessDaysOffset: 3,
        status: "pending",
      },
    });
    return;
  }

  // replied / positive / meeting / closed all have an inbound reply.
  const repliedAt = daysAgo(5);
  await prisma.emailMessage.update({
    where: { id: firstTouch.id },
    data: { openedAt: daysAgo(7), repliedAt },
  });
  await prisma.emailMessage.create({
    data: {
      contactId,
      direction: "inbound",
      subject: `Re: Helping ${s.org} lift PSLE English results`,
      body: "Thanks for reaching out — this looks interesting. Can you tell me more?",
      status: "replied",
      repliedAt,
    },
  });
  await prisma.activity.create({
    data: {
      contactId,
      type: "email_replied",
      summary: "Replied (simulated)",
      createdAt: repliedAt,
    },
  });

  if (j === "meeting" || j === "positive" || j === "closed") {
    await prisma.activity.create({
      data: {
        contactId,
        type: "stage_changed",
        summary: `Moved to ${JOURNEY_STAGE[j]}`,
        createdAt: daysAgo(3),
      },
    });
  }
  if (j === "meeting") {
    // upcoming meeting reminder due today
    await prisma.followUp.create({
      data: {
        contactId,
        dueAt: endOfToday(),
        reason: "Prep for intro call",
        businessDaysOffset: 0,
        status: "pending",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

function endOfToday(): Date {
  const d = new Date(now);
  d.setHours(17, 0, 0, 0);
  return d;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
