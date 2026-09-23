"use server";

import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
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

  // Mínimo del proyecto de Supabase (compartido; lo fija su config de Auth).
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  if (inviteCode !== process.env.INVITE_CODE) {
    return { error: "El código de invitación no es válido." };
  }

  // El proyecto de Supabase se comparte con otras apps y tiene el registro
  // público desactivado: el alta va con la service role y marcada con
  // app_metadata.app = "gymstats" (el trigger de perfil de GymStats solo actúa
  // sobre esos usuarios; las otras apps los ignoran).
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    // `app` en los dos: el trigger AFTER INSERT solo ve user_metadata
    // (app_metadata lo escribe Auth en un UPDATE posterior).
    app_metadata: { app: "gymstats" },
    user_metadata: { app: "gymstats", username, display_name: displayName },
  });

  if (error) {
    // El caso más común: username ya en uso (email repetido, o el trigger
    // falla por el unique de profiles.username → "Database error ...").
    const msg = error.message.toLowerCase();
    if (
      error.code === "email_exists" ||
      msg.includes("already") ||
      msg.includes("duplicate") ||
      msg.includes("registered") ||
      msg.includes("database error")
    ) {
      return { error: "Ese usuario ya está en uso." };
    }
    return { error: "No se pudo crear la cuenta. Inténtalo de nuevo." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (signInError) {
    redirect("/login");
  }

  redirect("/");
}

/** Cierra la sesión y vuelve al login. */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
