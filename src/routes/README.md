# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/` or `app/layout.tsx` — those are
Next.js / Remix conventions. The only root layout is `src/routes/__root.tsx`.

Route files stay small: a `head()` title, an `errorComponent`, `validateSearch`
when the page has shareable state, and one page component imported from
`src/features/<feature>/pages/`. Page composition does not live here.

`_app.tsx` is the pathless layout every page renders inside — it mounts the
feature stores and the app shell, so navigating never remounts app state.
`_app/manager.tsx` and `_app/helper.tsx` add each persona's nav and chrome.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | pathless layout (renders children via `<Outlet />`)     |
| `_app/manager.tsx`       | `/manager` layout — its children nest under it          |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.
