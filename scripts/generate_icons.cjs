// Original SVG → Chromium raster → macOS ICNS. No fonts or network assets.
// Run npm run icons on macOS. Writes only assets/brand; temporary userData is isolated.
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync, mkdirSync, mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'shifang-icon-')));
app.whenReady().then(async () => {
  const directory = join(__dirname, '../assets/brand');
  const svg = readFileSync(join(directory, 'shifang.svg'), 'utf8');
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await window.loadURL('data:text/html,<html></html>');
  const render = async size => {
    const data = await window.webContents.executeJavaScript(`(async()=>{const img=new Image();img.src=${JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'))};await img.decode();const c=document.createElement('canvas');c.width=c.height=${size};c.getContext('2d').drawImage(img,0,0,${size},${size});return c.toDataURL('image/png').split(',')[1]})()`);
    return Buffer.from(data, 'base64');
  };
  writeFileSync(join(directory, 'shifang.png'), await render(1024));
  const iconset = join(app.getPath('userData'), 'shifang.iconset');
  mkdirSync(iconset);
  for (const size of [16,32,128,256,512]) for (const scale of [1,2])
    writeFileSync(join(iconset, `icon_${size}x${size}${scale===2?'@2x':''}.png`), await render(size*scale));
  execFileSync('/usr/bin/iconutil', ['-c','icns',iconset,'-o',join(directory,'shifang.icns')]);
  window.destroy(); app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
