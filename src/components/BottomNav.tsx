"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Dumbbell,
  History,
  LayoutList,
  Repeat,
  type LucideIcon,
} from "lucide-react";

/** Iconos disponibles para las ExtraViews de plugins (por nombre serializable). */
const EXTRA_ICONS: Record<string, LucideIcon> = {
  Repeat,
  LayoutList,
  History,
};

/** ExtraView serializable que el layout inyecta desde el plugin activo. */
export type NavExtraView = {
  slug: string;
  label: string;
  icon: string;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/**
 * Barra de navegación flotante, redondeada y con blur, fija abajo. Los items
 * base son fijos; entre Entrenar e Historial se insertan las ExtraViews del
 * plugin activo (→ /v/{slug}).
 */
export function BottomNav({ extraViews = [] }: { extraViews?: NavExtraView[] }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/", label: "Inicio", icon: Home },
    { href: "/entrenar", label: "Entrenar", icon: Dumbbell },
    ...extraViews.map((v) => ({
      href: `/v/${v.slug}`,
      label: v.label,
      icon: EXTRA_ICONS[v.icon] ?? Repeat,
    })),
    { href: "/historial", label: "Historial", icon: History },
    { href: "/plantillas", label: "Plantillas", icon: LayoutList },
  ];

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center justify-around gap-1 rounded-2xl border border-white/10 bg-[#0a0a0a]/80 p-1.5 shadow-lg shadow-black/40 backdrop-blur-xl">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:text-white/70"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
