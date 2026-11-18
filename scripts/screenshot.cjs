// Development helper: starts the built app (`pnpm build` first), optionally runs a script in the page, and saves a
// screenshot of the window.
//   electron scripts/screenshot.cjs --user-data-dir=<dir> --out=<file.png> [--wait=ms]
//     [--click="<button text>"] [--fill="<label text>=<value>"] ...   (run in the given order)
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const arg = (name) => process.argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const out = arg('out')[0] ?? 'screenshot.png';
// Steps in command line order
const steps = process.argv.filter((a) => a.startsWith('--click=') || a.startsWith('--fill='));
const wait = Number(arg('wait')[0] ?? 800);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    await sleep(wait);
    for (const step of steps) {
      const [kind, ...rest] = step.slice(2).split('=');
      const value = rest.join('=');
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
    const el = l && document.getElementById(l.htmlFor);
    if (!el) throw new Error('No field ' + ${JSON.stringify(label)});
    if (el.getAttribute('role') === 'switch') { el.click(); return; }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, ${JSON.stringify(rest.join('='))});
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  })()`;
}

require(path.join(__dirname, '../out/main/index.js'));
