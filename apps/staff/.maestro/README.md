# Maestro E2E — Saral staff app

End-to-end flows for the native staff app, driven by [Maestro](https://maestro.mobile.dev).

## Prerequisites
- An **installed build** of the app on a simulator or device (Maestro drives an
  installed binary, not Metro). Easiest: an EAS dev build, or `npx expo run:ios`.
- The build must have the **dev login** enabled (`EXPO_PUBLIC_DEV_AUTH=1`) and a
  dev user that already has a name + clinic (e.g. `dev@saral.test` / `test1234`,
  linked to `drmehta`). OTP login can't be automated without a real SMS provider.
- Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`

## App id
Flows use `appId: com.saral.staff`. Set your build's actual bundle id there (or
run with an override): `maestro test --app-id <your.bundle.id> apps/staff/.maestro`.

## Run
```
maestro test apps/staff/.maestro            # all flows
maestro test apps/staff/.maestro/01-login.yaml
```

## Flows
- `01-login.yaml` — dev email+password sign-in → lands on Home.
- `02-walkin.yaml` — add a normal walk-in from the dashboard.
- `03-emergency.yaml` — add an emergency → confirm it lands at the top.
- `04-signout.yaml` — sign out → back to the welcome screen.

> Selectors are by visible text, so they track the UI copy. If copy changes,
> update the matching `tapOn`/`assertVisible` strings.
