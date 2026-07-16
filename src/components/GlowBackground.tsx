/**
 * Decoración de fondo fija: glows radiales sutiles índigo/rosa sobre #030303.
 * Puramente estético, no interactivo.
 */
export function GlowBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#030303]"
    >
      <div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-indigo-600/20 blur-[100px]" />
      <div className="absolute top-1/3 -right-24 h-72 w-72 rounded-full bg-pink-500/15 blur-[110px]" />
      <div className="absolute -bottom-32 left-1/4 h-72 w-72 rounded-full bg-indigo-500/10 blur-[120px]" />
    </div>
  );
}
