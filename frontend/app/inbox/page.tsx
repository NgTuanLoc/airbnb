import type { Metadata } from "next";
import { Footer, TopNav } from "@/components/design-system";
import { ChatOffNotice } from "@/components/features/chat/chat-off-notice";
import { InboxList } from "@/components/features/chat/inbox-list";
import { requireSession } from "@/lib/auth/get-session";
import { chatEnabled } from "@/lib/chat/config";

export const metadata: Metadata = { title: "Messages · Airbnb" };

export default async function InboxPage() {
  await requireSession("/inbox");

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" className="mx-auto flex w-full max-w-editorial flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8">
        <h1 className="text-display-md text-ink">Messages</h1>
        {chatEnabled() ? <InboxList /> : <ChatOffNotice />}
      </main>
      <Footer />
    </div>
  );
}
