import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, type Plugin } from "vite";

function vitePluginPreloadCriticalFonts(): Plugin {
  return {
    name: "preload-critical-fonts",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const base = process.env.GITHUB_PAGES === "true" ? "/bonai/" : "/";
        const allWoff = Object.values(bundle).filter((item) => "fileName" in item && typeof item.fileName === "string" && /\.woff2$/.test(item.fileName)) as Array<{ fileName: string }>;
        const pick = (re: RegExp) => allWoff.find((item) => re.test(item.fileName));
        const fonts = [
          pick(/ibm-plex-sans-latin(?!-ext)/i),
        ].filter(Boolean) as Array<{ fileName: string }>;
        const tags = fonts.slice(0, 4).map((asset) => ({
          tag: "link" as const,
          attrs: {
            rel: "preload",
            href: `${base}${asset.fileName}`,
            as: "font",
            type: "font/woff2",
            crossorigin: "anonymous",
          },
          injectTo: "head" as const,
        }));
        return tags.length ? { html, tags } : html;
      },
    },
  };
}

/**
 * Un identificator pentru fiecare build, pus și în `build.json` lângă pagină. Aplicația deschisă îl
 * compară cu cel publicat și, dacă diferă, arată „Versiune nouă” — altfel, după o publicare, telefonul
 * rămânea pe codul vechi până la o reîncărcare dublă.
 */
const BUILD_ID = (process.env.GITHUB_SHA || "").slice(0, 12) || Date.now().toString(36);

function vitePluginBuildId(): Plugin {
  return {
    name: "build-id",
    apply: "build",
    // După pluginul CSS al lui Vite, care scoate bucățile JS goale (doar CSS): lista trebuie să le vadă scoase.
    enforce: "post",
    generateBundle(_options, bundle) {
      this.emitFile({ type: "asset", fileName: "build.json", source: JSON.stringify({ id: BUILD_ID }) });
      /*
       * P2-11: lista pe care service worker-ul o pune în cache la instalare, ca ecranele leneșe
       * (Plicuri, Mișcări, Notează) să meargă offline și fără să fi fost deschise. Fără bucățile
       * mari care cer oricum rețea sau sunt rare: Firebase, PDF.
       */
      const heavy = /(family-sync|jspdf|html2canvas|pdf)/i;
      const files = Object.values(bundle)
        .filter((item) => /^assets\/.+\.(js|css)$/.test(item.fileName) && !heavy.test(item.fileName))
        .filter((item) => (item.type === "chunk" ? item.code.length : String(item.source).length) < 400_000)
        .map((item) => `./${item.fileName}`);
      this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify({ id: BUILD_ID, files }) });
    },
    /*
     * S1: amprenta SHA-256 a fiecărui fișier JS/CSS, luată din fișierele scrise pe disc (după
     * toate transformările). Pe originea comună (balty1991.github.io) altă pagină poate scrie în
     * Cache Storage; service worker-ul servește din cache doar ce are exact amprenta de aici.
     */
    writeBundle(options, bundle) {
      const dir = options.dir || "dist";
      const target = path.join(dir, "precache.json");
      const manifest = JSON.parse(readFileSync(target, "utf8")) as { id: string; files: string[]; hashes?: Record<string, string> };
      const hashes: Record<string, string> = {};
      for (const name of Object.keys(bundle)) {
        if (!/^assets\/.+\.(js|css)$/.test(name)) continue;
        hashes[`/${name}`] = createHash("sha256").update(readFileSync(path.join(dir, name))).digest("base64");
      }
      writeFileSync(target, JSON.stringify({ ...manifest, hashes }));
    },
  };
}


/**
 * Politica de securitate a conținutului, doar la build-ul pentru GitHub Pages (serverul de dezvoltare are nevoie de scripturi
 * inline pentru reîncărcare). GitHub Pages nu poate trimite antete, așa că vine ca <meta>.
 * Scripturile inline din index.html intră prin hash; orice alt script inline e refuzat.
 * Surse externe: Firebase (Auth, Firestore, App Check, funcții), reCAPTCHA pentru App Check,
 * jsDelivr pentru cititorul de bonuri (worker, WASM și datele de limbă) și Open Food Facts.
 */
function vitePluginCsp(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        // Doar pentru web: în Android, Capacitor injectează la rulare un script inline (puntea nativă)
        // care ar fi blocat. Acolo pagina vine oricum din pachetul aplicației, nu de pe internet.
        if (process.env.GITHUB_PAGES !== "true") return html;
        const hashes = Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))
          .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
        const policy = [
          "default-src 'self'",
          `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(" ")} https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`,
          "style-src 'self' 'unsafe-inline'",
          // Din afară vin doar imaginile reCAPTCHA și pozele de produs Open Facts (după codul de bare).
          "img-src 'self' data: blob: https://www.gstatic.com https://www.google.com https://images.openfoodfacts.org https://images.openproductsfacts.org https://images.openpetfoodfacts.org https://images.openbeautyfacts.org https://static.openfoodfacts.org",
          "font-src 'self' data:",
          // Doar serviciile folosite: Firestore, Auth, App Check, funcțiile din europe-central2, reCAPTCHA, Open Food Facts și rapoartele de erori (Sentry, UE).
          `connect-src 'self' data: blob: https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseappcheck.googleapis.com https://content-firebaseappcheck.googleapis.com https://europe-central2-buget-familie-a6a0d.cloudfunctions.net https://www.google.com https://search.openfoodfacts.org https://world.openfoodfacts.org https://world.openproductsfacts.org https://*.ingest.de.sentry.io`,
          "frame-src https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com",
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join("; ");
        return { html, tags: [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }] };
      },
    },
  };
}

export default defineConfig(({ command }) => {
  const plugins = [react(), tailwindcss(), vitePluginPreloadCriticalFonts(), vitePluginBuildId(), vitePluginCsp()];
  /**
   * Erorile din Sentry, citibile: hărțile de cod urcă la Sentry din CI (cu SENTRY_AUTH_TOKEN) și se
   * șterg din pachet, ca să nu ajungă nici în APK, nici pe pagina publică. Fără token, nimic nu se schimbă.
   */
  const sentryUpload = command === "build" && Boolean(process.env.SENTRY_AUTH_TOKEN);
  if (sentryUpload) {
    plugins.push(...sentryVitePlugin({
      org: "buget-familie",
      project: "buget-familie",
      url: "https://de.sentry.io/",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: { name: `buget-familie@${JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8")).version}` },
      sourcemaps: { filesToDeleteAfterUpload: ["**/*.map"] },
      telemetry: false,
    }));
  }

  return {
    // GitHub Pages servește acest proiect sub /bonai/; buildurile locale și Android rămân la rădăcină.
    base: process.env.GITHUB_PAGES === "true" ? "/bonai/" : "/",
    plugins,
    // Worker-ul de sync (P2-9) împarte module cu aplicația: format ES, cu bucăți comune.
    worker: { format: "es" },
    define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(command === "build" ? BUILD_ID : "dev") },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      target: ["es2022", "chrome111", "safari16"],
      cssMinify: "lightningcss",
      sourcemap: sentryUpload ? "hidden" : false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/") || id.includes("node_modules/scheduler") || id.includes("node_modules/wouter")) return "react-runtime";
            if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) return "family-sync";
            // Nu grupa lucide-react: un chunk comun forța toate iconițele Plan/Analiză pe first paint.
            // Nu grupa jspdf/html2canvas: helperul de preload ajunge în chunk-ul mare și se încarcă la prima deschidere.
          },
        },
      },
    },
    server: {
      port: 3000,
      strictPort: false, // Will find next available port if 3000 is busy
      // Doar pe acest calculator; fără listă de gazde deschisă (o pagină web ar putea citi sursele prin DNS rebinding).
      host: "127.0.0.1",
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
