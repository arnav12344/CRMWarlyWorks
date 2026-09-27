import {
  UserPlus,
  ShieldCheck,
  Send,
  MessagesSquare,
  Users,
  ListOrdered,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * The four main steps of the outreach flow. Each has its own colour so you
 * always know where you are:
 *   1 Add leads = sky · 2 Verify = amber · 3 Write & send = marigold · 4 Replies = emerald
 * Class strings are written out in full so Tailwind can see them.
 */
export interface StepDef {
  n: number;
  href: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  /** Solid number bubble. */
  solid: string;
  /** Soft icon tile. */
  soft: string;
  /** Top stripe on the home card. */
  stripe: string;
}

export const STEPS: StepDef[] = [
  {
    n: 1,
    href: "/leads",
    label: "Add leads",
    blurb: "Import a CSV/XLSX or browse your lead list.",
    icon: UserPlus,
    solid: "bg-sky-600 text-white",
    soft: "bg-sky-100 text-sky-800",
    stripe: "bg-sky-500",
  },
  {
    n: 2,
    href: "/verification",
    label: "Verify emails",
    blurb: "Check addresses before you send, so nothing bounces.",
    icon: ShieldCheck,
    solid: "bg-amber-700 text-white",
    soft: "bg-amber-100 text-amber-900",
    stripe: "bg-amber-600",
  },
  {
    n: 3,
    href: "/send",
    label: "Write & send",
    blurb: "Pick leads and a template, preview, then send.",
    icon: Send,
    solid: "bg-accent-400 text-brand-950",
    soft: "bg-accent-100 text-brand-950",
    stripe: "bg-accent-400",
  },
  {
    n: 4,
    href: "/replies",
    label: "Replies & pipeline",
    blurb: "See who wrote back and move deals forward.",
    icon: MessagesSquare,
    solid: "bg-emerald-600 text-white",
    soft: "bg-emerald-100 text-emerald-800",
    stripe: "bg-emerald-500",
  },
];

export const MORE_LINKS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/contacts", label: "All contacts", icon: Users },
  { href: "/sequences", label: "Sequences & templates", icon: ListOrdered },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Which step (if any) a pathname belongs to. */
export function stepForPath(pathname: string): StepDef | null {
  if (pathname.startsWith("/import")) return STEPS[0];
  if (pathname.startsWith("/compose")) return STEPS[2];
  return STEPS.find((s) => pathname.startsWith(s.href)) ?? null;
}
