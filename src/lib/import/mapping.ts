/**
 * Column-mapping configuration.
 *
 * After a file is parsed we know its headers, but the user must confirm which
 * source column maps onto each CRM field. This module defines the Zod schema
 * for that mapping plus header-based auto-guesses so the wizard pre-fills sane
 * defaults.
 *
 * Because the scraper export surfaces business fields from nested JSON, the
 * "columns" the mapping refers to are the discovered/flattened field names, not
 * only the top-level file headers.
 */

import { z } from "zod";

/** The CRM fields a source column can be mapped onto. */
export const MAPPABLE_FIELDS = [
  "orgName",
  "orgWebsite",
  "orgPhone",
  "orgAddress",
  "orgCity",
  "orgCountry",
  "orgCategories",
  "contactEmail",
  "contactFullName",
  "contactTitle",
] as const;

export type MappableField = (typeof MAPPABLE_FIELDS)[number];

/** Zod schema for the column-mapping config. Each field maps to a source
 * column name, or null when unmapped. */
export const columnMappingSchema = z.object({
  orgName: z.string().nullable().optional(),
  orgWebsite: z.string().nullable().optional(),
  orgPhone: z.string().nullable().optional(),
  orgAddress: z.string().nullable().optional(),
  orgCity: z.string().nullable().optional(),
  orgCountry: z.string().nullable().optional(),
  orgCategories: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactFullName: z.string().nullable().optional(),
  contactTitle: z.string().nullable().optional(),
});

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

/** The full import config the wizard submits alongside the file. */
export const importConfigSchema = z.object({
  mapping: columnMappingSchema,
  /** Target ContactType id applied to every imported organization. */
  contactTypeId: z.string().nullable().optional(),
  /** Columns to scan for embedded JSON (defaults applied server-side). */
  jsonColumns: z.array(z.string()).optional(),
});

export type ImportConfig = z.infer<typeof importConfigSchema>;

/** Header-name patterns used to auto-guess each mapping target. */
const GUESS_PATTERNS: Record<MappableField, RegExp> = {
  orgName: /^(name|business[_-]?name|company|company[_-]?name|org|organization|title)$/i,
  orgWebsite: /^(website|web|url|site|homepage|domain|link)$/i,
  orgPhone: /^(phone|phone[_-]?number|tel|telephone|mobile|contact[_-]?number)$/i,
  orgAddress: /^(address|full[_-]?address|formatted[_-]?address|street|location)$/i,
  orgCity: /^(city|town|locality)$/i,
  orgCountry: /^(country|nation)$/i,
  orgCategories: /^(categor(y|ies)|business[_-]?type|tags|sector)$/i,
  contactEmail: /^(email|e[_-]?mail|email[_-]?address|contact[_-]?email)$/i,
  contactFullName: /^(full[_-]?name|contact[_-]?name|person|owner|contact[_-]?person)$/i,
  contactTitle: /^(job[_-]?title|title|role|position|designation)$/i,
};

/**
 * Auto-guess a column mapping from a list of available column names. The first
 * column whose name matches a field's pattern wins; ties never overwrite an
 * earlier assignment.
 */
export function autoGuessMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();

  for (const field of MAPPABLE_FIELDS) {
    const pattern = GUESS_PATTERNS[field];
    const match = columns.find((c) => !used.has(c) && pattern.test(c.trim()));
    if (match) {
      mapping[field] = match;
      used.add(match);
    } else {
      mapping[field] = null;
    }
  }

  return mapping;
}
