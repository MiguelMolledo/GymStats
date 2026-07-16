import { GlowBackground } from "@/components/GlowBackground";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GlowBackground />
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
        <div className="flex-1 pb-28">{children}</div>
      </div>
      <BottomNav />
    </>
  );
}
