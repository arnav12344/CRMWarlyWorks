import { redirect } from "next/navigation";

// Placeholder root page. FEAT-002 replaces this with the public landing page.
// For now we redirect to the operational dashboard so the app stays usable.
export default function RootPage() {
  redirect("/dashboard");
}
