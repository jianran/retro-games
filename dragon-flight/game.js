// ── Dragon Flight — Multiplayer Dragon Racing Game ──

const DRAGON_EMOJIS = ['🐉', '🐲', '🔥', '🦎'];
const NPC_NAMES = ['Blaze', 'Smaug', 'Ember', 'Toothless', 'Spyro', 'Charizard', 'Alduin', 'Drogon'];
const TOTAL_DRAGONS = 4;

// ── STATE ──
let state = {
  screen: 'start',
  humanCount: 1,
  dragons: [],
  race: null,
};

// ── DOM REFS ──
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const winScreen = $('#win-screen');
const dragonConfig = $('#dragon-config');
const controlsLegend = $('#controls-legend');
const startBtn = $('#start-btn');
const playAgainBtn = $('#play-again-btn');
const hud = $('#hud');
const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
const winnerText = $('#winner-text');
const winnerSub = $('#winner-sub');

// ── PLAYER COUNT ──
$$('.player-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.player-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.humanCount = parseInt(btn.dataset.count);
    renderDragonConfig();
    renderControls();
  });
});

// ── DRAGON CONFIG ──
function renderDragonConfig() {
  dragonConfig.innerHTML = '';
  for (let i = 0; i < TOTAL_DRAGONS; i++) {
    const isHuman = i < state.humanCount;
    const defaultName = isHuman ? `Player ${i + 1}` : NPC_NAMES[i - state.humanCount];
    const row = document.createElement('div');
    row.className = 'dragon-row';
    row.innerHTML =
      `<span class="emoji">${DRAGON_EMOJIS[i]}</span>
       <input class="name-input" type="text" maxlength="12" placeholder="${defaultName}"
              value="${isHuman ? '' : defaultName}" ${!isHuman ? 'readonly' : ''}>
       <span class="badge ${isHuman ? 'human' : 'npc'}">${isHuman ? 'Player' : 'NPC'}</span>`;
    dragonConfig.appendChild(row);
  }
}

// ── CONTROLS LEGEND ──
const CONTROL_SCHEMES = [
  { up: 'W', down: 'S', boost: 'Shift' },
  { up: '↑', down: '↓', boost: '/' },
  { up: 'I', down: 'K', boost: 'O' },
];

function renderControls() {
  controlsLegend.innerHTML = '';
  for (let i = 0; i < state.humanCount; i++) {
    const c = CONTROL_SCHEMES[i];
    const col = document.createElement('div');
    col.className = 'ctrl-col';
    col.innerHTML =
      `<span class="ctrl-label">Player ${i + 1} ${DRAGON_EMOJIS[i]}</span>
       <div><span class="ctrl-key">${c.up}</span><span class="ctrl-key">${c.down}</span> Move</div>
       <div><span class="ctrl-key">${c.boost}</span> Boost</div>`;
    controlsLegend.appendChild(col);
  }
}

// ── START ──
startBtn.addEventListener('click', () => {
  const nameInputs = $$('.name-input');
  state.dragons = [];
  for (let i = 0; i < TOTAL_DRAGONS; i++) {
    const isHuman = i < state.humanCount;
    const nameVal = nameInputs[i].value.trim();
    state.dragons.push({
      id: i,
      name: nameVal || (isHuman ? `Player ${i + 1}` : NPC_NAMES[i - state.humanCount]),
      emoji: DRAGON_EMOJIS[i],
      isHuman,
      keys: isHuman ? CONTROL_SCHEMES[i] : null,
    });
  }
  startRace();
});

playAgainBtn.addEventListener('click', () => showScreen('start'));

function showScreen(name) {
  state.screen = name;
  startScreen.classList.toggle('hidden', name !== 'start');
  gameScreen.classList.toggle('hidden', name !== 'game');
  winScreen.classList.toggle('hidden', name !== 'win');
}

// ═══════════════════════════════════════════
//  RACE
// ═══════════════════════════════════════════
const FINISH_X = 8000;
const WORLD_H = 600;
const KEYS = {};

function startRace() {
  showScreen('game');
  resizeCanvas();

  const laneH = WORLD_H / TOTAL_DRAGONS;
  state.race = {
    dragons: state.dragons.map((d, i) => ({
      ...d,
      x: 80, y: laneH * i + laneH / 2,
      targetY: laneH * i + laneH / 2,
      speed: 1.8, boosting: false, boostCd: 0,
      stunned: 0, finished: false, finishOrder: null,
      color: ['#ff4444','#44aaff','#44ff44','#ffaa44'][i],
      flame: ['#ff8844','#88ccff','#88ff88','#ffcc88'][i],
    })),
    obstacles: [], powerups: [],
    worldX: 0, scrollV: 2.5,
    time: 0, finishedN: 0, particles: [],
  };

  buildHUD();
  window._bindTouchForRace();
  window.addEventListener('keydown', onKD);
  window.addEventListener('keyup', onKU);
  requestAnimationFrame(loop);

  state.race._t1 = setInterval(spawnObs, 900);
  state.race._t2 = setInterval(spawnPwr, 3500);
}

function buildHUD() {
  hud.innerHTML = '';
  state.race.dragons.forEach((d, i) => {
    const c = document.createElement('div');
    c.className = 'hud-card';
    c.id = 'hud-' + i;
    c.innerHTML =
      `<span class="hud-name" style="color:${d.color}">${d.emoji} ${d.name}</span>
       <span class="hud-status">🏁 0%</span>
       <div class="hud-bar-bg"><div class="hud-bar" style="width:0%;background:${d.color}"></div></div>`;
    hud.appendChild(c);
  });
}

function updHUD() {
  state.race.dragons.forEach((d, i) => {
    const c = document.getElementById('hud-' + i);
    if (!c) return;
    const pct = Math.min(100, Math.round((d.x / FINISH_X) * 100));
    c.querySelector('.hud-status').textContent = d.finished ? '🏁 #' + d.finishOrder + '!' : '🏁 ' + pct + '%';
    c.querySelector('.hud-bar').style.width = (d.finished ? 100 : pct) + '%';
  });
}

// ── INPUT ──
function onKD(e) {
  KEYS[e.key] = true;
  if (['w','W','s','S','ArrowUp','ArrowDown','i','I','k','K','Shift','/','o','O',' '].includes(e.key)) e.preventDefault();
}
function onKU(e) { KEYS[e.key] = false; }
function isKey(k) {
  if (k === '↑') return KEYS['ArrowUp'];
  if (k === '↓') return KEYS['ArrowDown'];
  return KEYS[k] || KEYS[k.toUpperCase()] || KEYS[k.toLowerCase()];
}

// ── TOUCH CONTROLS ──
function controlKeyToEventKey(k) {
  if (k === '↑') return 'ArrowUp';
  if (k === '↓') return 'ArrowDown';
  return k.toLowerCase();
}

(function setupTouchControls() {
  function makeHandlers(ctrlKey) {
    const ek = controlKeyToEventKey(ctrlKey);
    return {
      down(e) { e.preventDefault(); KEYS[ek] = true; e.currentTarget.classList.add('pressed'); },
      up(e)   { e.preventDefault(); KEYS[ek] = false; e.currentTarget.classList.remove('pressed'); },
    };
  }

  function bind(el, handlers) {
    el.addEventListener('pointerdown', handlers.down);
    el.addEventListener('pointerup', handlers.up);
    el.addEventListener('pointerleave', handlers.up);
    el.addEventListener('pointercancel', handlers.up);
  }

  // Re-bind on each race start since control schemes can change with player count
  window._bindTouchForRace = function () {
    if (!state.race) return;
    const p1 = state.race.dragons.find(d => d.isHuman);
    if (!p1 || !p1.keys) return;
    // Always query fresh — previous nodes may have been replaced by cloning
    const oldUp = document.getElementById('btn-up');
    const oldDown = document.getElementById('btn-down');
    if (!oldUp || !oldDown) return;
    const newUp = oldUp.cloneNode(true);
    const newDown = oldDown.cloneNode(true);
    oldUp.parentNode.replaceChild(newUp, oldUp);
    oldDown.parentNode.replaceChild(newDown, oldDown);
    bind(newUp, makeHandlers(p1.keys.up));
    bind(newDown, makeHandlers(p1.keys.down));
  };
})();

// ── SPAWNERS ──
function spawnObs() {
  const r = state.race; if (!r) return;
  const t = ['cloud','bird','mtn'][Math.floor(Math.random() * 3)];
  const x = r.worldX + 900 + Math.random() * 300;
  const y = 40 + Math.random() * (WORLD_H - 80);
  let w, h, em;
  if (t === 'cloud') { w = 70; h = 45; em = '☁️'; }
  else if (t === 'bird') { w = 50; h = 35; em = '🦅'; }
  else { w = 90; h = 70; em = '⛰️'; }
  r.obstacles.push({ type: t, x, y, w, h, emoji: em });
}

function spawnPwr() {
  const r = state.race; if (!r) return;
  const t = Math.random() < 0.6 ? 'boost' : 'shield';
  r.powerups.push({
    type: t, x: r.worldX + 900 + Math.random() * 300,
    y: 40 + Math.random() * (WORLD_H - 80), w: 28, h: 28,
    emoji: t === 'boost' ? '⚡' : '🛡️',
  });
}

function particles(x, y, col, n) {
  n = n || 6;
  for (let i = 0; i < n; i++) {
    state.race.particles.push({
      x, y, vx: (Math.random() - 0.5) * 4 - 2, vy: (Math.random() - 0.5) * 4,
      life: 1, decay: 0.02 + Math.random() * 0.04, color: col, size: 2 + Math.random() * 3,
    });
  }
}

// ── LOOP ──
let lt = 0;
function loop(ts) {
  if (state.screen !== 'game' || !state.race) return;
  const dt = lt ? Math.min(ts - lt, 50) : 16;
  lt = ts;
  update(dt);
  render();
  updHUD();
  requestAnimationFrame(loop);
}

function update(dt) {
  const r = state.race, f = dt / 16;
  r.time += dt;
  r.worldX += r.scrollV * f;

  r.dragons.forEach(d => {
    if (d.finished) return;
    if (d.stunned > 0) { d.stunned -= dt; if (d.stunned < 0) d.stunned = 0; d.x -= 1.5 * f; if (d.x < 10) d.x = 10; return; }
    if (d.boostCd > 0) d.boostCd -= dt;

    if (d.isHuman) {
      if (isKey(d.keys.up)) d.y -= 3.5 * f;
      if (isKey(d.keys.down)) d.y += 3.5 * f;
      d.y = Math.max(30, Math.min(WORLD_H - 30, d.y));
      d.boosting = isKey(d.keys.boost) && d.boostCd <= 0;
      d.speed = d.boosting ? 3.5 : 1.8;
      if (d.boosting && Math.random() < 0.3) particles(d.x, d.y, d.flame, 2);
    } else {
      const baseSp = 1.4 + (2.2 - 1.4) * (0.6 + 0.4 * Math.sin(d.id * 2.5));
      d.y += (d.targetY - d.y) * 0.03 * f;
      d.y += Math.sin(r.time * 0.002 + d.id * 1.7) * 0.8 * f;
      d.y = Math.max(35, Math.min(WORLD_H - 35, d.y));
      d.boosting = Math.random() < 0.08 && d.boostCd <= 0;
      d.speed = d.boosting ? 3.5 : baseSp;
      if (Math.random() < 0.01) d.targetY = 40 + Math.random() * (WORLD_H - 80);
      r.obstacles.forEach(o => {
        const dx = o.x - d.x, dy = o.y - d.y;
        if (Math.sqrt(dx * dx + dy * dy) < 100 && dx > -30) d.y += dy > 0 ? -2 * f : 2 * f;
      });
    }

    if (d.boosting && d.boostCd <= 0) d.boostCd = 2000;
    if (d.boostCd > 1800) { d.boosting = false; d.speed = d.isHuman ? 1.8 : 1.8; }

    d.x += d.speed * f;

    r.obstacles.forEach(o => {
      if (d.x - 15 < o.x + o.w / 2 && d.x + 15 > o.x - o.w / 2 &&
          d.y - 12 < o.y + o.h / 2 && d.y + 12 > o.y - o.h / 2) {
        if (!d.stunned) { d.stunned = 500; d.x -= 40; if (d.x < 10) d.x = 10; particles(d.x, d.y, '#fff', 8); }
      }
    });

    for (let i = r.powerups.length - 1; i >= 0; i--) {
      const p = r.powerups[i];
      if (d.x - 15 < p.x + p.w / 2 && d.x + 15 > p.x - p.w / 2 &&
          d.y - 12 < p.y + p.h / 2 && d.y + 12 > p.y - p.h / 2) {
        if (p.type === 'boost') { d.x += 120; particles(d.x, d.y, '#ff0', 10); }
        else { d.stunned = 0; particles(d.x, d.y, '#4af', 8); }
        r.powerups.splice(i, 1);
      }
    }

    if (d.x >= FINISH_X && !d.finished) {
      d.finished = true; r.finishedN++; d.finishOrder = r.finishedN;
      particles(d.x, d.y, d.color, 20);
      if (d.finishOrder === 1) setTimeout(() => endRace(d), 800);
    }
  });

  r.obstacles = r.obstacles.filter(o => o.x > r.worldX - 200);
  r.powerups = r.powerups.filter(p => p.x > r.worldX - 200);
  r.particles.forEach(p => { p.x += p.vx * f; p.y += p.vy * f; p.life -= p.decay * f; });
  r.particles = r.particles.filter(p => p.life > 0);
}

function endRace(winner) {
  if (!state.race) return;
  cleanupRace();
  winnerText.textContent = winner.emoji + ' ' + winner.name + ' Wins!';
  winnerSub.textContent = 'First across the finish line!';
  showScreen('win');
}

function cleanupRace() {
  window.removeEventListener('keydown', onKD);
  window.removeEventListener('keyup', onKU);
  if (state.race) { clearInterval(state.race._t1); clearInterval(state.race._t2); state.race = null; }
  lt = 0;
}

// ═══════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', () => { if (state.screen === 'game') resizeCanvas(); });

function render() {
  const r = state.race; if (!r) return;
  const W = canvas.width, H = canvas.height;

  // Sky
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a3a6a'); g.addColorStop(0.4, '#2a6db5');
  g.addColorStop(0.7, '#4a9dd5'); g.addColorStop(1, '#6ab8e0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Parallax clouds
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 8; i++) {
    const cx = ((i * 280 + 50) - (r.worldX * 0.15)) % (W + 400) - 100;
    ctx.beginPath();
    ctx.arc(cx, 50 + i * 70, 30 + i * 8, 0, Math.PI * 2);
    ctx.arc(cx + 24, 42 + i * 70, 22 + i * 6, 0, Math.PI * 2);
    ctx.arc(cx + 48, 50 + i * 70, 20 + i * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  const leadX = Math.max(...r.dragons.map(d => d.x));
  const camX = leadX - W * 0.35;
  ctx.translate(-camX, 0);

  // Ground
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
  ctx.setLineDash([20, 15]);
  ctx.beginPath(); ctx.moveTo(camX - 100, WORLD_H - 5); ctx.lineTo(camX + W + 200, WORLD_H - 5); ctx.stroke();
  ctx.setLineDash([]);

  // Mountains
  for (let i = 0; i < 15; i++) {
    const mx = i * 600 - (r.worldX * 0.25) % 600;
    ctx.fillStyle = 'rgba(20,40,60,0.4)';
    ctx.beginPath(); ctx.moveTo(mx - 64, WORLD_H - 20); ctx.lineTo(mx, WORLD_H - 20 - 80 - i * 25); ctx.lineTo(mx + 64, WORLD_H - 20); ctx.fill();
  }

  // Finish line
  const fx = FINISH_X;
  for (let sy = 0; sy < WORLD_H; sy += 20) {
    for (let sx = 0; sx < 30; sx += 20) {
      ctx.fillStyle = (Math.floor(sy / 20) + Math.floor(sx / 20)) % 2 === 0 ? '#fff' : '#000';
      ctx.fillRect(fx - 15 + sx, sy, 20, 20);
    }
  }
  ctx.fillStyle = '#ffdd44'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🏁 FINISH 🏁', fx, 40);

  // Obstacles
  r.obstacles.forEach(o => { ctx.font = o.h * 0.8 + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(o.emoji, o.x, o.y + o.h * 0.25); });

  // Powerups
  r.powerups.forEach(p => {
    const s = 1 + Math.sin(r.time * 0.006 + p.x) * 0.2;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s);
    ctx.fillStyle = p.type === 'boost' ? 'rgba(255,255,0,0.3)' : 'rgba(68,170,255,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.emoji, 0, 8);
    ctx.restore();
  });

  // Dragons
  r.dragons.forEach(d => {
    ctx.save(); ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 16, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (d.stunned > 0) ctx.scale(0.85, 0.85);
    ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(d.emoji, 0, 4);

    if (d.boosting && !d.stunned) {
      const fs = 8 + Math.random() * 6;
      ctx.fillStyle = d.flame; ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(-22 - fs, 0); ctx.lineTo(-22, 4); ctx.fill();
    }

    if (d.stunned > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px sans-serif';
      ctx.fillText('⭐', Math.cos(r.time * 0.01) * 18, -12);
      ctx.fillText('✨', Math.cos(r.time * 0.01 + 2) * 16, -2);
    }

    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(d.name, 0, 30);
    ctx.restore();
  });

  // Particles
  r.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;

  ctx.restore();

  // Progress text
  const pct = Math.min(100, Math.round((leadX / FINISH_X) * 100));
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px monospace'; ctx.textAlign = 'right';
  ctx.fillText('Distance: ' + pct + '%', W - 20, H - 15);
}

// ── INIT ──
renderDragonConfig();
renderControls();
