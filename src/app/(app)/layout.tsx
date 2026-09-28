import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { prisma } from "@/lib/db";
import { countSentToday } from "@/lib/outreach";
import { countUnreadReplies } from "@/lib/replies";
import { getDailySendLimit } from "@/lib/verify/settings";
import { readMailConfig } from "@/lib/mail/config";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [sentToday, dailyLimit, unreadReplies] = await Promise.all([
    countSentToday(prisma).catch(() => 0),
    getDailySendLimit().catch(() => 50),
    countUnreadReplies(prisma).catch(() => 0),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar unreadReplies={unreadReplies} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar sentToday={sentToday} dailyLimit={dailyLimit} mailConfigured={readMailConfig() !== null} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
