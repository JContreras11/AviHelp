import Image from "next/image";
import Link from "next/link";

export function Logo({ size = 40 }: { size?: number }) {
  return <Image src="/icon.svg" alt="Avi" width={size} height={size} priority unoptimized className="drop-shadow-sm" />;
}

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo size={32} />
          <span className="text-lg">AviHelp</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="px-3 py-1.5 rounded-lg hover:bg-muted">Inicio</Link>
          <Link href="/dashboard" className="px-3 py-1.5 rounded-lg hover:bg-muted">Panel</Link>
          <Link href="/chat" className="px-3 py-1.5 rounded-lg hover:bg-muted">Avi 💬</Link>
        </nav>
      </div>
    </header>
  );
}
