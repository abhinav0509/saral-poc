# Saral — monorepo

Calm clinic-ops for small Indian clinics. _Care, made simple._

This is a **pnpm + Turborepo** workspace. The product is moving from a web PWA to
native staff apps + a hardened multi-tenant Supabase backend, while patients stay
on the zero-install mobile web.

## Layout

```
apps/
  patient-web/     Next.js 16 app — patient mobile-web (/v/[token], /walkin/[code])
                   and (for now) the staff web screens.
  staff/           Expo (React Native) staff app — added in a later phase.
packages/
  core/            Platform-agnostic data layer + business logic:
                   db queries/types, Supabase client factory, scheduling (slots,
                   ETA) and storage helpers. Shared by web, the RN app, and Edge
                   Functions. Unit-tested with Vitest.
  tokens/          Design tokens — single source of truth (tokens.data.mjs).
                   Generates theme.css for Tailwind; a drift test keeps them in sync.
supabase/          Schema, migrations, and (later) Edge Functions.
```

## Commands

```bash
pnpm install        # install the whole workspace (uses corepack-pinned pnpm)
pnpm dev            # run app dev servers
pnpm build          # build all apps/packages (Turbo)
pnpm typecheck      # tsc across every package
pnpm test           # Vitest across packages
pnpm lint           # eslint (currently surfaces pre-existing web debt)
```

Per-package: `pnpm --filter @saral/core test`, `pnpm --filter @saral/tokens build`, etc.

## Conventions

- **Tokens are generated.** Edit `packages/tokens/tokens.data.mjs`, then
  `pnpm --filter @saral/tokens build`. Never hand-edit token values in CSS.
- **Data access goes through `@saral/core`.** Apps register a Supabase client at
  startup (`configureSaral` / `setSaralClient`); core never reads env or touches
  the DOM, so it is safe in React Native.
- Node 20+. Package manager is pinned via `packageManager` in the root
  `package.json` (corepack).
