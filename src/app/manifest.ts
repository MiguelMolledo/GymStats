import type { MetadataRoute } from "next";

/** Manifest de la PWA. Next lo sirve en /manifest.webmanifest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GymStats",
    short_name: "GymStats",
    description: "Registro de entrenamientos y progreso en el gimnasio.",
    lang: "es",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#030303",
    theme_color: "#030303",
    categories: ["health", "fitness", "sports"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
