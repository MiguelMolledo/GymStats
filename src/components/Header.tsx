import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";

type HeaderProps = {
  title: string;
  subtitle?: string;
};

/** Header sticky con blur: título + subtítulo y botón de logout. */
export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#030303]/70 backdrop-blur-xl">
      <div className="flex items-center justify-between px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-sm text-white/45">{subtitle}</p>
          )}
        </div>
        <form action={logout}>
          <button
            type="submit"
            aria-label="Cerrar sesión"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
