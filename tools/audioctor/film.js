// The Audioctor films for snowstar.company: the app's own page (loaded as it ships), driven by the engine's real
// output, filmed in headless Chrome and given the sound the app itself made.
//   node film.js song|video [--still 6.5] [--out DIR]
// Needs: film/<id>-film.json and film/<id>-audio.wav (make them with film/audio.py).
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn, execFileSync } = require('child_process');
const WebSocket = require(path.join(os.homedir(), 'Dropbox/CLAUDE CODE PROJETCS/STREAMDAW/server/node_modules/ws'));

const HERE = __dirname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = 'file://' + path.join(os.homedir(), 'Dropbox/CLAUDE CODE PROJETCS/SNOWSTAR-ENHANCE/app/ui/index.html');
const W = 1280, H = 568, DPR = 1.5, OUTW = 1600;       // the app's window, filmed at 1920x852, written at 1600x710
const id = process.argv[2];
const still = process.argv.includes('--still') ? parseFloat(process.argv[process.argv.indexOf('--still') + 1]) : null;
const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : HERE;
if (!id) { console.error('film.js song|video [--still t]'); process.exit(1); }

const film = JSON.parse(fs.readFileSync(path.join(HERE, `${id}-film.json`), 'utf8'));
const sceneSrc = fs.readFileSync(path.join(HERE, 'scene.js'), 'utf8').replace(/^\/\/.*$/gm, '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audioctor-film-'));
  const chrome = spawn(CHROME, ['--headless=new', `--user-data-dir=${path.join(tmp, 'p')}`, '--remote-debugging-port=0',
    '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
  let dt = null;
  for (let i = 0; i < 120 && !dt; i++) {
    try { const [p, w] = fs.readFileSync(path.join(tmp, 'p', 'DevToolsActivePort'), 'utf8').split('\n'); if (p && w) dt = `ws://127.0.0.1:${p}${w}`; } catch {}
    if (!dt) await sleep(150);
  }
  if (!dt) throw new Error('Chrome did not start');
  const ws = new WebSocket(dt, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const waiting = new Map(), listeners = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
    else if (m.method) listeners.forEach((l) => l(m));
  });
  const send = (method, params, sessionId) => new Promise((r) => {
    const i = ++seq; waiting.set(i, r);
    ws.send(JSON.stringify(sessionId ? { id: i, method, params: params || {}, sessionId } : { id: i, method, params: params || {} }));
  });

  try {
    const tid = (await send('Target.createTarget', { url: 'about:blank' })).result.targetId;
    const sid = (await send('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
    await send('Page.enable', {}, sid);
    await send('Runtime.enable', {}, sid);
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false }, sid);
    await send('Page.navigate', { url: `${PAGE}?scene=none` }, sid);
    await sleep(1400);                                                   // the art loads, the lab is laid out

    const inject = `(${sceneSrc})(${JSON.stringify(film)})`;
    if (still !== null) {
      const r = await send('Runtime.evaluate', { expression: inject, returnByValue: true }, sid);
      if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      console.log('scene:', JSON.stringify(r.result && r.result.result && r.result.result.value));
      await sleep(still * 1000);
      const shot = (await send('Page.captureScreenshot', { format: 'png' }, sid)).result.data;
      const f = path.join(outDir, `${id}-still-${still}.png`);
      fs.writeFileSync(f, Buffer.from(shot, 'base64'));
      const errs = (await send('Runtime.evaluate', { expression: 'window.__acErrors || []', returnByValue: true }, sid)).result.result.value;
      console.log(`still -> ${f}`, errs && errs.length ? errs : '');
      return;
    }

    const frames = [];
    listeners.length = 0;
    listeners.push((m) => {
      if (m.method !== 'Page.screencastFrame' || m.sessionId !== sid) return;
      frames.push({ t: m.params.metadata.timestamp, data: m.params.data });
      send('Page.screencastFrameAck', { sessionId: m.params.sessionId }, sid);
    });
    await send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 }, sid);
    await sleep(250);
    const r = await send('Runtime.evaluate', { expression: inject, returnByValue: true }, sid);
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    const zero = r.result.result.value.epoch;      // the scene's t = 0, in the same clock as the frames' timestamps
    const t0 = Date.now();
    await sleep(film.duration * 1000 + 500);
    await send('Page.stopScreencast', {}, sid);
    console.log(`${id}: ${frames.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await send('Target.closeTarget', { targetId: tid });

    // the frames at their own times -> a steady 30 fps. Everything the screencast sent before the scene began is
    // dropped, so the picture and the sound share one zero (they were half a frame apart until this was measured).
    const dir = path.join(tmp, id); fs.mkdirSync(dir);
    const shot = frames.filter((f) => f.t - zero >= -0.005);
    const lead = Math.max(0, shot.length ? shot[0].t - zero : 0);
    console.log(`${id}: dropped ${frames.length - shot.length} frames before the scene, lead ${(lead * 1000).toFixed(0)} ms`);
    let list = '';
    shot.forEach((f, i) => {
      const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      const next = i + 1 < shot.length ? shot[i + 1].t : f.t + 0.1;
      list += `file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
    });
    fs.writeFileSync(path.join(dir, 'list.txt'), list);

    const mp4 = path.join(outDir, `audioctor-${id}.mp4`);
    const audio = path.join(HERE, film.audio);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
      '-ss', lead.toFixed(3), '-i', audio,
      '-t', String(film.duration - lead),
      '-vf', `fps=30,scale=${OUTW}:-2:flags=lanczos,format=yuv420p`,
      '-c:v', 'h264_videotoolbox', '-b:v', '1500k', '-profile:v', 'high', '-tag:v', 'avc1',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', '-shortest', mp4]);
    const poster = path.join(outDir, `audioctor-${id}.jpg`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(film.poster || (film.ready + 1.2)), '-i', mp4,
      '-frames:v', '1', '-q:v', '3', poster]);
    console.log(`${id}: ${(fs.statSync(mp4).size / 1048576).toFixed(2)} MB -> ${mp4}`);
    console.log(`${id}: poster -> ${poster}`);
  } finally {
    ws.close(); chrome.kill('SIGKILL');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
