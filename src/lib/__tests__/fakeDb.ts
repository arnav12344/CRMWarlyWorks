/**
 * Minimal in-memory fake of the subset of PrismaClient used by the outreach,
 * sequence and inbound engines. Enough to unit-test sending, reply/bounce
 * processing and suppression without a real database.
 */
import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

function toTime(v: unknown): number {
  return v instanceof Date ? v.getTime() : new Date(v as string).getTime();
}

function matchCond(value: unknown, cond: unknown): boolean {
  if (cond && typeof cond === "object" && !(cond instanceof Date)) {
    const c = cond as Row;
    if ("in" in c) return (c.in as unknown[]).includes(value);
    if ("not" in c) return c.not === null ? value != null : value !== c.not;
    let ok = true;
    if ("gte" in c) ok = ok && value != null && toTime(value) >= toTime(c.gte);
    if ("gt" in c) ok = ok && value != null && toTime(value) > toTime(c.gt);
    if ("lt" in c) ok = ok && value != null && toTime(value) < toTime(c.lt);
    if ("lte" in c) ok = ok && value != null && toTime(value) <= toTime(c.lte);
    return ok;
  }
  if (cond === null) return value == null;
  return value === cond;
}

function matchWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some((c) => matchWhere(row, c));
    if (key === "AND") return (cond as Row[]).every((c) => matchWhere(row, c));
    return matchCond(row[key], cond);
  });
}

function sortRows(rows: Row[], orderBy?: Row): Row[] {
  if (!orderBy) return rows;
  const [[key, dir]] = Object.entries(orderBy);
  return [...rows].sort((a, b) => {
    const d = toTime(a[key]) - toTime(b[key]);
    return dir === "desc" ? -d : d;
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
  snippets: Row[] = [];

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
      const m = this.messages.find((x) =>
        "id" in where ? x.id === where.id : x.messageIdHeader === where.messageIdHeader
      );
      if (!m) return null;
      if (include?.contact) {
        return { ...m, contact: this.contacts.find((c) => c.id === m.contactId) ?? null };
      }
      return m;
    },
    findFirst: async ({ where }: { where?: Row } = {}) =>
      this.messages.find((m) => matchWhere(m, where)) ?? null,
    findMany: async ({ where, orderBy, take }: { where?: Row; orderBy?: Row; take?: number } = {}) => {
      const rows = sortRows(this.messages.filter((m) => matchWhere(m, where)), orderBy);
      return take ? rows.slice(0, take) : rows;
    },
    count: async ({ where }: { where?: Row } = {}) =>
      this.messages.filter((m) => matchWhere(m, where)).length,
    create: async ({ data }: { data: Row }) => {
      if (data.messageIdHeader && this.messages.some((m) => m.messageIdHeader === data.messageIdHeader)) {
        throw new Error("Unique constraint failed on messageIdHeader");
      }
      const row = { id: randomUUID(), createdAt: new Date(), ...data };
      this.messages.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = this.messages.find((m) => m.id === where.id);
      if (row) Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const m of this.messages) {
        if (matchWhere(m, where)) {
          Object.assign(m, data);
          count += 1;
        }
      }
      return { count };
    },
  };

  contact = {
    findUnique: async ({ where }: { where: Row }) =>
      this.contacts.find((c) => c.id === where.id) ?? null,
    findFirst: async ({ where }: { where?: Row } = {}) =>
      this.contacts.find((c) => matchWhere(c, where)) ?? null,
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

  snippet = {
    findMany: async () => this.snippets,
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
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      let count = 0;
      for (const f of this.followUps) {
        if (matchWhere(f, where)) {
          Object.assign(f, data);
          count += 1;
        }
      }
      return { count };
    },
  };
}
