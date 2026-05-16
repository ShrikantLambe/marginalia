import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marginalia",
    short_name: "Marginalia",
    description: "A quiet reading list",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#faf6ee",
    theme_color: "#faf6ee",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    share_target: {
      action: "/quick-save",
      method: "GET",
      params: { url: "url", title: "title", text: "text" },
    },
  };
}
