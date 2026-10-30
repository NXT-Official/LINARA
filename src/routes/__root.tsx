import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { readLocale } from "@/lib/i18n/locale-cookie";
import { LocaleProvider } from "@/lib/i18n/locale-context";

import appCss from "../styles.css?url";
import { useT } from "@/lib/i18n/locale-context";

function NotFoundComponent() {
  const t = useT();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className={t("pages.text7xlFontBoldText")}>{t("pages.404")}</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("pages.pageNotFound")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("pages.thePageYouReLooking")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("pages.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const t = useT();
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("pages.thisPageDidnTLoad")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("pages.somethingWentWrongOnOur")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("pages.tryAgain")}
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("pages.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// Baked in by vite.config.ts; empty in local dev, where a relative URL is fine.
const SITE_URL = process.env.SITE_URL ?? "";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Linara · Home, made clear." },
      {
        name: "description",
        content:
          "Linara helps families and household helpers coordinate the day with calm, shared clarity.",
      },
      { property: "og:title", content: "Linara · Home, made clear." },
      {
        property: "og:description",
        content: "A calm, shared home management app for families and helpers.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      ...(SITE_URL ? [{ property: "og:url", content: SITE_URL }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#1F5A54" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Literata:opsz,wght@7..72,400;7..72,500;7..72,600;7..72,700&family=Nunito+Sans:wght@300;400;500;600;700;800&display=swap",
      },
    ],
  }),
  // The language cookie, read on the server too, so the first paint is in
  // the manager's language (lib/i18n/locale-cookie.ts).
  beforeLoad: () => ({ locale: readLocale() }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const locale = Route.useRouteContext({ select: (c) => c.locale });
  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, locale } = Route.useRouteContext();

  return (
    <LocaleProvider initial={locale}>
      <QueryClientProvider client={queryClient}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        {/* Every toast.* call in the app renders here -- none showed before this
          was mounted. Top-centre so it never collides with the bottom nav;
          sonner's own layer sits above modals. */}
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </LocaleProvider>
  );
}
