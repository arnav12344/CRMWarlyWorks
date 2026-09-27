/**
 * Netlify scheduled function: every 10 minutes, ask the app to
 *   1) draft due sequence follow-ups into "Ready to send"
 *   2) check the Gmail inbox for replies, bounces and opt-outs.
 *
 * Runs only on the published (production) deploy. Trigger manually from the
 * Netlify UI: Functions -> tick -> "Run now".
 */
export default async () => {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("tick: URL or CRON_SECRET is not set");
    return;
  }
  const res = await fetch(`${base}/api/cron/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  console.log(`tick: ${res.status} ${(await res.text()).slice(0, 500)}`);
};

export const config = {
  schedule: "*/10 * * * *",
};
