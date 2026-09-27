import { redirect } from "next/navigation";

/** Compose moved to Step 3: Write & send. */
export default function ComposeRedirect() {
  redirect("/send");
}
