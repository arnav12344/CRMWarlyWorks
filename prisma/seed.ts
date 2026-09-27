/**
 * WarlyWorks CRM — DEMO seed (dev only).
 *
 * Wipes transactional data and loads ~25 fake organizations/contacts with
 * sent / replied / bounced history so every page looks alive.
 *
 * SAFETY:
 *   - Refuses to run unless ALLOW_DEMO_SEED=1 (and never with NODE_ENV=production).
 *   - Every demo email uses the reserved `.example` TLD, so even if you click
 *     Send on a demo contact, no real school receives anything.
 *   - Settings (encrypted API keys) are preserved.
 *
 * Production only needs config data: `npm run seed:config`.
 */
import { PrismaClient } from "@prisma/client";
import { seedConfig, CONTACT_TYPES, PIPELINE_STAGES, SNIPPETS, TEMPLATES, SEQUENCES } from "../src/lib/seed/config";
import { demoSeedBlockedReason, toDemoDomain } from "../src/lib/seed/guard";

const blocked = demoSeedBlockedReason(process.env);
if (blocked) {
  console.error(blocked);
  process.exit(1);
}

const prisma = new PrismaClient();

const now = new Date();

// ---------------------------------------------------------------------------
// Sample organizations + contacts.
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

const RAW_SEEDLINGS: Seedling[] = [
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

/** Rewrite every demo address/website onto the reserved .example TLD. */
const SEEDLINGS: Seedling[] = RAW_SEEDLINGS.map((s) => {
  const [local, domain = "demo"] = s.email.split("@");
  return {
    ...s,
    email: `${local}@${toDemoDomain(domain)}`,
    website: s.website ? toDemoDomain(s.website) : "",
  };
});

function verificationRows(kind: VerifyKind, mocked: boolean) {
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

async function reset() {
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
  const { typeByName, stageByName, templateByName, sequenceByName } = await seedConfig(prisma);

  let orgCount = 0;
  let contactCount = 0;

  for (const s of SEEDLINGS) {
    orgCount += 1;
    const domain = s.email.split("@")[1];
    const org = await prisma.organization.create({
      data: {
        name: s.org,
        website: s.website || null,
        domain,
        city: s.city,
        country: "Singapore",
        contactTypeId: typeByName[s.type] ?? null,
        source: "seed",
        dedupeKey: `name:${s.org.toLowerCase()}`,
      },
    });

    const fullName = [s.first, s.last].filter(Boolean).join(" ") || null;
    const contact = await prisma.contact.create({
      data: {
        organizationId: org.id,
        firstName: s.first || null,
        lastName: s.last || null,
        fullName,
        title: s.title || null,
        email: s.email,
        emailDomain: domain,
        isRoleInbox: isRoleInbox(s.email),
        pipelineStageId: stageByName[JOURNEY_STAGE[s.journey]] ?? null,
        status: s.journey === "new" ? "new" : "active",
        suppressed: s.journey === "bounced",
        source: "seed",
      },
    });
    contactCount += 1;

    await prisma.activity.create({
      data: { contactId: contact.id, type: "imported", summary: `Imported from ${s.type} list`, createdAt: daysAgo(20) },
    });

    if (s.journey !== "new") {
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
        data: { verificationConsensus: v.consensus, mailboxType: v.mailbox, likelyIndividual: v.individual },
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

  await prisma.suppression.upsert({
    where: { email: "unsubscribe@oldlist.example" },
    update: {},
    create: { email: "unsubscribe@oldlist.example", reason: "opt-out" },
  });

  console.log(
    `Demo seed complete: ${CONTACT_TYPES.length} contact types, ${PIPELINE_STAGES.length} stages, ` +
      `${SNIPPETS.length} snippets, ${TEMPLATES.length} templates, ${SEQUENCES.length} sequences, ` +
      `${orgCount} organizations, ${contactCount} contacts (all on .example domains).`
  );
}

async function buildJourney(
  contactId: string,
  s: Seedling,
  sequenceByName: Record<string, string>,
  templateByName: Record<string, string>
) {
  const j = s.journey;
  if (j === "new" || j === "verified") return;

  const subject = `Helping ${s.org} lift PSLE English results`;
  const body = `Hi ${s.first || "there"},\n\nReaching out from WarlyWorks about PSLE English practice for ${s.org}.`;

  if (j === "drafted") {
    const draftTemplate = s.type === "Funder" ? "Funder — Impact Intro" : "PSLE English — First Touch";
    await prisma.emailMessage.create({
      data: {
        contactId,
        templateId: templateByName[draftTemplate] ?? null,
        direction: "outbound",
        toAddress: s.email,
        subject,
        body,
        status: "queued",
        createdAt: daysAgo(1),
      },
    });
    await prisma.activity.create({
      data: { contactId, type: "email_queued", summary: `Added to Ready to send: ${subject}`, createdAt: daysAgo(1) },
    });
    return;
  }

  const seqName = s.type === "Funder" ? "Funder Impact Drip" : "PSLE English Outreach";
  const firstTemplate = s.type === "Funder" ? "Funder — Impact Intro" : "PSLE English — First Touch";
  const stopped = j !== "contacted";
  const enrollment = await prisma.sequenceEnrollment.create({
    data: {
      contactId,
      sequenceId: sequenceByName[seqName],
      status: stopped ? "stopped" : "active",
      currentStep: 1,
      stoppedReason: j === "bounced" ? "bounced" : stopped ? "replied" : null,
      enrolledAt: daysAgo(10),
    },
  });
  await prisma.activity.create({
    data: { contactId, type: "sequence_enrolled", summary: `Enrolled in ${seqName}`, createdAt: daysAgo(10) },
  });

  const sentAt = j === "bounced" ? daysAgo(4) : daysAgo(8);
  const firstTouch = await prisma.emailMessage.create({
    data: {
      contactId,
      sequenceEnrollmentId: enrollment.id,
      templateId: templateByName[firstTemplate] ?? null,
      direction: "outbound",
      toAddress: s.email,
      subject,
      body,
      status: j === "bounced" ? "bounced" : "sent",
      sentAt,
      bouncedAt: j === "bounced" ? daysAgo(4) : null,
    },
  });
  await prisma.activity.create({
    data: { contactId, type: "email_sent", summary: `Sent: ${subject}`, createdAt: sentAt },
  });

  if (j === "bounced") {
    await prisma.activity.create({
      data: { contactId, type: "email_bounced", summary: "Bounced — address does not exist", createdAt: daysAgo(4) },
    });
    await prisma.suppression.upsert({
      where: { email: s.email },
      update: { reason: "bounced" },
      create: { email: s.email, reason: "bounced" },
    });
    return;
  }

  if (j === "contacted") {
    await prisma.followUp.create({
      data: { contactId, dueAt: daysAgo(2), reason: "Follow-up 2 business days after send", businessDaysOffset: 2, status: "pending" },
    });
    await prisma.followUp.create({
      data: { contactId, dueAt: endOfToday(), reason: "Follow-up 3 business days after send", businessDaysOffset: 3, status: "pending" },
    });
    return;
  }

  const repliedAt = daysAgo(5);
  await prisma.emailMessage.update({ where: { id: firstTouch.id }, data: { repliedAt } });
  await prisma.emailMessage.create({
    data: {
      contactId,
      direction: "inbound",
      fromAddress: s.email,
      subject: `Re: ${subject}`,
      body: "Thanks for reaching out — this looks interesting. Can you tell me more?",
      status: "replied",
      repliedAt,
      createdAt: repliedAt,
    },
  });
  await prisma.activity.create({
    data: { contactId, type: "email_replied", summary: `Replied: Re: ${subject}`, createdAt: repliedAt },
  });

  if (j === "meeting" || j === "positive" || j === "closed") {
    await prisma.activity.create({
      data: { contactId, type: "stage_changed", summary: `Moved to ${JOURNEY_STAGE[j]}`, createdAt: daysAgo(3) },
    });
  }
  if (j === "meeting") {
    await prisma.followUp.create({
      data: { contactId, dueAt: endOfToday(), reason: "Prep for intro call", businessDaysOffset: 0, status: "pending" },
    });
  }
}

function daysAgo(n: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

function endOfToday(): Date {
  // 17:00 Singapore time today (09:00 UTC).
  const d = new Date(now);
  d.setUTCHours(9, 0, 0, 0);
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
