// 빌드: src/ (원본) → 루트의 index.html, style.css, game.min.js (배포용, 난독화)
// 사용법: npm run build   (배포용, 난독화)
//         npm run dev     (개발용, 난독화·보호 없음)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const dev = process.argv.includes('--dev');

(async () => {
  const res = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: ['es2019'],
    write: false,
    legalComments: 'none',
    define: { __DEV__: dev ? 'true' : 'false' },
  });
  let code = res.outputFiles[0].text;
  if (!dev) {
    const JO = require('javascript-obfuscator');
    code = JO.obfuscate(code, {
      compact: true,
      controlFlowFlattening: false, // 성능 우선
      deadCodeInjection: false,
      debugProtection: false,
      disableConsoleOutput: true,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: false,
      stringArray: true,
      stringArrayEncoding: ['base64'],
      stringArrayThreshold: 0.75,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
      target: 'browser',
    }).getObfuscatedCode();
  }
  fs.writeFileSync(path.join(root, 'game.min.js'), code);
  const css = await esbuild.transform(fs.readFileSync(path.join(root, 'src/style.css'), 'utf8'), { loader: 'css', minify: true });
  fs.writeFileSync(path.join(root, 'style.css'), css.code);
  let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s+/g, '\n');
  fs.writeFileSync(path.join(root, 'index.html'), html);
  console.log(`빌드 완료 (${dev ? '개발용' : '배포용'}) game.min.js ${(code.length / 1024).toFixed(0)}KB`);
})().catch((e) => { console.error(e); process.exit(1); });
