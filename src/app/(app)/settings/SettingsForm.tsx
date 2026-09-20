"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck, Globe2, Loader2, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface KeyState {
  configured: boolean;
  masked: string | null;
}

export interface SettingsInitial {
  millionverifier: KeyState;
  zerobounce: KeyState;
  timezone: string;
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

export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const router = useRouter();
  const [mvKey, setMvKey] = React.useState("");
  const [zbKey, setZbKey] = React.useState("");
  const [timezone, setTimezone] = React.useState(initial.timezone);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, string> = { timezone };
      // Only send a key field when the user typed a new value; empty untouched
      // fields must not overwrite an existing stored key.
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-600" />
            Provider API keys
          </CardTitle>
          <CardDescription>
            Keys for MillionVerifier and ZeroBounce are encrypted at rest
            (AES-256-GCM) and never returned to the browser. Only the last 4
            characters are shown. Leave a field blank to keep the existing key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              MillionVerifier API key
              {initial.millionverifier.configured ? (
                <Badge tone="success" className="gap-1">
                  <Check className="h-3 w-3" /> {initial.millionverifier.masked}
                </Badge>
              ) : (
                <Badge tone="neutral">not set</Badge>
              )}
            </label>
            <Input
              type="password"
              autoComplete="off"
              placeholder={
                initial.millionverifier.configured
                  ? "Enter a new key to replace"
                  : "Paste your MillionVerifier key"
              }
              value={mvKey}
              onChange={(e) => setMvKey(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              ZeroBounce API key
              {initial.zerobounce.configured ? (
                <Badge tone="success" className="gap-1">
                  <Check className="h-3 w-3" /> {initial.zerobounce.masked}
                </Badge>
              ) : (
                <Badge tone="neutral">not set</Badge>
              )}
            </label>
            <Input
              type="password"
              autoComplete="off"
              placeholder={
                initial.zerobounce.configured
                  ? "Enter a new key to replace"
                  : "Paste your ZeroBounce key"
              }
              value={zbKey}
              onChange={(e) => setZbKey(e.target.value)}
            />
          </div>

          {!initial.millionverifier.configured &&
          !initial.zerobounce.configured ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No keys configured yet — verification runs in mock mode using an
                offline heuristic verifier so nothing breaks.
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-brand-600" />
            General configuration
          </CardTitle>
          <CardDescription>
            Default timezone drives business-day follow-up scheduling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 sm:max-w-xs">
            <label className="text-sm font-medium text-gray-700">Timezone</label>
            <Select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save settings
        </Button>
        {saved ? (
          <span className="flex items-center gap-1 text-sm text-accent-700">
            <Check className="h-4 w-4" /> Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
