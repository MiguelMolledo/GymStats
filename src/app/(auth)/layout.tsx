import { GlowBackground } from "@/components/GlowBackground";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GlowBackground />
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-6 py-10">
        {children}
      </main>
    </>
  );
}
