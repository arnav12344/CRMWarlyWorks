import { PageHeader } from "@/components/ui/PageHeader";
import {
  SETTING_KEYS,
  loadProviderKeys,
  getPlainSetting,
  maskKey,
} from "@/lib/verify/settings";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

const DEFAULT_TIMEZONE = "Asia/Singapore";

/**
 * Settings: encrypted provider API keys + general config.
 *
 * Server component only ever passes masked (last-4) previews to the client —
 * plaintext keys never leave the server.
 */
export default async function SettingsPage() {
  const keys = await loadProviderKeys();
  const timezone = await getPlainSetting(SETTING_KEYS.timezone, DEFAULT_TIMEZONE);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Encrypted provider API keys and general configuration."
      />
      <SettingsForm
        initial={{
          millionverifier: {
            configured: Boolean(keys.millionverifier),
            masked: maskKey(keys.millionverifier),
          },
          zerobounce: {
            configured: Boolean(keys.zerobounce),
            masked: maskKey(keys.zerobounce),
          },
          timezone,
        }}
      />
    </>
  );
}
