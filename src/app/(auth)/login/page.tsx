"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Dumbbell } from "lucide-react";
import { login, type AuthState } from "../actions";

const initialState: AuthState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="w-full">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-400/30">
          <Dumbbell className="h-7 w-7 text-indigo-300" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          GymStats
        </h1>
        <p className="mt-1 text-sm text-white/50">Entra en tu cuenta</p>
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
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-indigo-400/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-indigo-500/20"
            placeholder="miguel"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-white/70">Contraseña</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-indigo-400/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-indigo-500/20"
            placeholder="••••••••"
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
          className="mt-2 rounded-xl bg-indigo-500 px-4 py-3 font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        ¿No tienes cuenta?{" "}
        <Link
          href="/registro"
          className="font-medium text-indigo-300 hover:text-indigo-200"
        >
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
