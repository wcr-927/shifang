// Build the macOS icon from the approved original artwork.
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const directory = join(__dirname, '../assets/brand');
const temporary = mkdtempSync(join(tmpdir(), 'caizhang-icon-'));
try {
  const iconset = join(temporary, 'shifang.iconset');
  mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = String(size * scale);
      const name = 'icon_' + size + 'x' + size + (scale === 2 ? '@2x' : '') + '.png';
      execFileSync('/usr/bin/sips', ['-z', pixels, pixels, join(directory, 'shifang.png'), '--out', join(iconset, name)]);
    }
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(directory, 'shifang.icns')]);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
