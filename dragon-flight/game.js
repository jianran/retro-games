// ─────────────────────────────────────────────
//  Dragon Flight – game.js
// ─────────────────────────────────────────────

const DRAGON_DEFS = [
  { emoji: '🐉', color: '#ff4422', name: 'Ignis',  lane: 0 },
  { emoji: '🐲', color: '#44aaff', name: 'Aqua',   lane: 1 },
  { emoji: '🦅', color: '#44ff88', name: 'Sylva',  lane: 2 },
];

const CONTROLS = [
  { up: 'ArrowUp',   down: 'ArrowDown',  label: '↑ / ↓' },
  { up: 'w',         down: 's',          label: 'W / S'  },
  { up: 'i',         down: 'k',          label: 'I / K'  },
];

// ── UI wiring ──────────────────────────────────
let humanCount = 1;
const playerBtns = document.querySelectorAll('.player-btn');
const dragonConfig = document.getElementById('dragon-config');
const controlsLegend = document.getElementById('controls-legend');
const startBtn = document.getElementById('start-btn');
const playAgainBtn = document.getElementById('play-again-btn');

function renderConfig() {
  dragonConfig.innerHTML = '';
  controlsLegend.innerHTML = '';
  DRAGON_DEFS.forEach((d, i) => {
    const isHuman = i < humanCount;
    const row = document.createElement('div');
    row.className = 'dragon-row';
    row.innerHTML = `
      <span class="emoji">${d.emoji}</span>
      <input class="name-input" id="name-${i}" value="${d.name}" maxlength="14" />
      <span class="badge ${isHuman ? 'human' : 'npc'}">${isHuman ? 'Player '+(i+1) : 'NPC'}</span>
    `;
    dragonConfig.appendChild(row);
  });

  // Controls legend for human players
  const humanPlayers = Math.min(humanCount, 3);
  for (let i = 0; i < humanPlayers; i++) {
    const col = document.createElement('div');
    col.className = 'ctrl-col';
    col.innerHTML = `
      <span class="ctrl-label">${DRAGON_DEFS[i].emoji} Dragon ${i+1}</span>
      <span><span class="ctrl-key">${CONTROLS[i].label.split('/')[0].trim()}</span> Up</span>
      <span><span class="ctrl-key">${CONTROLS[i].label.split('/')[1].trim()}</span> Down</span>
    `;
    controlsLegend.appendChild(col);
  }
}

playerBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    humanCount = parseInt(btn.dataset.count);
    playerBtns.forEach(b => b.classList.toggle('active', b === btn));
    renderConfig();
  });
});

renderConfig();

startBtn.addEventListener('click', startGame);
playAgainBtn.addEventListener('click', () => {
  document.getElementById('win-screen').classList.add('hidden');
  document.getElementById('start-screen').classList.remove('hidden');
  renderConfig();
});

// ── Canvas / Game ──────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const TRACK_H = 240;        // height of each lane track
const DRAGON_SIZE = 48;     // sprite bounding box
const LANE_COUNT = 3;
const LANE_PADDING = 40;    // top/bottom padding inside lane
const OBSTACLE_SPEED_BASE = 280;  // px/s world speed
const TRACK_LENGTH = 24000;  // total scrollable world (px)
const FINISH_X = TRACK_LENGTH - 400;

let gameState = null;
let animId = null;
let lastTime = null;

function getNames() {
  return DRAGON_DEFS.map((_, i) => document.getElementById('name-'+i)?.value || DRAGON_DEFS[i].name);
}

function startGame() {
  const names = getNames();

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');

  resizeCanvas();

  const totalH = LANE_COUNT * TRACK_H;
  const offsetY = (canvas.height - totalH) / 2;

  gameState = {
    dragons: DRAGON_DEFS.map((d, i) => ({
      idx: i,
      name: names[i],
      isHuman: i < humanCount,
      color: d.color,
      emoji: d.emoji,
      controls: CONTROLS[i],

      // Position
      worldX: 60,          // position in world coords
      laneY: offsetY + d.lane * TRACK_H + TRACK_H / 2, // fixed lane centre
      y: offsetY + d.lane * TRACK_H + TRACK_H / 2,     // actual y (for up/down within lane)
      vy: 0,               // vertical velocity

      // State
      speed: OBSTACLE_SPEED_BASE,  // world scroll speed for this dragon
      boosted: false,
      boostTimer: 0,
      stunned: false,
      stunTimer: 0,
      finished: false,
      finishTime: null,
      place: null,

      // Keys held
      upHeld: false,
      downHeld: false,

      // NPC steering target
      npcTargetY: offsetY + d.lane * TRACK_H + TRACK_H / 2,
      // Slight personality variance per NPC (ring hunger 0–1, caution 0–1)
      npcRingHunger: 0.6 + (i * 0.17) % 0.5,
      npcCaution:    0.7 + (i * 0.23) % 0.4,

      // Track progress
      distance: 0,
    })),

    obstacles: generateObstacles(offsetY),
    particles: [],
    cheatFlash: 0,
    offsetY,
    placesAwarded: 0,
    startTime: performance.now(),
    over: false,
  };

  buildHUD(names);
  cheatBuffer = '';
  setupKeys();

  if (animId) cancelAnimationFrame(animId);
  lastTime = null;
  animId = requestAnimationFrame(gameLoop);
}

// ── Canvas resize ──────────────────────────────
function resizeCanvas() {
  canvas.width  = canvas.offsetWidth  || window.innerWidth;
  canvas.height = canvas.offsetHeight || window.innerHeight;
}
window.addEventListener('resize', () => {
  if (gameState) {
    resizeCanvas();
    // recompute lane positions
    const totalH = LANE_COUNT * TRACK_H;
    const offsetY = (canvas.height - totalH) / 2;
    gameState.offsetY = offsetY;
    gameState.dragons.forEach((d, i) => {
      d.laneY = offsetY + i * TRACK_H + TRACK_H / 2;
    });
  }
});

// ── Obstacle generation ────────────────────────
function generateObstacles(offsetY) {
  const obs = [];
  const spacing = 350;
  const startX = 600;

  for (let x = startX; x < FINISH_X - 200; x += spacing + Math.random() * 200) {
    const lane = Math.floor(Math.random() * 3);
    const type = Math.random() < 0.35 ? 'ring' : 'stone';
    const laneCenter = offsetY + lane * TRACK_H + TRACK_H / 2;
    const yRange = TRACK_H / 2 - LANE_PADDING - 24;
    const y = laneCenter + (Math.random() * 2 - 1) * yRange;

    const radius = type === 'ring' ? 28 : 20;
    obs.push({ x, y, lane, type, radius, currentRadius: radius,
               phaseOffset: Math.random() * Math.PI * 2, active: true });
  }
  return obs;
}

// ── HUD ───────────────────────────────────────
function buildHUD(names) {
  const hud = document.getElementById('hud');
  hud.innerHTML = '';
  DRAGON_DEFS.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'hud-card';
    card.id = 'hud-'+i;
    card.innerHTML = `
      <div class="hud-name" style="color:${d.color}">${d.emoji} ${names[i]}</div>
      <div class="hud-status" id="hud-status-${i}"></div>
      <div class="hud-bar-bg"><div class="hud-bar" id="hud-bar-${i}" style="width:0%;background:${d.color}"></div></div>
    `;
    hud.appendChild(card);
  });
}

function updateHUD() {
  gameState.dragons.forEach((d, i) => {
    const bar = document.getElementById('hud-bar-'+i);
    const status = document.getElementById('hud-status-'+i);
    if (!bar || !status) return;
    const pct = Math.min(100, (d.distance / FINISH_X) * 100);
    bar.style.width = pct + '%';

    if (d.finished) {
      status.textContent = `#${d.place} FINISH`;
      status.style.color = '#ffdd44';
    } else if (d.stunned) {
      status.textContent = '💥 STUNNED';
      status.style.color = '#ff4444';
    } else if (d.boosted) {
      status.textContent = '⚡ BOOST';
      status.style.color = '#44ffdd';
    } else {
      status.textContent = '';
    }
  });
}

// ── Input ─────────────────────────────────────
const keys = {};
const CHEAT_CODE = '2015';
let cheatBuffer = '';

function setupKeys() {
  document.onkeydown = e => {
    keys[e.key] = true;

    // Cheat code detection — accumulate printable characters
    if (e.key.length === 1) {
      cheatBuffer = (cheatBuffer + e.key).slice(-CHEAT_CODE.length);
      if (cheatBuffer === CHEAT_CODE) {
        cheatBuffer = '';
        activateCheat();
      }
    }
  };
  document.onkeyup = e => { keys[e.key] = false; };
}

function activateCheat() {
  if (!gameState || gameState.over) return;
  const gs = gameState;

  // Spawn 5 Oura rings in front of every human dragon
  gs.dragons.forEach(d => {
    if (!d.isHuman || d.finished) return;
    const spacing = 220;
    for (let i = 0; i < 5; i++) {
      const wobble = (i % 2 === 0 ? -1 : 1) * 25; // slight zigzag
      gs.obstacles.push({
        x: d.distance + spacing * (i + 1),
        y: d.y + wobble,
        lane: d.idx,
        type: 'ring',
        radius: 28,
        currentRadius: 28,
        phaseOffset: Math.random() * Math.PI * 2,
        active: true,
      });
    }
  });

  gs.cheatFlash = 1.8; // seconds to show the banner
}

// ── NPC AI ────────────────────────────────────
function npcThink(dragon, obstacles) {
  const speed = dragon.boosted ? OBSTACLE_SPEED_BASE * 2 : OBSTACLE_SPEED_BASE;
  // Look further ahead at high speed; also affected by caution personality
  const lookAhead = speed * (1.4 + dragon.npcCaution * 0.8);
  const HALF = TRACK_H / 2 - LANE_PADDING;

  // Sample Y positions across the full lane height
  const SAMPLES = 13;
  let bestScore = -Infinity;
  let bestY = dragon.laneY;

  for (let s = 0; s < SAMPLES; s++) {
    const candidateY = dragon.laneY - HALF + (s / (SAMPLES - 1)) * HALF * 2;
    let score = 0;

    // Soft pull toward lane centre (less wandering when nothing nearby)
    const centreDist = Math.abs(candidateY - dragon.laneY) / HALF;
    score -= centreDist * centreDist * 60;

    // Penalty for continuing in the current velocity direction (momentum cost)
    // encourages earlier course corrections
    const dyFromCurrent = candidateY - dragon.y;
    if (Math.sign(dyFromCurrent) === Math.sign(dragon.vy) && Math.abs(dragon.vy) > 50) {
      score -= 10; // slight preference for positions that don't require acceleration
    }

    for (const o of obstacles) {
      if (!o.active) continue;
      const relX = o.x - dragon.distance;
      if (relX < 5 || relX > lookAhead) continue;

      // Quadratic proximity weight — obstacle at 10% ahead weighs ~81× more than at 100%
      const t = 1 - relX / lookAhead;
      const proximity = t * t;

      const clearance = Math.abs(o.y - candidateY);

      if (o.type === 'stone') {
        // Safety margin: full dragon radius + stone radius + buffer
        const danger = DRAGON_SIZE / 2 + o.radius + 12;
        if (clearance < danger) {
          // Steep penalty — avoiding stones is top priority
          const overlap = 1 - clearance / danger;
          score -= 900 * proximity * overlap * dragon.npcCaution;
        }
      } else {
        // Ring: reward being close to its Y, scaled by ring-hunger personality
        const reach = o.radius + DRAGON_SIZE / 2;
        if (clearance < reach * 1.5) {
          const alignment = 1 - clearance / (reach * 1.5);
          score += 500 * proximity * alignment * dragon.npcRingHunger;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestY = candidateY;
    }
  }

  dragon.npcTargetY = bestY;
}

// ── Update ────────────────────────────────────
function update(dt) {
  const gs = gameState;
  if (gs.over) return;

  // ── Tick cheat flash
  if (gs.cheatFlash > 0) gs.cheatFlash -= dt;

  // ── Animate stone expansion
  const now = performance.now() / 1000;
  gs.obstacles.forEach(o => {
    if (!o.active || o.type !== 'stone') return;
    const expansion = 0.65 + 0.85 * ((Math.sin(now * 1.6 + o.phaseOffset) + 1) / 2);
    o.currentRadius = o.radius * expansion;
  });

  // ── Tick particles
  for (let i = gs.particles.length - 1; i >= 0; i--) {
    const p = gs.particles[i];
    p.life -= dt;
    if (p.life <= 0) { gs.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt; // gravity
  }

  gs.dragons.forEach(d => {
    if (d.finished) return;

    // ── Timers
    if (d.stunned) {
      d.stunTimer -= dt;
      if (d.stunTimer <= 0) { d.stunned = false; d.stunTimer = 0; }
    }
    if (d.boosted) {
      d.boostTimer -= dt;
      if (d.boostTimer <= 0) { d.boosted = false; d.boostTimer = 0; d.speed = OBSTACLE_SPEED_BASE; }
    }

    if (d.stunned) return; // pause movement while stunned

    // ── Speed
    const spd = d.boosted ? OBSTACLE_SPEED_BASE * 2 : OBSTACLE_SPEED_BASE;
    d.speed = spd;

    // ── Vertical movement
    const HALF = TRACK_H / 2 - LANE_PADDING;
    if (d.isHuman) {
      d.upHeld   = !!keys[d.controls.up];
      d.downHeld = !!keys[d.controls.down];

      if (d.upHeld)   d.vy -= 1200 * dt;
      if (d.downHeld) d.vy += 1200 * dt;
      if (!d.upHeld && !d.downHeld) d.vy *= Math.pow(0.04, dt);
    } else {
      npcThink(d, gs.obstacles);
      // PD controller: smoothly accelerate toward target Y
      const err = d.npcTargetY - d.y;
      const desiredVy = Math.max(-380, Math.min(380, err * 6));
      d.vy += (desiredVy - d.vy) * Math.min(1, 9 * dt);
    }

    const maxV = 400;
    d.vy = Math.max(-maxV, Math.min(maxV, d.vy));
    d.y += d.vy * dt;

    // Clamp to lane bounds
    const minY = d.laneY - HALF;
    const maxY = d.laneY + HALF;
    if (d.y < minY) { d.y = minY; d.vy = 0; }
    if (d.y > maxY) { d.y = maxY; d.vy = 0; }

    // ── Advance in world
    d.distance += spd * dt;

    // ── Collision
    gs.obstacles.forEach(o => {
      if (!o.active) return;
      const relX = o.x - d.distance;
      if (Math.abs(relX) > 80 || Math.abs(o.y - d.y) > 80) return;
      const dx = o.x - d.distance;
      const dy = o.y - d.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const hitR = (DRAGON_SIZE / 2) + (o.currentRadius ?? o.radius) - 8;

      if (dist < hitR) {
        o.active = false;
        if (o.type === 'stone') {
          d.stunned = true;
          d.stunTimer = 1.0;
          d.vy = 0;
          // Spawn rock debris particles
          const sx = canvas.width * 0.35 + (o.x - gs.dragons.reduce((s,dr) => s+dr.distance,0)/gs.dragons.length);
          for (let p = 0; p < 14; p++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 80 + Math.random() * 220;
            gs.particles.push({
              x: sx, y: o.y,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 60,
              life: 0.4 + Math.random() * 0.5,
              maxLife: 0.9,
              color: ['#9aaacc','#667788','#aaaacc','#cc9966'][Math.floor(Math.random()*4)],
              size: 3 + Math.random() * 5,
            });
          }
        } else if (o.type === 'ring') {
          d.boosted = true;
          d.boostTimer = 2.0;
        }
      }
    });

    // ── Finish check
    if (d.distance >= FINISH_X) {
      d.finished = true;
      d.finishTime = performance.now() - gs.startTime;
      gs.placesAwarded++;
      d.place = gs.placesAwarded;
    }
  });

  // All finished?
  if (gs.dragons.every(d => d.finished)) {
    gs.over = true;
    setTimeout(showWinScreen, 600);
  }
}

// ── Draw ──────────────────────────────────────
function draw() {
  const W = canvas.width;
  const H = canvas.height;
  const gs = gameState;

  // Camera position: average of all dragon distances
  const camX = gs.dragons.reduce((s, d) => s + d.distance, 0) / gs.dragons.length;

  // Background + parallax
  drawBackground(camX, W, H);

  // Lanes
  DRAGON_DEFS.forEach((def, i) => {
    const laneTop = gs.offsetY + i * TRACK_H;
    const laneBot = laneTop + TRACK_H;

    // Lane background
    ctx.fillStyle = `rgba(255,255,255,0.03)`;
    ctx.fillRect(0, laneTop, W, TRACK_H);

    // Lane separator
    ctx.strokeStyle = '#ffffff15';
    ctx.lineWidth = 1;
    if (i > 0) {
      ctx.beginPath(); ctx.moveTo(0, laneTop); ctx.lineTo(W, laneTop); ctx.stroke();
    }

    // Lane bottom
    ctx.strokeStyle = '#ffffff15';
    ctx.beginPath(); ctx.moveTo(0, laneBot); ctx.lineTo(W, laneBot); ctx.stroke();

    // Scrolling dashed center line
    ctx.setLineDash([20, 30]);
    ctx.strokeStyle = `${def.color}33`;
    ctx.lineWidth = 2;
    const dashOffset = -(camX % 50);
    ctx.beginPath();
    ctx.moveTo(0, laneTop + TRACK_H / 2);
    ctx.lineTo(W, laneTop + TRACK_H / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Finish line
  const finishScreenX = FINISH_X - camX + W * 0.35;
  if (finishScreenX > 0 && finishScreenX < W + 100) {
    ctx.strokeStyle = '#ffdd44';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(finishScreenX, gs.offsetY);
    ctx.lineTo(finishScreenX, gs.offsetY + LANE_COUNT * TRACK_H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffdd44';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', finishScreenX, gs.offsetY - 12);
  }

  // Obstacles
  gs.obstacles.forEach(o => {
    if (!o.active) return;
    const sx = o.x - camX + W * 0.35;
    if (sx < -80 || sx > W + 80) return;

    if (o.type === 'stone') {
      drawStone(sx, o.y, o.currentRadius ?? o.radius, o.phaseOffset ?? 0);
    } else {
      drawRing(sx, o.y, o.radius);
    }
  });

  // Particles (rock debris)
  drawParticles(gs.particles, camX, W);

  // Dragons
  gs.dragons.forEach(d => {
    const sx = W * 0.35 + (d.distance - camX);
    drawDragon(d, sx, d.y);
  });

  // Cheat banner
  if (gs.cheatFlash > 0) {
    const alpha = Math.min(1, gs.cheatFlash * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(W / 2 - 230, H / 2 - 36, 460, 72);
    ctx.strokeStyle = '#ffdd44';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 230, H / 2 - 36, 460, 72);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('✨ 5 OURA RINGS INCOMING! ✨', W / 2, H / 2);
    ctx.restore();
  }

  // Progress indicators (mini map)
  drawMiniMap();
}

// ── Background ────────────────────────────────
function drawBackground(camX, W, H) {
  // Morning sky
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,    '#1e6fa8');
  sky.addColorStop(0.45, '#7ec8e3');
  sky.addColorStop(0.78, '#ffc870');
  sky.addColorStop(1,    '#ff8c42');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Distant mountain range (slowest parallax)
  drawMountainLayer(camX, W, H, 0.05, H * 0.70, H * 0.26, 'rgba(120,150,190,0.50)');
  // Mid mountain range
  drawMountainLayer(camX, W, H, 0.12, H * 0.78, H * 0.32, 'rgba(90,120,165,0.58)');
  // Near mountain range
  drawMountainLayer(camX, W, H, 0.22, H * 0.86, H * 0.20, 'rgba(60,90,140,0.65)');

  // Clouds
  drawClouds(camX, W, H);
}

function drawMountainLayer(camX, W, H, parallax, baseY, amplitude, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, baseY);
  for (let x = 0; x <= W; x += 3) {
    const wx = x + camX * parallax;
    const peak = Math.max(0,
      0.50 * Math.sin(wx * 0.0030 + 0.5) +
      0.30 * Math.sin(wx * 0.0071 + 1.7) +
      0.20 * Math.sin(wx * 0.0158 + 3.1)
    );
    ctx.lineTo(x, baseY - amplitude * peak);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawClouds(camX, W, H) {
  // Fixed cloud positions in world space; slow parallax
  const clouds = [
    { wx: 300,  wy: 0.09, sz: 55 },
    { wx: 850,  wy: 0.06, sz: 40 },
    { wx: 1400, wy: 0.13, sz: 70 },
    { wx: 2100, wy: 0.08, sz: 50 },
    { wx: 2800, wy: 0.11, sz: 62 },
    { wx: 3600, wy: 0.07, sz: 45 },
    { wx: 600,  wy: 0.16, sz: 38 },
    { wx: 1800, wy: 0.05, sz: 58 },
  ];
  ctx.fillStyle = 'rgba(255,248,235,0.30)';
  const tileSpan = 4200;
  for (const c of clouds) {
    for (let tile = 0; tile <= Math.ceil(TRACK_LENGTH / tileSpan) + 1; tile++) {
      const cx = (c.wx + tile * tileSpan) * 0.22 - camX * 0.22 + W * 0.35;
      if (cx < -160 || cx > W + 160) continue;
      const cy = c.wy * H;
      ctx.beginPath();
      ctx.arc(cx,              cy,            c.sz,       0, Math.PI * 2);
      ctx.arc(cx + c.sz * 0.7, cy - c.sz * 0.2, c.sz * 0.7, 0, Math.PI * 2);
      ctx.arc(cx - c.sz * 0.6, cy - c.sz * 0.1, c.sz * 0.55,0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawParticles(particles) {
  particles.forEach(p => {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawStone(x, y, r, phaseOffset) {
  const t = performance.now() / 1000;

  // Expansion drives glow intensity
  const baseExpansion = 0.65 + 0.85 * ((Math.sin(t * 1.6 + phaseOffset) + 1) / 2);
  const glowIntensity = Math.max(0, (baseExpansion - 0.9) / 0.6);

  // Danger glow around the whole cluster
  if (glowIntensity > 0.05) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
    glow.addColorStop(0,   `rgba(255,80,0,${glowIntensity * 0.4})`);
    glow.addColorStop(0.5, `rgba(255,40,0,${glowIntensity * 0.12})`);
    glow.addColorStop(1,   'transparent');
    ctx.beginPath();
    ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }

  // Three rocks: top-centre, bottom-left, bottom-right
  const subR = r * 0.75;
  const positions = [
    { dx:  0,        dy: -r * 0.80 },
    { dx: -r * 0.90, dy:  r * 0.52 },
    { dx:  r * 0.90, dy:  r * 0.52 },
  ];

  positions.forEach(({ dx, dy }) => {
    const rx = x + dx, ry = y + dy;

    // Shadow per rock
    ctx.beginPath();
    ctx.ellipse(rx, ry + subR * 0.65, subR * 1.1, subR * 0.28, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    // Rock body
    const g = ctx.createRadialGradient(rx - subR * 0.3, ry - subR * 0.3, 0, rx, ry, subR * 1.2);
    g.addColorStop(0,   glowIntensity > 0.4 ? '#cc8866' : '#aaaacc');
    g.addColorStop(0.5, '#667788');
    g.addColorStop(1,   '#334455');
    ctx.beginPath();
    ctx.ellipse(rx, ry, subR * 1.15, subR, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.font = `${subR * 1.6}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪨', rx, ry);

    // Grassy cap on top of rock
    const grassY = ry - subR * 0.72;
    ctx.beginPath();
    ctx.ellipse(rx, grassY, subR * 1.05, subR * 0.28, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#3d8c27';
    ctx.fill();

    // Grass blades
    ctx.strokeStyle = '#5cb83a';
    ctx.lineWidth = Math.max(1.5, subR * 0.11);
    ctx.lineCap = 'round';
    const blades = [
      { bx: -subR * 0.42, lean: -0.3 },
      { bx:  0,            lean:  0.1 },
      { bx:  subR * 0.42,  lean:  0.28 },
    ];
    for (const { bx, lean } of blades) {
      ctx.beginPath();
      ctx.moveTo(rx + bx, grassY);
      ctx.quadraticCurveTo(
        rx + bx + lean * subR * 0.5, grassY - subR * 0.6,
        rx + bx + lean * subR * 0.7, grassY - subR * 0.85
      );
      ctx.stroke();
    }
  });
}

function drawRing(x, y, r) {
  const t = performance.now() / 1000;
  const pulse = 1 + Math.sin(t * 3) * 0.07;
  const rr = r * pulse;

  // Outer glow
  const glow = ctx.createRadialGradient(x, y, rr * 0.5, x, y, rr * 2);
  glow.addColorStop(0, '#ffdd4455');
  glow.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.arc(x, y, rr * 2, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Ring
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffdd44';
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff88';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Sparkles
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + t * 2;
    const sx = x + Math.cos(angle) * (rr + 10);
    const sy = y + Math.sin(angle) * (rr + 10);
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffdd44';
    ctx.fill();
  }

  // Label
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffdd44';
  ctx.fillText('OURA', x, y);
}

function drawDragon(d, x, y) {
  ctx.save();

  // Boost trail
  if (d.boosted) {
    for (let i = 1; i <= 5; i++) {
      ctx.globalAlpha = (6 - i) * 0.07;
      ctx.font = `${DRAGON_SIZE * 0.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.emoji, x - i * 16, y + (Math.random() - 0.5) * 6);
    }
    ctx.globalAlpha = 1;
  }

  // Stun flash
  if (d.stunned) {
    const flash = Math.sin(performance.now() / 80) > 0;
    if (flash) {
      ctx.shadowColor = '#ff4444';
      ctx.shadowBlur = 20;
    }
    // Stars above
    ctx.font = '16px serif';
    ctx.fillText('💫', x + 20, y - 28);
  }

  // Boost glow
  if (d.boosted) {
    ctx.shadowColor = '#44ffdd';
    ctx.shadowBlur = 24;
  }

  // Name tag
  ctx.globalAlpha = 0.9;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = d.color;
  ctx.fillText(d.name, x, y - DRAGON_SIZE / 2 - 4);

  // Dragon emoji
  ctx.globalAlpha = 1;
  ctx.font = `${DRAGON_SIZE}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.emoji, x, y);

  // Finish flag
  if (d.finished) {
    ctx.font = '22px serif';
    ctx.fillText('🏁', x + 28, y - 20);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('#' + d.place, x + 28, y - 4);
  }

  ctx.restore();
}

function drawMiniMap() {
  const gs = gameState;
  const mmW = 180, mmH = 36;
  const mmX = canvas.width / 2 - mmW / 2;
  const mmY = canvas.height - 52;

  ctx.fillStyle = '#00000088';
  ctx.beginPath();
  // Manual rounded rect for cross-browser compatibility
  const rr = 8;
  ctx.moveTo(mmX + rr, mmY);
  ctx.lineTo(mmX + mmW - rr, mmY);
  ctx.arcTo(mmX + mmW, mmY, mmX + mmW, mmY + rr, rr);
  ctx.lineTo(mmX + mmW, mmY + mmH - rr);
  ctx.arcTo(mmX + mmW, mmY + mmH, mmX + mmW - rr, mmY + mmH, rr);
  ctx.lineTo(mmX + rr, mmY + mmH);
  ctx.arcTo(mmX, mmY + mmH, mmX, mmY + mmH - rr, rr);
  ctx.lineTo(mmX, mmY + rr);
  ctx.arcTo(mmX, mmY, mmX + rr, mmY, rr);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#444466';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Finish marker
  const finX = mmX + mmW - 6;
  ctx.strokeStyle = '#ffdd44';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(finX, mmY + 4); ctx.lineTo(finX, mmY + mmH - 4); ctx.stroke();

  // Dragon dots
  gs.dragons.forEach(d => {
    const px = mmX + (d.distance / FINISH_X) * (mmW - 12) + 6;
    const py = mmY + mmH / 2;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    if (d.boosted) {
      ctx.strokeStyle = '#44ffdd';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

// ── Game loop ─────────────────────────────────
function gameLoop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = ts;

  update(dt);
  draw();
  updateHUD();

  if (!gameState.over) {
    animId = requestAnimationFrame(gameLoop);
  }
}

// ── Win screen ────────────────────────────────
function showWinScreen() {
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('win-screen').classList.remove('hidden');

  const sorted = [...gameState.dragons].sort((a, b) => a.place - b.place);
  const winner = sorted[0];
  const winnerEl = document.getElementById('winner-text');
  const subEl    = document.getElementById('winner-sub');

  winnerEl.textContent = `${winner.emoji} ${winner.name} WINS!`;
  winnerEl.style.color = winner.color;

  const placeTxt = sorted.map(d => `${d.place === 1 ? '🥇' : d.place === 2 ? '🥈' : '🥉'} ${d.name}: ${(d.finishTime/1000).toFixed(2)}s`).join('   ');
  subEl.textContent = placeTxt;

  document.onkeydown = null;
  document.onkeyup   = null;
}
