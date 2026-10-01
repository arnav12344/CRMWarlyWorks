import { PageHeader } from "@/components/ui/PageHeader";
import {
  SETTING_KEYS,
  loadProviderKeys,
  getPlainSetting,
  getDailySendLimit,
  maskKey,
} from "@/lib/verify/settings";
import { readMailConfig } from "@/lib/mail/config";
import { getSignature } from "@/lib/mail/signatureStore";
import { SettingsForm } from "./SettingsForm";
import { SignatureCard } from "./SignatureCard";

export const dynamic = "force-dynamic";

const DEFAULT_TIMEZONE = "Asia/Singapore";

/**
 * Settings: email account status (from env), email signature, verifier keys
 * (encrypted, masked), daily send limit and timezone. Plaintext secrets never
 * reach the browser.
 */
export default async function SettingsPage() {
  const [keys, timezone, dailySendLimit, signature] = await Promise.all([
    loadProviderKeys(),
    getPlainSetting(SETTING_KEYS.timezone, DEFAULT_TIMEZONE),
    getDailySendLimit(),
    getSignature(),
  ]);
  const mail = readMailConfig();

  return (
    <>
      <PageHeader title="Settings" description="Email account, signature, verification keys and sending limits." />
      <SettingsForm
        afterMail={<SignatureCard initial={signature} mailConfigured={mail !== null} />}
        initial={{
          mail: mail
            ? { configured: true, user: mail.user, fromAddress: mail.fromAddress, fromName: mail.fromName }
            : { configured: false, user: null, fromAddress: null, fromName: null },
          millionverifier: { configured: Boolean(keys.millionverifier), masked: maskKey(keys.millionverifier) },
          zerobounce: { configured: Boolean(keys.zerobounce), masked: maskKey(keys.zerobounce) },
          timezone,
          dailySendLimit,
        }}
      />
    </>
  );
}
