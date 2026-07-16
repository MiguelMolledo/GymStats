import { describe, expect, it } from "vitest";

import { slugify, uniqueSlug, validateBilboConfig } from "./logic";

describe("slugify", () => {
  it("normaliza a minúsculas y guiones", () => {
    expect(slugify("Pecho y Tríceps")).toBe("pecho-y-triceps");
  });
  it("quita acentos", () => {
    expect(slugify("Espalda día 1")).toBe("espalda-dia-1");
  });
  it("colapsa separadores y recorta guiones", () => {
    expect(slugify("  --Piernas!!  ")).toBe("piernas");
  });
  it("usa fallback si queda vacío", () => {
    expect(slugify("💪")).toBe("bloque");
    expect(slugify("💪", "x")).toBe("x");
  });
});

describe("uniqueSlug", () => {
  it("devuelve el base si está libre", () => {
    expect(uniqueSlug("Pecho", ["espalda"])).toBe("pecho");
  });
  it("sufija cuando colisiona", () => {
    expect(uniqueSlug("Pecho", ["pecho"])).toBe("pecho-2");
    expect(uniqueSlug("Pecho", ["pecho", "pecho-2"])).toBe("pecho-3");
  });
});

describe("validateBilboConfig", () => {
  it("acepta valores válidos", () => {
    const r = validateBilboConfig("32", "12");
    expect(r).toEqual({ ok: true, value: { target_reps: 32, floor_reps: 12 } });
  });
  it("rechaza target <= 0", () => {
    expect(validateBilboConfig("0", "3").ok).toBe(false);
    expect(validateBilboConfig("-5", "3").ok).toBe(false);
  });
  it("rechaza floor <= 0", () => {
    expect(validateBilboConfig("32", "0").ok).toBe(false);
  });
  it("rechaza floor >= target", () => {
    expect(validateBilboConfig("12", "12").ok).toBe(false);
    expect(validateBilboConfig("12", "20").ok).toBe(false);
  });
  it("rechaza no numéricos", () => {
    expect(validateBilboConfig("abc", "3").ok).toBe(false);
    expect(validateBilboConfig("32", "").ok).toBe(false);
  });
});
