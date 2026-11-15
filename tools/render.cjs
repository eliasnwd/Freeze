// Usage: node tools/render.cjs out.mp4|frames:dir [t0] [t1] [fps] [w] [h]  (or --shots t1,t2,... dir)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const a = process.argv.slice(2);
  const shots = a[0] === '--shots';
  const W = +(process.env.W || 720), H = +(process.env.H || 1280);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  p.on('pageerror', (e) => console.log('E', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('C', m.text()); });
  await p.goto(`http://localhost:8123/film/index.html?render=1&w=${W}&h=${H}&lang=${process.env.LANG_SUB || 'en'}`);
  await p.waitForFunction('window.ready', null, { timeout: 180000 });
  if (a[0] === '--segs') {
    for (const sg of a[1].split(',')) {
      const [s0, s1] = sg.split('-').map(Number), fps = 24, n = Math.round((s1 - s0) * fps);
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '24', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', `${a[2]}/seg_${s0}_${s1}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let i = 0; i < n; i++) { await p.evaluate(`renderAt(${s0 + i / fps})`); const buf = await p.screenshot({ type: 'jpeg', quality: 92 }); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); }
      ff.stdin.end(); await new Promise((r) => ff.on('close', r)); console.log('done', sg);
    }
    await b.close(); return;
  }
  if (shots) {
    const ts = a[1].split(',').map(Number);
    for (const t of ts) { await p.evaluate(`renderAt(${t})`); await p.screenshot({ path: `${a[2]}/s_${t}.jpg`, type: 'jpeg', quality: 80 }); }
    await b.close(); return;
  }
  const out = a[0], t0 = +(a[1] || 0), t1 = +(a[2] || await p.evaluate('window.filmDuration')), fps = +(a[3] || 24);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((t1 - t0) * fps); const st = Date.now();
  for (let i = 0; i < n; i++) {
    await p.evaluate(`renderAt(${t0 + i / fps})`);
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 240 === 0) console.log(`frame ${i}/${n} ${((Date.now() - st) / 1000 / (i + 1)).toFixed(3)}s/f`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close();
})();
