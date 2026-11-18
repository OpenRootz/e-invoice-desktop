# Security policy

## Supported versions

Security fixes are released for the latest version of E-Invoice Desktop. The app does not update itself; please
install new releases from the [releases page](https://github.com/OpenRootz/e-invoice-desktop/releases).

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub:
[Report a vulnerability](https://github.com/OpenRootz/e-invoice-desktop/security/advisories/new)
(Security tab → Advisories → Report a vulnerability).

Include what is affected, how to reproduce it and the impact you see. We aim to answer within a week.
Once a fix is released, the advisory is published and you are credited, unless you prefer otherwise.

## Scope

Of particular interest are issues that let someone

- make the app send data over the network, or load remote content, despite its network lockdown,
- run code or read files through data files, layouts, logos or other images,
- escape the renderer sandbox or call the main process other than through the preload API,
- get the app to write files outside the location the user chose,
- tamper with the release packages or the build pipeline.

Problems in Electron or Chromium themselves belong to the [Electron project](https://github.com/electron/electron/security).
