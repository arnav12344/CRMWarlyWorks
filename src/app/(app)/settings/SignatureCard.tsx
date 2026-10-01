"use client";

import * as React from "react";
import { Check, Download, Loader2, PenLine, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import { signaturePreviewDoc } from "@/lib/mail/signature";

export interface SignatureDTO {
  html: string;
  text: string;
  source: "gmail" | "manual";
  updatedAt: string;
}

type Busy = "import" | "save" | "clear" | null;

/**
 * Email signature added to every email (Gmail doesn't add it to mail sent by
 * other apps). Import it from Gmail, or type a plain one. The preview renders
 * in a sandboxed iframe, so imported HTML can't run anything.
 */
export function SignatureCard({ initial, mailConfigured }: { initial: SignatureDTO | null; mailConfigured: boolean }) {
  const [sig, setSig] = React.useState<SignatureDTO | null>(initial);
  const [text, setText] = React.useState(initial?.text ?? "");
  const [busy, setBusy] = React.useState<Busy>(null);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);
  const textId = React.useId();

  async function call(action: Exclude<Busy, null>, payload: Record<string, unknown> = {}) {
    setBusy(action);
    setStatus(null);
    try {
      const res = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ ok: false, text: data.error ?? "Something went wrong." });
        return;
      }
      const next = (data.signature as SignatureDTO | null) ?? null;
      setSig(next);
      setText(next?.text ?? "");
      if (action === "import") {
        const from = data.foundIn?.subject ? ` (from “${data.foundIn.subject}”)` : "";
        const note = data.droppedEmbeddedImages
          ? " An embedded image couldn't be reused — in Gmail, insert signature images by URL instead."
          : "";
        setStatus({ ok: true, text: `Imported your Gmail signature${from}.${note}` });
      } else if (action === "save") {
        setStatus({ ok: true, text: next ? "Signature saved." : "Signature removed." });
      } else {
        setStatus({ ok: true, text: "Signature removed." });
      }
    } catch {
      setStatus({ ok: false, text: "Network error — try again." });
    } finally {
      setBusy(null);
    }
  }

  const textChanged = text.trim() !== (sig?.text ?? "").trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <PenLine className="h-4 w-4 text-brand-900" aria-hidden /> Email signature
          {sig ? (
            <Badge tone="success">{sig.source === "gmail" ? "From Gmail" : "Set"}</Badge>
          ) : (
            <Badge tone="neutral">Not set</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Gmail only adds your signature to emails you write in Gmail, so WarlyWorks adds it to every email it sends
          (first emails and follow-ups). Import it from Gmail — it&apos;s read from a recent email you sent from Gmail on
          the web — or type a simple one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sig ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <p className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">Preview</p>
            <iframe
              title="Signature preview"
              sandbox=""
              srcDoc={signaturePreviewDoc(sig.html)}
              className="block h-40 w-full bg-white"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => call("import")} disabled={!mailConfigured || busy !== null}>
            {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            {sig?.source === "gmail" ? "Re-import from Gmail" : "Import from Gmail"}
          </Button>
          {sig ? (
            <Button variant="ghost" onClick={() => call("clear")} disabled={busy !== null}>
              {busy === "clear" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Remove
            </Button>
          ) : null}
        </div>
        {!mailConfigured ? (
          <p className="text-xs text-gray-600">Connect Gmail (above) to import your signature, or type one below.</p>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor={textId} className="block text-sm font-medium text-gray-700">
            {sig?.source === "gmail" ? "Or replace it with a plain-text signature" : "Or type it yourself"}
          </label>
          <Textarea
            id={textId}
            className="min-h-[110px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={"Thanks,\nArnav\nWarlyWorks · www.warlyworks.com"}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => call("save", { text })} disabled={busy !== null || !textChanged}>
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Save typed signature
            </Button>
            {sig?.source === "gmail" ? (
              <span className="text-xs text-gray-500">Saving typed text replaces the imported Gmail version (logos and links included).</span>
            ) : null}
          </div>
        </div>

        {status ? (
          <p role="status" className={status.ok ? "text-sm text-emerald-800" : "text-sm text-red-800"}>
            {status.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
