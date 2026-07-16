"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { USERNAME_REGEX, usernameToEmail } from "@/lib/auth/constants";

export type AuthState = {
  error?: string;
};

/**
 * Login con username + contraseña. Traduce el username a su email sintético.
 */
export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Introduce usuario y contraseña." };
  }
  if (!USERNAME_REGEX.test(username)) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  redirect("/");
}

/**
 * Registro con username, nombre para mostrar, contraseña y código de invitación.
 * El código de invitación se valida aquí (server-side) contra INVITE_CODE.
 */
export async function registro(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const inviteCode = String(formData.get("invite_code") ?? "").trim();

  if (!username || !displayName || !password || !inviteCode) {
    return { error: "Rellena todos los campos." };
  }

  if (!USERNAME_REGEX.test(username)) {
    return {
      error:
        "El usuario debe tener entre 3 y 20 caracteres: minúsculas, números o guion bajo.",
    };
  }

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  if (inviteCode !== process.env.INVITE_CODE) {
    return { error: "El código de invitación no es válido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: {
      data: {
        username,
        display_name: displayName,
      },
    },
  });

  if (error) {
    // El caso más común: username ya en uso (el trigger falla por unique).
    if (
      error.message.toLowerCase().includes("already") ||
      error.message.toLowerCase().includes("duplicate") ||
      error.message.toLowerCase().includes("registered")
    ) {
      return { error: "Ese usuario ya está en uso." };
    }
    return { error: "No se pudo crear la cuenta. Inténtalo de nuevo." };
  }

  redirect("/");
}

/** Cierra la sesión y vuelve al login. */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
