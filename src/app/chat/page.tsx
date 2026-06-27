import Link from "next/link";
import { Chat } from "@/components/Chat";

export default function ChatPage() {
  return (
    <main className="flex-1 px-4 py-8">
      <div className="max-w-2xl mx-auto mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Asistente AviHelp</h1>
        <Link href="/" className="text-sm text-primary underline">← Inicio</Link>
      </div>
      <Chat />
    </main>
  );
}
