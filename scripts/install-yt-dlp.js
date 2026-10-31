// npm runs this during every normal install on Render, even if render.yaml is not applied.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

if (process.platform !== 'linux' || process.arch !== 'x64') {
  console.warn('[yt-dlp] Skipping standalone Linux x64 installation on this platform');
  process.exit(0);
}

const directory = path.join(__dirname, '..', 'bin');
const target = path.join(directory, 'yt-dlp');
const temporary = target + '.download';
const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

fs.mkdirSync(directory, { recursive: true });
try {
  execFileSync('curl', ['--fail', '--location', '--retry', '3', '--connect-timeout', '20', '--max-time', '180', '--output', temporary, url], { stdio: 'inherit' });
  fs.chmodSync(temporary, 0o755);
  const version = execFileSync(temporary, ['--version'], { encoding: 'utf8', timeout: 15000 }).trim();
  fs.renameSync(temporary, target);
  console.log('[yt-dlp] Installed successfully:', version, target);
} catch (error) {
  fs.rmSync(temporary, { force: true });
  console.error('[yt-dlp] Installation failed; check outbound GitHub access and curl availability');
  process.exitCode = 1;
}
