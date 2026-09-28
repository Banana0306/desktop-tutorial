// 把 public/ 打包進 worker，產生 dist/worker.single.js（可直接貼到 Cloudflare 後台編輯器）
const fs = require('fs'), path = require('path');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const assets = {};
for (const f of fs.readdirSync('public')) { const ext = path.extname(f); if (!types[ext]) continue; assets['/' + f] = { type: types[ext], body: fs.readFileSync(path.join('public', f), 'utf8') }; }
let src = fs.readFileSync('src/worker.js', 'utf8');
src = src.replace("return env.ASSETS.fetch(req);", "return serveAsset(url.pathname);");
src += `
// ---------- 內嵌靜態檔（由 build-single.js 產生） ----------
const ASSETS = ${JSON.stringify(assets)};
function serveAsset(p) {
  const a = ASSETS[p] || ASSETS['/index.html'];
  const cache = p === '/' || p.endsWith('.html') || !ASSETS[p] ? 'no-cache' : 'public, max-age=300';
  return new Response(a.body, { headers: { 'content-type': a.type, 'cache-control': cache } });
}
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/worker.single.js', src);
console.log('dist/worker.single.js', src.length, 'bytes');
