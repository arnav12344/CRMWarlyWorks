import { NextResponse } from "next/server";
import { parseFile } from "@/lib/import/parseFile";
import { autoGuessMapping, importConfigSchema } from "@/lib/import/mapping";
import { buildImportPlan, runImport } from "@/lib/import/runImport";
import { flattenScraperRows } from "@/lib/import/extractNestedJson";
import { redactSecrets } from "@/lib/import/redactSecrets";

export const runtime = "nodejs";

/**
 * POST /api/import
 *
 * Two modes, selected by the `mode` form field:
 *   - "preview": parse + redact + flatten, return detected columns, discovered
 *     business field names, the redacted-secret count, and a small dry-run plan
 *     WITHOUT writing anything to the database.
 *   - "run": persist Organizations, Contacts, provenance, and activities.
 *
 * The file is read into a Buffer server-side; secrets are redacted before any
 * value is returned to the client or stored.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a file field." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const mode = String(form.get("mode") ?? "preview");
  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = parseFile(buffer, file.name);
  } catch {
    return NextResponse.json(
      { error: "Could not parse the file. Upload a valid CSV or XLSX." },
      { status: 400 }
    );
  }

  if (mode === "preview") {
    // Redact then flatten so preview shows discovered business fields safely.
    let redactedSecretCount = 0;
    const redactedRows = parsed.rows.map((r) => {
      const { value, redactedCount } = redactSecrets(r);
      redactedSecretCount += redactedCount;
      return value;
    });
    const { candidates, rowsWithNestedJson } = flattenScraperRows(redactedRows);

    // Collect the union of discovered business field names for mapping.
    const discovered = new Set<string>();
    for (const c of candidates) {
      for (const key of ["name", "website", "phone", "email", "address", "city", "country", "categories", "title", "fullName"] as const) {
        if (c[key]) discovered.add(key);
      }
      for (const extraKey of Object.keys(c.extra)) discovered.add(extraKey);
    }

    const mappingColumns = Array.from(
      new Set([...parsed.headers, ...discovered])
    );

    return NextResponse.json({
      mode: "preview",
      filename: file.name,
      rowCount: parsed.rows.length,
      headers: parsed.headers,
      discoveredFields: Array.from(discovered),
      mappingColumns,
      autoMapping: autoGuessMapping(mappingColumns),
      businessCount: candidates.length,
      rowsWithNestedJson,
      redactedSecretCount,
      sample: candidates.slice(0, 5).map((c) => ({
        name: c.name,
        website: c.website,
        email: c.email,
        city: c.city,
      })),
    });
  }

  // mode === "run"
  const rawConfig = form.get("config");
  let config;
  try {
    config = importConfigSchema.parse(
      typeof rawConfig === "string" && rawConfig
        ? JSON.parse(rawConfig)
        : { mapping: autoGuessMapping(parsed.headers) }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid import configuration." },
      { status: 400 }
    );
  }

  // Defensive dry run to surface the redaction count even before persistence.
  const plan = buildImportPlan(parsed.rows, config);
  if (plan.orgCount === 0) {
    return NextResponse.json(
      {
        error:
          "No organizations found. Check the column mapping — no source column is mapped to Organization name.",
        redactedSecretCount: plan.redactedSecretCount,
      },
      { status: 422 }
    );
  }

  try {
    const summary = await runImport({ buffer, filename: file.name, config });
    return NextResponse.json({ mode: "run", ...summary });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Import failed unexpectedly.",
      },
      { status: 500 }
    );
  }
}
