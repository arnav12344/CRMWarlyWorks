"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Globe2, Loader2, Check, Mail, Send, AlertTriangle, Gauge } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface KeyState {
  configured: boolean;
  masked: string | null;
}

export interface SettingsInitial {
  mail: { configured: boolean; user: string | null; fromAddress: string | null; fromName: string | null };
  millionverifier: KeyState;
  zerobounce: KeyState;
  timezone: string;
  dailySendLimit: number;
}

const TIMEZONES = [
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "America/New_York",
  "UTC",
];

export function SettingsForm({ initial, afterMail }: { initial: SettingsInitial; afterMail?: React.ReactNode }) {
  const router = useRouter();
  const [mvKey, setMvKey] = React.useState("");
  const [zbKey, setZbKey] = React.useState("");
  const [timezone, setTimezone] = React.useState(initial.timezone);
  const [limit, setLimit] = React.useState(String(initial.dailySendLimit));
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, string | number> = { timezone };
      const n = Number.parseInt(limit, 10);
      if (Number.isFinite(n) && n > 0) body.dailySendLimit = Math.min(n, 500);
      // Only send key fields the user typed; blank fields keep the stored key.
      if (mvKey.trim()) body.millionverifierKey = mvKey.trim();
      if (zbKey.trim()) body.zerobounceKey = zbKey.trim();
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMvKey("");
      setZbKey("");
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/mail/test", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    setTestResult(
      res.ok
        ? { ok: true, text: `Sent to ${data.to} from ${data.from}. Check your Gmail inbox.` }
        : { ok: false, text: data.error ?? "Test failed." }
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-brand-900" aria-hidden /> Email account
            {initial.mail.configured ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Not connected</Badge>}
          </CardTitle>
          <CardDescription>
            Emails go out through Gmail as your alias. Replies to the alias (forwarded by Cloudflare Email Routing) are
            read from the same inbox. Credentials live in server environment variables, never in the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {initial.mail.configured ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-600">Sends from</dt>
                <dd className="font-semibold text-gray-900">
                  {initial.mail.fromName} &lt;{initial.mail.fromAddress}&gt;
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-600">Through Gmail account</dt>
                <dd className="font-semibold text-gray-900">{initial.mail.user}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-600">Replies read from</dt>
                <dd className="font-semibold text-gray-900">Gmail inbox (IMAP)</dd>
              </div>
            </dl>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Set <code>GMAIL_USER</code>, <code>GMAIL_APP_PASSWORD</code>, <code>MAIL_FROM_ADDRESS</code> and{" "}
                <code>MAIL_FROM_NAME</code> in your environment (Netlify → Site configuration → Environment variables), then
                redeploy.
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={sendTest} disabled={!initial.mail.configured || testing}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              Send test email to myself
            </Button>
            {testResult ? (
              <span role="status" className={testResult.ok ? "text-sm text-emerald-800" : "text-sm text-red-800"}>
                {testResult.text}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {afterMail}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-brand-900" aria-hidden /> Sending limit
          </CardTitle>
          <CardDescription>
            Maximum emails per day (Singapore time). 50 is a safe pace for a personal Gmail doing cold outreach.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-gray-700">Daily send limit</span>
            <Input type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1 text-sm font-medium text-gray-700">
              <Globe2 className="h-3.5 w-3.5" aria-hidden /> Timezone (follow-ups &amp; daily limit)
            </span>
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-900" aria-hidden /> Verification keys
          </CardTitle>
          <CardDescription>
            Encrypted at rest (AES-256-GCM); only the last 4 characters are shown. Leave a field blank to keep the saved
            key. Only addresses you haven&apos;t checked yet use credits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <KeyField
            label="MillionVerifier API key"
            state={initial.millionverifier}
            value={mvKey}
            onChange={setMvKey}
          />
          <KeyField label="ZeroBounce API key" state={initial.zerobounce} value={zbKey} onChange={setZbKey} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save settings
        </Button>
        {saved ? (
          <span role="status" className="flex items-center gap-1 text-sm text-emerald-800">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}

function KeyField({
  label,
  state,
  value,
  onChange,
}: {
  label: string;
  state: KeyState;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium text-gray-700">
        {label}
        {state.configured ? (
          <Badge tone="success">
            <Check className="h-3 w-3" aria-hidden /> {state.masked}
          </Badge>
        ) : (
          <Badge tone="neutral">not set</Badge>
        )}
      </label>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        placeholder={state.configured ? "Enter a new key to replace" : "Paste your key"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
