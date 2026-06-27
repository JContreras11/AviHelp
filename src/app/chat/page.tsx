import { Chat } from "@/components/Chat";
import { Logo } from "@/components/Brand";

export default function ChatPage() {
  return (
    <main className="flex-1 px-4 py-8 bg-gradient-to-b from-accent/20 via-background to-background">
      <div className="max-w-2xl mx-auto mb-6 flex items-center gap-3">
        <Logo size={44} />
        <div>
          <h1 className="text-xl font-bold leading-tight">Avi</h1>
          <p className="text-xs text-muted-foreground">Tu asistente en la emergencia</p>
        </div>
      </div>
      <Chat />
    </main>
  );
}
