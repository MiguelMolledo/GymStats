"use client";

import Link from "next/link";
import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { registro, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function RegistroPage() {
  const [state, formAction, pending] = useActionState(registro, initialState);

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-pink-500/15 ring-1 ring-pink-400/30">
          <UserPlus className="h-7 w-7 text-pink-300" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Crear cuenta
        </h1>
        <p className="mt-1 text-sm text-white/50">Necesitas un código de invitación</p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/70">Usuario</span>
          <input
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-pink-400/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-pink-500/20"
            placeholder="miguel"
          />
          <span className="text-xs text-white/35">
            3-20 caracteres: minúsculas, números o guion bajo.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/70">Nombre para mostrar</span>
          <input
            name="display_name"
            type="text"
            autoComplete="name"
            required
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-pink-400/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-pink-500/20"
            placeholder="Miguel"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/70">Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-pink-400/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-pink-500/20"
            placeholder="••••••••"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/70">Código de invitación</span>
          <input
            name="invite_code"
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-white placeholder-white/30 outline-none transition focus:border-pink-400/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-pink-500/20"
            placeholder="········"
          />
        </label>

        {state.error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-xl bg-pink-500 px-4 py-3 font-medium text-white transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-pink-300 hover:text-pink-200"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
