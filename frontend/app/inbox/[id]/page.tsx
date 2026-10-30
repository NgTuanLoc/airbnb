import type { Metadata } from "next";
import Link from "next/link";
import { Footer, TopNav } from "@/components/design-system";
import { ChatOffNotice } from "@/components/features/chat/chat-off-notice";
import { ConversationThread } from "@/components/features/chat/conversation-thread";
import { requireSession } from "@/lib/auth/get-session";
import { chatEnabled } from "@/lib/chat/config";

export const metadata: Metadata = { title: "Messages · Airbnb" };

export default async function ConversationPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const user = await requireSession(`/inbox/${id}`);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 px-6 md:px-10 py-8">
        <Link href="/inbox" className="text-title-sm text-ink underline">
          All messages
        </Link>
        {chatEnabled() ? <ConversationThread conversationId={id} me={user.id} /> : <ChatOffNotice />}
      </main>
      <Footer />
    </div>
  );
}
