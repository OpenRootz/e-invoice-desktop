// Development helper: starts the built app (`pnpm build` first), optionally runs a script in the page, and saves a
// screenshot of the window.
//   electron scripts/screenshot.cjs --user-data-dir=<dir> --out=<file.png> [--click="<button text>"]... [--wait=ms]
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const arg = (name) => process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const out = arg('out')[0] ?? 'screenshot.png';
const clicks = arg('click');
const wait = Number(arg('wait')[0] ?? 800);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    await sleep(wait);
    for (const text of clicks) {
      await win.webContents.executeJavaScript(
        `(() => { const el = [...document.querySelectorAll('button, [role=tab], a')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!el) throw new Error('No button ' + ${JSON.stringify(text)}); el.click(); })()`,
      );
      await sleep(wait);
    }
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.resolve(out), image.toPNG());
    app.quit();
  });
});

require(path.join(__dirname, '../out/main/index.js'));
