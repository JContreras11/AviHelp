"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/Nav";

export function Logo({ size = 40 }: { size?: number }) {
  return <Image src="/icon-192.png" alt="Avi" width={size} height={size} priority unoptimized className="drop-shadow-sm" />;
}

export function Header() {
  const path = usePathname();
  if (path === "/login" || path.startsWith("/print")) return null;
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold shrink-0">
          <Logo size={32} />
          <span className="text-lg">AviHelp</span>
        </Link>
        <Nav />
      </div>
    </header>
  );
}
