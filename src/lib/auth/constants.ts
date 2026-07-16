/**
 * Los usuarios no usan email. Por convención, un username `miguel` se traduce
 * internamente al email sintético `miguel@gymstats.app` para Supabase Auth
 * (email + password).
 *
 * Nota: se usa el dominio `gymstats.app` (y NO `.local`) porque Supabase Auth
 * rechaza las TLD reservadas como `.local` con `email_address_invalid`.
 */
export const SYNTHETIC_EMAIL_DOMAIN = "gymstats.app";

/** Username permitido: 3-20 caracteres, minúsculas, dígitos y guion bajo. */
export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

/** Convierte un username en su email sintético para Supabase Auth. */
export function usernameToEmail(username: string): string {
  return `${username}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
