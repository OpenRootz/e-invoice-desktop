# Contributing

Thanks for your interest in E-Invoice Desktop. The best way to contribute is an
[issue](https://github.com/OpenRootz/e-invoice-desktop/issues): bug reports, questions and feature ideas are all
welcome there.

## Before you start

- **Bugs**: open an [issue](https://github.com/OpenRootz/e-invoice-desktop/issues) with the app version (Settings),
  your Windows version, what you did, what you expected and what happened. For wrong invoice content, the report of
  a validator and the relevant part of the embedded XML help most (remove personal data first).
- **Features**: describe your use case in an issue.
- **Security issues**: never in a public issue; see [SECURITY.md](SECURITY.md).

## Development setup

Requirements: Node ≥ 22, [pnpm](https://pnpm.io) 11, Docker for the validators.

```bash
pnpm install
pnpm dev                    # the app with hot reload
pnpm test                   # unit tests
pnpm typecheck
pnpm lint && pnpm format:check
```

`pnpm dev` uses your normal data folder. To try something with separate data, start the built app with another
folder: `pnpm build && pnpm exec electron . --user-data-dir=<folder>`.

Please use pnpm; do not commit `package-lock.json` or `yarn.lock`.

## Project layout

| Path            | Content                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `src/core/`     | the EN 16931 model, calculation, checks, CII/UBL XML and PDF rendering; **no imports from Electron** |
| `src/shared/`   | schemas of the stored data, the invoice request, numbering and checks used by both main and renderer |
| `src/main/`     | the Electron main process: JSON storage, invoice and layout services, IPC handlers, network lockdown |
| `src/preload/`  | the typed API the renderer may call                                                                  |
| `src/renderer/` | the React user interface, translations in `src/renderer/src/i18n/`                                   |
| `test/`         | unit tests, scenarios, golden files and the validator scripts                                        |
| `scripts/`      | development helpers (screenshots of the built app)                                                   |

The core is shared with the [Vendure E-Invoice Plugin](https://github.com/OpenRootz/vendure-plugin-e-invoice).
Fixes in `src/core/` usually apply there as well; please mention it in the pull request.

## Rules the code follows

- Money is stored and calculated in integer minor units; rates and quantities are decimal strings. No floats.
- The app never uses the network. Do not add dependencies that fetch anything at runtime (fonts, update checks,
  telemetry, CDNs); assets are bundled.
- The renderer is sandboxed and only talks to the main process through the preload API. The main process validates
  everything it receives with the schemas in `src/shared/`.
- Stored data is versioned (`schemaVersion` in every JSON file). A change to a stored schema needs a migration, and
  data from users' existing files must keep loading.
- Every UI text exists in German and English (`de.ts` and `en.ts` have the same keys).
- Output changes must keep the e-invoices valid. If you change the XML or the PDF on purpose, regenerate the golden
  files with `UPDATE_GOLDEN=1 pnpm test`, review the diff and run `pnpm validate test/golden`,
  `pnpm validate test/__output__/pdf` and `pnpm validate test/__output__/app` (CI runs the same validators).

## Pull requests

Please open an issue before a pull request, so we can agree on the approach first. Small fixes such as typos are
fine without one.

- Keep a pull request focused on one change and add tests for it.
- Make sure `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm format:check` pass.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `chore:`, … with an optional scope such as `fix(ui):`).
- Add a line to `CHANGELOG.md` for user-facing changes.

## Releasing

For maintainers. A release is one commit and one tag:

1. Merge everything that belongs to the release first; `main` must be green.
2. Open a pull request titled `chore: release X.Y.Z` that only sets `version` in `package.json` and the heading of
   the release in `CHANGELOG.md` (`## X.Y.Z (YYYY-MM-DD)`). Squash and merge it as the last pull request.
3. Tag exactly that commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The `Release` workflow checks that the tag matches the version, runs typecheck and tests, builds the installer and the portable exe on a
   Windows runner and publishes them with `SHA256SUMS.txt` as a GitHub release.
5. Replace the generated release notes with the CHANGELOG section.

To test the packages before a release, start the `Release` workflow by hand (Actions → Release → Run workflow). It
only builds and keeps the files as a workflow artifact.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
