"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailPlus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

interface Option {
  id: string;
  name: string;
}

type FollowUpMode = "default" | "date" | "none";

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local inputs. */
function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const labelCls = "mb-1 block text-sm font-medium text-gray-700";

/**
 * "Log an email I sent" — records an email sent from the user's own mail app
 * so the CRM tracks replies, follow-ups and pipeline for it. Sends nothing.
 */
export function LogSentEmailDialog({
  contact,
  stages,
  size = "sm",
  variant = "secondary",
}: {
  /** When set, the email is logged against this contact (no address field). */
  contact?: { id: string; name: string; email: string | null };
  stages: Option[];
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [orgName, setOrgName] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sentAt, setSentAt] = React.useState("");
  const [stageId, setStageId] = React.useState("");
  const [followUpMode, setFollowUpMode] = React.useState<FollowUpMode>("default");
  const [followUpDate, setFollowUpDate] = React.useState("");

  function openDialog() {
    setError(null);
    setSentAt(localInputValue(new Date()));
    setOpen(true);
  }

  function reset() {
    setEmail("");
    setFullName("");
    setOrgName("");
    setSubject("");
    setBody("");
    setStageId("");
    setFollowUpMode("default");
    setFollowUpDate("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const sent = sentAt ? new Date(sentAt) : new Date();
    if (Number.isNaN(sent.getTime())) {
      setError("Pick when you sent it.");
      return;
    }
    let followUp: { kind: FollowUpMode; dueAt?: string } = { kind: followUpMode };
    if (followUpMode === "date") {
      if (!followUpDate) {
        setError("Pick a follow-up date, or choose another reminder option.");
        return;
      }
      followUp = { kind: "date", dueAt: new Date(`${followUpDate}T09:00`).toISOString() };
    }

    setBusy(true);
    try {
      const res = await fetch("/api/messages/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact?.id,
          email: contact ? undefined : email,
          fullName: contact ? undefined : fullName || undefined,
          orgName: contact ? undefined : orgName || undefined,
          subject,
          body: body || undefined,
          sentAt: sent.toISOString(),
          pipelineStageId: stageId || null,
          followUp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not log the email.");
        return;
      }
      setOpen(false);
      reset();
      if (!contact && data.contactId) router.push(`/contacts/${data.contactId}`);
      else router.refresh();
    } catch {
      setError("Could not log the email.");
    } finally {
      setBusy(false);
    }
  }

  const noEmail = contact ? !contact.email : false;

  return (
    <>
      <Button size={size} variant={variant} onClick={openDialog} disabled={noEmail}>
        <MailPlus className="h-4 w-4" aria-hidden /> Log email I sent
      </Button>
      <Dialog
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        title="Log an email you sent"
        description={
          contact
            ? `Sent to ${contact.name}${contact.email ? ` (${contact.email})` : ""} from your own mail app. Nothing is sent from here.`
            : "Sent from your own mail app. We'll track replies, follow-ups and the pipeline for it. Nothing is sent from here."
        }
        className="max-w-xl"
      >
        <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {!contact ? (
            <>
              <label className="block">
                <span className={labelCls}>
                  Sent to (email) <span className="text-red-600">*</span>
                </span>
                <Input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.edu.sg"
                />
                <span className="mt-1 block text-xs text-gray-600">
                  If this address is already a lead, the email is added to them.
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Their name</span>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Optional" />
                </label>
                <label className="block">
                  <span className={labelCls}>Organization</span>
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Optional" />
                </label>
              </div>
            </>
          ) : null}

          <label className="block">
            <span className={labelCls}>
              Subject <span className="text-red-600">*</span>
            </span>
            <Input
              required
              maxLength={300}
              autoFocus={!!contact}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Same subject you used, so replies line up"
            />
          </label>

          <label className="block">
            <span className={labelCls}>What you wrote</span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Optional — paste the email for your records" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Sent at</span>
              <Input
                type="datetime-local"
                value={sentAt}
                max={localInputValue(new Date())}
                onChange={(e) => setSentAt(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Pipeline stage</span>
              <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                <option value="">Contacted (automatic)</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className={labelCls}>Follow-up reminder</legend>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name="followUp"
                checked={followUpMode === "default"}
                onChange={() => setFollowUpMode("default")}
              />
              2 and 3 business days after sending
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name="followUp"
                checked={followUpMode === "date"}
                onChange={() => setFollowUpMode("date")}
              />
              On a date
              {followUpMode === "date" ? (
                <Input
                  type="date"
                  aria-label="Follow-up date"
                  className="h-8 w-44"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="radio"
                name="followUp"
                checked={followUpMode === "none"}
                onChange={() => setFollowUpMode("none")}
              />
              No reminder
            </label>
          </fieldset>

          <p className="text-xs text-gray-600">
            Replies are picked up automatically when they come to the inbox this CRM checks. Log the email soon after
            sending so an early reply isn&apos;t missed.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MailPlus className="h-4 w-4" aria-hidden />}
              Log email
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
