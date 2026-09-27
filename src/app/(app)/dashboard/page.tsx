import { redirect } from "next/navigation";

/** The daily dashboard is now the Home page at `/`. */
export default function DashboardRedirect() {
  redirect("/");
}
