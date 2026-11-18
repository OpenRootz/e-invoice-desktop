// Development helper: starts the built app (`pnpm build` first), optionally runs a script in the page, and saves a
// screenshot of the window.
//   electron scripts/screenshot.cjs --user-data-dir=<dir> --out=<file.png> [--wait=ms]
//     [--click="<button text>"] [--fill="<label text>=<value>"] [--pause=<ms>] ...   (run in the given order)
//     [--save-to=<file.pdf>]   answers the save dialog with this file
const fs = require('node:fs');
const path = require('node:path');
const { app, dialog } = require('electron');

const arg = (name) => process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const out = arg('out')[0] ?? 'screenshot.png';
// Steps in command line order
const steps = process.argv.filter((a) => a.startsWith('--click=') || a.startsWith('--fill=') || a.startsWith('--pause='));
const wait = Number(arg('wait')[0] ?? 800);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveTo = arg('save-to')[0];
if (saveTo) dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.resolve(saveTo) });

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    await sleep(wait);
    for (const step of steps) {
      const [kind, ...rest] = step.slice(2).split('=');
      const value = rest.join('=');
      if (kind === 'pause') {
        await sleep(Number(value));
        continue;
      }
      await win.webContents.executeJavaScript(kind === 'click' ? clickScript(value) : fillScript(value), true);
      await sleep(kind === 'click' ? wait : 50);
    }
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.resolve(out), image.toPNG());
    app.quit();
  });
});

function clickScript(text) {
  return `(() => {
    const el = [...document.querySelectorAll('button, [role=tab], [role=switch], a')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (!el) throw new Error('No button ' + ${JSON.stringify(text)});
    el.click();
  })()`;
}

/** Sets the value of the control labelled `label` the way React notices it. */
function fillScript(spec) {
  const [label, ...rest] = spec.split('=');
  return `(() => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
    const el = (l && document.getElementById(l.htmlFor)) || [...document.querySelectorAll('[aria-label]')].filter((x) => x.getAttribute('aria-label') === ${JSON.stringify(label)}).pop();
    if (!el) throw new Error('No field ' + ${JSON.stringify(label)});
    if (el.getAttribute('role') === 'switch') { el.click(); return; }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    let value = ${JSON.stringify(rest.join('='))};
    if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === value)) {
      const option = [...el.options].find((o) => o.textContent.trim().startsWith(value));
      if (!option) throw new Error('No option ' + value);
      value = option.value;
    }
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  })()`;
}

require(path.join(__dirname, '../out/main/index.js'));
