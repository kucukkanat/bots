// Lays out the installable package in `release/` for the `release` branch, so
// `npm i github:kucukkanat/bots#release` works without a build step: the built
// dist/, the source, and a package.json without dev-only scripts.
// Run after `npm run build`.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const out = 'release';
if (!existsSync('dist/bots.js')) throw new Error('run `npm run build` first');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const f of ['dist', 'src', 'README.md', 'LICENSE', 'CHANGELOG.md']) cpSync(f, `${out}/${f}`, { recursive: true });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
delete pkg.scripts;
delete pkg.devDependencies;
writeFileSync(`${out}/package.json`, JSON.stringify(pkg, null, 2) + '\n');
console.log(`${out}/: ${pkg.name}@${pkg.version}`);
