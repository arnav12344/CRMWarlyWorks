/**
 * Minimal in-memory fake of the subset of PrismaClient used by the outreach
 * and sequence engines. Enough to unit-test advanceEnrollments / simulateSend /
 * simulateEvent / suppression without a real database.
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

function matchWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object" && "in" in (cond as Row)) {
      const arr = (cond as { in: unknown[] }).in;
      return arr.includes(row[key]);
    }
    return row[key] === cond;
  });
}

export class FakeDb {
  contacts: Row[] = [];
  organizations: Row[] = [];
  pipelineStages: Row[] = [];
  sequences: Row[] = [];
  sequenceSteps: Row[] = [];
  enrollments: Row[] = [];
  messages: Row[] = [];
  activities: Row[] = [];
  followUps: Row[] = [];
  suppressions: Row[] = [];
  templates: Row[] = [];

  private hydrateEnrollment(e: Row): Row {
    const contact = this.contacts.find((c) => c.id === e.contactId);
    const organization = contact
      ? this.organizations.find((o) => o.id === contact.organizationId) ?? null
      : null;
    const messages = this.messages.filter((m) => m.contactId === contact?.id);
    const sequence = this.sequences.find((s) => s.id === e.sequenceId);
    const steps = this.sequenceSteps
      .filter((st) => st.sequenceId === e.sequenceId)
      .sort((a, b) => (a.order as number) - (b.order as number))
      .map((st) => ({
        ...st,
        template: this.templates.find((t) => t.id === st.templateId) ?? null,
      }));
    return {
      ...e,
      contact: contact ? { ...contact, organization, messages } : null,
      sequence: sequence ? { ...sequence, steps } : null,
    };
  }

  sequenceEnrollment = {
    findMany: async ({ where, select }: { where?: Row; select?: Row } = {}) => {
      const rows = this.enrollments.filter((e) => matchWhere(e, where));
      if (where && "status" in where && !select) {
        return rows.map((e) => this.hydrateEnrollment(e));
      }
      if (select) return rows.map((e) => ({ id: e.id }));
      return rows.map((e) => this.hydrateEnrollment(e));
    },
    findFirst: async ({ where }: { where?: Row } = {}) =>
      this.enrollments.find((e) => matchWhere(e, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), enrolledAt: new Date(), currentStep: 0, ...data };
      this.enrollments.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = this.enrollments.find((e) => e.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const e of this.enrollments) {
        if (matchWhere(e, where)) {
          Object.assign(e, data);
          count += 1;
        }
      }
      return { count };
    },
  };

  emailMessage = {
    findUnique: async ({ where, include }: { where: Row; include?: Row }) => {
      const m = this.messages.find((x) => x.id === where.id);
      if (!m) return null;
      if (include?.contact) {
        return { ...m, contact: this.contacts.find((c) => c.id === m.contactId) ?? null };
      }
      return m;
    },
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.messages.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = this.messages.find((m) => m.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
  };

  contact = {
    findUnique: async ({ where }: { where: Row }) =>
      this.contacts.find((c) => c.id === where.id) ?? null,
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = this.contacts.find((c) => c.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
  };

  pipelineStage = {
    findFirst: async ({ where }: { where?: Row } = {}) =>
      this.pipelineStages.find((s) => matchWhere(s, where)) ?? null,
  };

  suppression = {
    findUnique: async ({ where }: { where: Row }) =>
      this.suppressions.find((s) => s.email === where.email) ?? null,
    findMany: async ({ where }: { where?: Row } = {}) =>
      this.suppressions.filter((s) => matchWhere(s, where)),
    upsert: async ({ where, update, create }: { where: Row; update: Row; create: Row }) => {
      const existing = this.suppressions.find((s) => s.email === where.email);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: randomUUID(), createdAt: new Date(), ...create };
      this.suppressions.push(row);
      return row;
    },
  };

  activity = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.activities.push(row);
      return row;
    },
  };

  followUp = {
    create: async ({ data }: { data: Row }) => {
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.followUps.push(row);
      return row;
    },
  };
}
