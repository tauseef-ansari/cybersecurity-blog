
// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import netlify from "@astrojs/netlify";

export default defineConfig({
  site: "https://pentestblueprint.netlify.app",

  integrations: [
    mdx(),
    sitemap(),
  ],

  output: "static",

  adapter: netlify(),
});
