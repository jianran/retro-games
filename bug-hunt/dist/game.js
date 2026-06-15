"use strict";
const W = 800;
const H = 600;
const PSPD = 5;
const state = {
    score: 0,
    gems: 0,
    hearts: 3,
    lives: 3,
    power: 1,
    running: false,
};
const keys = {};
let canShoot = true;
let bugTimer = 1000;
let gemTimer = 1500;
let heartTimer = 8000;
let bombLastUsedScore = -50;
let sprayCount = 0;
let sprayTimer = 0;
const SPRAY_INTERVAL = 60000;
const SPRAY_MAX = 3;
let ouraActive = false;
let ouraTimeout = null;
let boss = null;
let bossSpawned = false;
let boss2 = null;
let boss2Spawned = false;
let chainSlams = [];
let boss3 = null;
let boss3Spawned = false;
let vexarShots = [];
let boss4 = null;
let boss4Spawned = false;
let novaShots = [];
let boss5 = null;
let boss5Spawned = false;
let homingShots = [];
let lastTs = 0;
let animId = 0;
let px = W / 2 - 30;
let py = H - 90;
let bullets = [];
let bugArr = [];
let gemArr = [];
let heartArr = [];
let particles = [];
const $area = document.getElementById('game-area');
const $player = document.getElementById('player');
const $score = document.getElementById('score');
const $gems = document.getElementById('gems-display');
const $power = document.getElementById('power-display');
const $lives = document.getElementById('lives-display');
const $ov = document.getElementById('overlay');
const $ovTit = document.getElementById('overlay-title');
const $ovSub = document.getElementById('overlay-sub');
const $ovSc = document.getElementById('final-score');
const $btn = document.getElementById('action-btn');
const $bomb = document.getElementById('bomb-display');
const $spray = document.getElementById('spray-display');
const $bossBar = document.getElementById('boss-bar');
const $bossName = document.getElementById('boss-name');
const $bossFill = document.getElementById('boss-bar-fill');
function mkEl(cls, x, y, w, h, txt = '') {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = txt;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    $area.appendChild(el);
    return el;
}
function kill(e) {
    e.dead = true;
    e.el.remove();
}
function syncPos(e) {
    e.el.style.left = `${e.x}px`;
    e.el.style.top = `${e.y}px`;
}
function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
        a.y < b.y + b.h && a.y + a.h > b.y;
}
function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.style.cssText =
            `position:absolute;width:6px;height:6px;border-radius:50%;` +
                `background:${color};left:${x}px;top:${y}px;pointer-events:none;z-index:30;`;
        $area.appendChild(el);
        particles.push({
            el, x, y, w: 6, h: 6, dead: false, life: 1,
            vx: (Math.random() - 0.5) * 9,
            vy: (Math.random() - 0.5) * 9 - 2,
        });
    }
}
function shoot() {
    if (!canShoot)
        return;
    canShoot = false;
    const p = state.power;
    const cx = px + 30;
    function addB(vx, vy, ox) {
        const bw = p === 4 ? 10 : 6;
        const bx = cx + ox - bw / 2;
        bullets.push({
            el: mkEl(`bullet pwr${p}`, bx, py, bw, 22),
            x: bx, y: py, w: bw, h: 22, dead: false, vx, vy,
        });
    }
    const patterns = [
        [[0, -12, 0]],
        [[0, -11, -13], [0, -11, 13]],
        [[-1.3, -10.5, -19], [0, -12, 0], [1.3, -10.5, 19]],
        [[-2.6, -9, -30], [-1, -11, -15], [0, -12, 0], [1, -11, 15], [2.6, -9, 30]],
    ];
    patterns[p - 1].forEach(([vx, vy, ox]) => addB(vx, vy, ox));
    const cooldown = [300, 250, 200, 155][p - 1];
    setTimeout(() => { canShoot = true; }, cooldown);
}
function deactivateOura() {
    ouraActive = false;
    ouraTimeout = null;
    $player.classList.remove('oura');
}
function activateOura() {
    ouraActive = true;
    $player.classList.add('oura');
    if (ouraTimeout !== null)
        clearTimeout(ouraTimeout);
    ouraTimeout = setTimeout(deactivateOura, 6000);
}
function useBomb() {
    if (!state.running)
        return;
    if (state.score - bombLastUsedScore < 50)
        return;
    bombLastUsedScore = state.score;
    for (const bug of bugArr) {
        if (bug.dead)
            continue;
        burst(bug.x + 20, bug.y + 20, bug.color, 20);
        state.score += bug.pts;
        kill(bug);
    }
    const activeBoss = boss ?? boss2 ?? boss3 ?? boss4 ?? boss5 ?? null;
    if (activeBoss && !activeBoss.dead) {
        activeBoss.hp -= 10;
        activeBoss.el.style.filter = 'brightness(6)';
        setTimeout(() => { if (!activeBoss.dead)
            activeBoss.el.style.filter = ''; }, 150);
        if (activeBoss.hp <= 0) {
            if (activeBoss === boss)
                killBoss();
            else if (activeBoss === boss2)
                killBoss2();
            else if (activeBoss === boss3)
                killBoss3();
            else if (activeBoss === boss4)
                killBoss4();
            else if (activeBoss === boss5)
                killBoss5();
        }
        else {
            updateBossBar();
        }
    }
    const flash = document.createElement('div');
    flash.style.cssText =
        'position:absolute;inset:0;background:rgba(255,180,0,0.72);z-index:50;' +
            'pointer-events:none;transition:opacity 0.45s ease-out;';
    $area.appendChild(flash);
    requestAnimationFrame(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 500);
    });
    updateHUD();
}
function useSpray() {
    if (!state.running || sprayCount <= 0)
        return;
    sprayCount--;
    for (const bug of bugArr) {
        if (bug.dead || bug.cls !== 'mosquito')
            continue;
        burst(bug.x + 20, bug.y + 20, '#99ffcc', 14);
        kill(bug);
    }
    state.score += 100;
    const flash = document.createElement('div');
    flash.style.cssText =
        'position:absolute;inset:0;background:rgba(80,255,160,0.38);z-index:50;' +
            'pointer-events:none;transition:opacity 0.5s ease-out;';
    $area.appendChild(flash);
    requestAnimationFrame(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 550);
    });
    updateHUD();
}
function weightedPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0)
            return items[i];
    }
    return items[items.length - 1];
}
function spawnBug() {
    const cfgs = [
        { emoji: '🪰', cls: 'fly', hp: 1, spd: 2.2, pts: 2, zig: false, color: '#88ff66' },
        { emoji: '🐞', cls: 'beetle', hp: 2, spd: 1.0, pts: 4, zig: false, color: '#ff6688' },
        { emoji: '🐝', cls: 'wasp', hp: 3, spd: 3.0, pts: 8, zig: true, color: '#ffbb00' },
        { emoji: '🦟', cls: 'mosquito', hp: 1, spd: 2.6, pts: 3, zig: true, color: '#99ffcc' },
    ];
    const cfg = weightedPick(cfgs, [5, 3, 2, 3]);
    const x = Math.random() * (W - 40);
    const el = mkEl(`bug bug-${cfg.cls}`, x, -50, 40, 40, cfg.emoji);
    bugArr.push({
        el, x, y: -50, w: 40, h: 40, dead: false,
        hp: cfg.hp,
        spd: cfg.spd + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 2,
        wob: Math.random() * Math.PI * 2,
        zig: cfg.zig,
        pts: cfg.pts,
        color: cfg.color,
        cls: cfg.cls,
    });
}
function spawnGem() {
    const cfgs = [
        { emoji: '💙', val: 1, size: 26, spd: 1.8 },
        { emoji: '💎', val: 3, size: 28, spd: 1.4 },
        { emoji: '⭐', val: 10, size: 32, spd: 1.0 },
    ];
    const cfg = weightedPick(cfgs, [6, 3, 1]);
    const x = Math.random() * (W - cfg.size);
    const el = mkEl(`gem gv${cfg.val}`, x, -60, cfg.size, cfg.size, cfg.emoji);
    el.style.fontSize = `${cfg.size - 2}px`;
    gemArr.push({
        el, x, y: -60, w: cfg.size, h: cfg.size, dead: false,
        val: cfg.val,
        spd: cfg.spd + Math.random() * 0.5,
    });
}
function spawnHeart() {
    const x = Math.random() * (W - 32);
    const el = mkEl('heart-pickup', x, -50, 32, 32, '❤️');
    el.style.fontSize = '28px';
    heartArr.push({
        el, x, y: -50, w: 32, h: 32, dead: false,
        spd: 1.2 + Math.random() * 0.4,
    });
}
function updateBossBar() {
    const b = boss ?? boss2 ?? boss3 ?? boss4 ?? boss5;
    if (!b)
        return;
    $bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
}
function killBoss() {
    if (!boss)
        return;
    const b = boss;
    boss = null;
    kill(b);
    for (let i = 0; i < 6; i++) {
        setTimeout(() => {
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#ff6600', 18);
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#ffdd00', 10);
        }, i * 130);
    }
    state.score += 50;
    $bossBar.classList.add('hidden');
    updateHUD();
}
function spawnBoss() {
    const size = 100;
    const x = W / 2 - size / 2;
    const el = mkEl('boss', x, -size - 10, size, size, '🐢');
    boss = {
        el, x, y: -size - 10, w: size, h: size, dead: false,
        hp: 60, maxHp: 60,
        vx: 0.6, vy: 0.5,
        targetY: 80,
    };
    $bossName.textContent = '🐢  K O L O';
    $bossBar.classList.remove('hidden');
    updateBossBar();
}
function spawnBoss2() {
    const size = 86;
    const x = W / 2 - size / 2;
    const el = mkEl('boss boss2', x, -size - 10, size, size, '☠️');
    boss2 = {
        el, x, y: -size - 10, w: size, h: size, dead: false,
        hp: 40, maxHp: 40,
        vx: 1.4, vy: 0.7,
        targetY: 90,
        slamCount: 0,
        slamTimer: 2800,
        resting: false,
    };
    $bossName.textContent = '☠️  K O R D A K';
    $bossBar.classList.remove('hidden');
    updateBossBar();
}
function killBoss2() {
    if (!boss2)
        return;
    const b = boss2;
    boss2 = null;
    kill(b);
    for (let i = 0; i < 8; i++) {
        setTimeout(() => {
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#5566ff', 18);
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#aaccff', 10);
        }, i * 110);
    }
    state.score += 100;
    $bossBar.classList.add('hidden');
    for (const cs of chainSlams)
        if (!cs.dead)
            kill(cs);
    chainSlams = [];
    updateHUD();
}
function fireChainSlam() {
    if (!boss2 || boss2.dead)
        return;
    const bx = boss2.x + boss2.w / 2;
    const by = boss2.y + boss2.h * 0.75;
    const dx = (px + 30) - bx;
    const dy = (py + 30) - by;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 5;
    const el = mkEl('chain-slam', bx - 16, by - 16, 32, 32, '⛓️');
    chainSlams.push({
        el, x: bx - 16, y: by - 16, w: 32, h: 32, dead: false,
        vx: (dx / dist) * speed,
        vy: (dy / dist) * speed,
    });
}
function spawnBoss3() {
    const size = 80;
    const x = W / 2 - size / 2;
    const el = mkEl('boss boss3', x, -size - 10, size, size, '👾');
    boss3 = {
        el, x, y: -size - 10, w: size, h: size, dead: false,
        hp: 50, maxHp: 50,
        vx: 2.4, vy: 2.0,
        minY: 55, maxY: 210,
        shootTimer: 2000,
        descended: false,
    };
    $bossName.textContent = '👾  V E X A R';
    $bossBar.classList.remove('hidden');
    updateBossBar();
}
function killBoss3() {
    if (!boss3)
        return;
    const b = boss3;
    boss3 = null;
    kill(b);
    for (let i = 0; i < 9; i++) {
        setTimeout(() => {
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#00ff88', 18);
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#88ff00', 10);
        }, i * 100);
    }
    state.score += 150;
    $bossBar.classList.add('hidden');
    for (const s of vexarShots)
        if (!s.dead)
            kill(s);
    vexarShots = [];
    updateHUD();
}
function fireVexarShots() {
    if (!boss3 || boss3.dead)
        return;
    const bx = boss3.x + boss3.w / 2;
    const by = boss3.y + boss3.h * 0.8;
    const dx = (px + 30) - bx;
    const dy = (py + 30) - by;
    const baseAngle = Math.atan2(dy, dx);
    const spread = Math.PI / 6;
    const speed = 6;
    for (let i = -1; i <= 1; i++) {
        const a = baseAngle + i * spread;
        const el = mkEl('vexar-shot', bx - 8, by - 8, 16, 16, '');
        vexarShots.push({
            el, x: bx - 8, y: by - 8, w: 16, h: 16, dead: false,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
        });
    }
}
function spawnBoss4() {
    const size = 88;
    const x = W / 2 - size / 2;
    const el = mkEl('boss boss4', x, -size - 10, size, size, '🔥');
    boss4 = {
        el, x, y: -size - 10, w: size, h: size, dead: false,
        hp: 65, maxHp: 65,
        vx: 2.8, vy: 2.2,
        minY: 45, maxY: 250,
        novaTimer: 2600,
        novaCharging: false,
    };
    $bossName.textContent = '🔥  P Y R A X';
    $bossBar.classList.remove('hidden');
    updateBossBar();
}
function killBoss4() {
    if (!boss4)
        return;
    const b = boss4;
    boss4 = null;
    kill(b);
    for (let i = 0; i < 10; i++) {
        setTimeout(() => {
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#ff6600', 20);
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#ffdd00', 12);
        }, i * 90);
    }
    state.score += 180;
    $bossBar.classList.add('hidden');
    for (const s of novaShots)
        if (!s.dead)
            kill(s);
    novaShots = [];
    updateHUD();
}
function fireNova() {
    if (!boss4 || boss4.dead)
        return;
    const bx = boss4.x + boss4.w / 2;
    const by = boss4.y + boss4.h / 2;
    const speed = 5.5;
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const el = mkEl('nova-shot', bx - 10, by - 10, 20, 20, '');
        novaShots.push({
            el, x: bx - 10, y: by - 10, w: 20, h: 20, dead: false,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
        });
    }
}
function spawnBoss5() {
    const size = 92;
    const x = W / 2 - size / 2;
    const el = mkEl('boss boss5', x, -size - 10, size, size, '🕷️');
    boss5 = {
        el, x, y: -size - 10, w: size, h: size, dead: false,
        hp: 80, maxHp: 80,
        targetY: 60,
        wob: 0,
        shootTimer: 3000,
        descended: false,
    };
    $bossName.textContent = '🕷️  A R A C H N I S';
    $bossBar.classList.remove('hidden');
    updateBossBar();
}
function killBoss5() {
    if (!boss5)
        return;
    const b = boss5;
    boss5 = null;
    kill(b);
    for (let i = 0; i < 12; i++) {
        setTimeout(() => {
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#aa44ff', 20);
            burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#ffffff', 8);
        }, i * 80);
    }
    state.score += 220;
    $bossBar.classList.add('hidden');
    for (const s of homingShots)
        if (!s.dead)
            kill(s);
    homingShots = [];
    updateHUD();
}
function fireHomingShots() {
    if (!boss5 || boss5.dead)
        return;
    const bx = boss5.x + boss5.w / 2;
    const by = boss5.y + boss5.h;
    const speed = 3.5;
    for (let i = -1; i <= 1; i++) {
        const dx = (px + 30) - bx + i * 60;
        const dy = (py + 30) - by;
        const dist = Math.hypot(dx, dy) || 1;
        const el = mkEl('homing-shot', bx - 11, by - 11, 22, 22, '');
        homingShots.push({
            el, x: bx - 11, y: by - 11, w: 22, h: 22, dead: false,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
        });
    }
}
function updateHUD() {
    $score.textContent = `Score: ${state.score}`;
    $gems.textContent = `💎 ${state.gems}`;
    $power.textContent = `Power: ${'★'.repeat(state.power)}${'☆'.repeat(4 - state.power)}`;
    $lives.textContent =
        '❤️'.repeat(state.hearts) + '🖤'.repeat(Math.max(0, 3 - state.hearts)) +
            '  ' +
            '🌟'.repeat(state.lives) + '☆'.repeat(Math.max(0, 3 - state.lives));
    const pts = state.score - bombLastUsedScore;
    if (pts >= 50) {
        $bomb.textContent = '💣 READY';
        $bomb.classList.add('ready');
    }
    else {
        $bomb.textContent = `💣 +${50 - pts}`;
        $bomb.classList.remove('ready');
    }
    if (sprayCount > 0) {
        $spray.textContent = `🦟💨 x${sprayCount}`;
        $spray.classList.add('ready');
    }
    else {
        const secs = Math.ceil((SPRAY_INTERVAL - sprayTimer) / 1000);
        $spray.textContent = `🦟💨 ${secs}s`;
        $spray.classList.remove('ready');
    }
}
function updatePower() {
    const prev = state.power;
    const g = state.gems;
    state.power = g >= 50 ? 4 : g >= 25 ? 3 : g >= 10 ? 2 : 1;
    if (state.power !== prev) {
        $player.className = `plane pwr${state.power}`;
        $player.style.filter = 'brightness(5) saturate(3)';
        setTimeout(() => { $player.style.filter = ''; }, 220);
    }
}
function loseHeart() {
    if (!state.running)
        return;
    state.hearts--;
    if (state.hearts <= 0) {
        state.lives--;
        if (state.lives <= 0) {
            gameOver();
            return;
        }
        state.hearts = 3;
    }
    $player.classList.add('inv');
    setTimeout(() => $player.classList.remove('inv'), 1800);
    updateHUD();
}
function gameOver() {
    state.running = false;
    cancelAnimationFrame(animId);
    $ovTit.textContent = 'Game Over';
    $ovSub.textContent = '';
    $ovSc.textContent = `Final Score: ${state.score}`;
    $btn.textContent = 'Play Again';
    $ov.classList.remove('hidden');
}
function loop(ts) {
    if (!state.running)
        return;
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;
    if (keys['ArrowLeft'] || keys['a'])
        px = Math.max(0, px - PSPD);
    if (keys['ArrowRight'] || keys['d'])
        px = Math.min(W - 60, px + PSPD);
    if (keys['ArrowUp'] || keys['w'])
        py = Math.max(0, py - PSPD);
    if (keys['ArrowDown'] || keys['s'])
        py = Math.min(H - 60, py + PSPD);
    if (keys[' '])
        shoot();
    $player.style.left = `${px}px`;
    $player.style.top = `${py}px`;
    bugTimer -= dt;
    gemTimer -= dt;
    heartTimer -= dt;
    if (bugTimer <= 0) {
        spawnBug();
        bugTimer = Math.max(350, 1600 - state.score * 1.5);
    }
    if (gemTimer <= 0) {
        spawnGem();
        gemTimer = 1600 + Math.random() * 1400;
    }
    if (heartTimer <= 0) {
        spawnHeart();
        heartTimer = 10000 + Math.random() * 8000;
    }
    if (sprayCount < SPRAY_MAX) {
        sprayTimer += dt;
        if (sprayTimer >= SPRAY_INTERVAL) {
            sprayTimer -= SPRAY_INTERVAL;
            sprayCount++;
            updateHUD();
        }
    }
    if (!bossSpawned && state.score >= 100) {
        bossSpawned = true;
        spawnBoss();
    }
    if (!boss2Spawned && state.score >= 200) {
        boss2Spawned = true;
        spawnBoss2();
    }
    if (!boss3Spawned && state.score >= 300) {
        boss3Spawned = true;
        spawnBoss3();
    }
    if (!boss4Spawned && state.score >= 400) {
        boss4Spawned = true;
        spawnBoss4();
    }
    if (!boss5Spawned && state.score >= 500) {
        boss5Spawned = true;
        spawnBoss5();
    }
    const ph = { el: $player, x: px + 12, y: py + 14, w: 36, h: 30, dead: false };
    for (const b of bullets) {
        if (b.dead)
            continue;
        b.x += b.vx;
        b.y += b.vy;
        syncPos(b);
        if (b.y < -30 || b.x < -30 || b.x > W + 30)
            kill(b);
    }
    for (const bug of bugArr) {
        if (bug.dead)
            continue;
        for (const bl of bullets) {
            if (bl.dead || bug.dead)
                continue;
            if (overlaps(bl, bug)) {
                kill(bl);
                bug.hp--;
                if (bug.hp > 0) {
                    bug.el.style.filter = 'brightness(5)';
                    const ref = bug;
                    setTimeout(() => { if (!ref.dead)
                        ref.el.style.filter = ''; }, 80);
                }
                else {
                    burst(bug.x + 20, bug.y + 20, bug.color, 14);
                    state.score += bug.pts;
                    kill(bug);
                    updateHUD();
                }
            }
        }
    }
    if (boss && !boss.dead) {
        for (const bl of bullets) {
            if (bl.dead)
                continue;
            if (overlaps(bl, boss)) {
                kill(bl);
                boss.hp--;
                if (boss.hp <= 0) {
                    killBoss();
                    break;
                }
                boss.el.style.filter = 'brightness(4)';
                const b = boss;
                setTimeout(() => { if (b && !b.dead)
                    b.el.style.filter = ''; }, 80);
                updateBossBar();
            }
        }
    }
    if (boss2 && !boss2.dead) {
        for (const bl of bullets) {
            if (bl.dead)
                continue;
            if (overlaps(bl, boss2)) {
                kill(bl);
                boss2.hp--;
                if (boss2.hp <= 0) {
                    killBoss2();
                    break;
                }
                boss2.el.style.filter = 'brightness(4)';
                const b = boss2;
                setTimeout(() => { if (b && !b.dead)
                    b.el.style.filter = ''; }, 80);
                updateBossBar();
            }
        }
    }
    if (boss3 && !boss3.dead) {
        for (const bl of bullets) {
            if (bl.dead)
                continue;
            if (overlaps(bl, boss3)) {
                kill(bl);
                boss3.hp--;
                if (boss3.hp <= 0) {
                    killBoss3();
                    break;
                }
                boss3.el.style.filter = 'brightness(4)';
                const b = boss3;
                setTimeout(() => { if (b && !b.dead)
                    b.el.style.filter = ''; }, 80);
                updateBossBar();
            }
        }
    }
    if (boss4 && !boss4.dead) {
        for (const bl of bullets) {
            if (bl.dead)
                continue;
            if (overlaps(bl, boss4)) {
                kill(bl);
                boss4.hp--;
                if (boss4.hp <= 0) {
                    killBoss4();
                    break;
                }
                boss4.el.style.filter = 'brightness(4)';
                const b = boss4;
                setTimeout(() => { if (b && !b.dead)
                    b.el.style.filter = ''; }, 80);
                updateBossBar();
            }
        }
    }
    if (boss5 && !boss5.dead) {
        for (const bl of bullets) {
            if (bl.dead)
                continue;
            if (overlaps(bl, boss5)) {
                kill(bl);
                boss5.hp--;
                if (boss5.hp <= 0) {
                    killBoss5();
                    break;
                }
                boss5.el.style.filter = 'brightness(4)';
                const b = boss5;
                setTimeout(() => { if (b && !b.dead)
                    b.el.style.filter = ''; }, 80);
                updateBossBar();
            }
        }
    }
    for (const bug of bugArr) {
        if (bug.dead)
            continue;
        bug.wob += 0.05;
        bug.y += bug.spd;
        if (bug.zig) {
            bug.x += Math.sin(bug.wob) * 2.2;
        }
        else {
            bug.x += bug.vx;
            if (bug.x < 0) {
                bug.x = 0;
                bug.vx = Math.abs(bug.vx);
            }
            if (bug.x > W - 40) {
                bug.x = W - 40;
                bug.vx = -Math.abs(bug.vx);
            }
        }
        syncPos(bug);
        if (bug.y > H + 10) {
            kill(bug);
            loseHeart();
            continue;
        }
        if (!$player.classList.contains('inv') && overlaps(bug, ph)) {
            if (ouraActive) {
                burst(bug.x + 20, bug.y + 20, bug.color, 20);
                state.score += bug.pts;
                kill(bug);
                updateHUD();
            }
            else if (bug.cls === 'beetle') {
                activateOura();
                kill(bug);
            }
            else {
                burst(bug.x + 20, bug.y + 20, '#ff4444', 10);
                kill(bug);
                loseHeart();
            }
        }
    }
    if (boss && !boss.dead) {
        if (boss.y < boss.targetY)
            boss.y += boss.vy;
        boss.x += boss.vx;
        if (boss.x < 0) {
            boss.x = 0;
            boss.vx = Math.abs(boss.vx);
        }
        if (boss.x > W - boss.w) {
            boss.x = W - boss.w;
            boss.vx = -Math.abs(boss.vx);
        }
        syncPos(boss);
        if (!$player.classList.contains('inv') && overlaps(boss, ph)) {
            loseHeart();
        }
    }
    if (boss2 && !boss2.dead) {
        if (boss2.y < boss2.targetY)
            boss2.y += boss2.vy;
        boss2.x += boss2.vx;
        if (boss2.x < 0) {
            boss2.x = 0;
            boss2.vx = Math.abs(boss2.vx);
        }
        if (boss2.x > W - boss2.w) {
            boss2.x = W - boss2.w;
            boss2.vx = -Math.abs(boss2.vx);
        }
        syncPos(boss2);
        if (boss2.y >= boss2.targetY - 5) {
            boss2.slamTimer -= dt;
            if (boss2.slamTimer <= 0) {
                if (boss2.resting) {
                    boss2.resting = false;
                    boss2.slamCount = 0;
                    boss2.el.classList.remove('kordak-rest');
                    boss2.slamTimer = 600;
                }
                else {
                    fireChainSlam();
                    boss2.slamCount++;
                    if (boss2.slamCount >= 3) {
                        boss2.resting = true;
                        boss2.el.classList.add('kordak-rest');
                        boss2.slamTimer = 2200;
                    }
                    else {
                        boss2.slamTimer = 720;
                    }
                }
            }
        }
        if (!$player.classList.contains('inv') && overlaps(boss2, ph)) {
            loseHeart();
        }
    }
    if (boss3 && !boss3.dead) {
        if (!boss3.descended) {
            boss3.y += 1.8;
            if (boss3.y >= boss3.minY)
                boss3.descended = true;
        }
        else {
            boss3.x += boss3.vx;
            boss3.y += boss3.vy;
            if (boss3.x < 0) {
                boss3.x = 0;
                boss3.vx = Math.abs(boss3.vx);
            }
            if (boss3.x > W - boss3.w) {
                boss3.x = W - boss3.w;
                boss3.vx = -Math.abs(boss3.vx);
            }
            if (boss3.y < boss3.minY) {
                boss3.y = boss3.minY;
                boss3.vy = Math.abs(boss3.vy);
            }
            if (boss3.y > boss3.maxY) {
                boss3.y = boss3.maxY;
                boss3.vy = -Math.abs(boss3.vy);
            }
            boss3.shootTimer -= dt;
            if (boss3.shootTimer <= 0) {
                fireVexarShots();
                boss3.shootTimer = 2000 + Math.random() * 900;
            }
        }
        syncPos(boss3);
        if (!$player.classList.contains('inv') && overlaps(boss3, ph)) {
            loseHeart();
        }
    }
    for (const s of vexarShots) {
        if (s.dead)
            continue;
        s.x += s.vx;
        s.y += s.vy;
        syncPos(s);
        if (s.y > H + 20 || s.x < -30 || s.x > W + 30 || s.y < -30) {
            kill(s);
            continue;
        }
        if (!$player.classList.contains('inv') && overlaps(s, ph)) {
            burst(s.x + 8, s.y + 8, '#00ff88', 12);
            kill(s);
            loseHeart();
        }
    }
    if (boss4 && !boss4.dead) {
        if (boss4.y < boss4.minY) {
            boss4.y += 2.0;
        }
        else {
            boss4.x += boss4.vx;
            boss4.y += boss4.vy;
            if (boss4.x < 0) {
                boss4.x = 0;
                boss4.vx = Math.abs(boss4.vx);
            }
            if (boss4.x > W - boss4.w) {
                boss4.x = W - boss4.w;
                boss4.vx = -Math.abs(boss4.vx);
            }
            if (boss4.y < boss4.minY) {
                boss4.y = boss4.minY;
                boss4.vy = Math.abs(boss4.vy);
            }
            if (boss4.y > boss4.maxY) {
                boss4.y = boss4.maxY;
                boss4.vy = -Math.abs(boss4.vy);
            }
            boss4.novaTimer -= dt;
            if (boss4.novaTimer <= 400 && !boss4.novaCharging) {
                boss4.novaCharging = true;
                boss4.el.classList.add('pyrax-charging');
            }
            if (boss4.novaTimer <= 0) {
                fireNova();
                boss4.novaTimer = 2400 + Math.random() * 1000;
                boss4.novaCharging = false;
                boss4.el.classList.remove('pyrax-charging');
            }
        }
        syncPos(boss4);
        if (!$player.classList.contains('inv') && overlaps(boss4, ph)) {
            loseHeart();
        }
    }
    for (const s of novaShots) {
        if (s.dead)
            continue;
        s.x += s.vx;
        s.y += s.vy;
        syncPos(s);
        if (s.y > H + 30 || s.x < -40 || s.x > W + 40 || s.y < -40) {
            kill(s);
            continue;
        }
        if (!$player.classList.contains('inv') && overlaps(s, ph)) {
            burst(s.x + 10, s.y + 10, '#ff6600', 14);
            kill(s);
            loseHeart();
        }
    }
    if (boss5 && !boss5.dead) {
        if (!boss5.descended) {
            boss5.y += 1.4;
            if (boss5.y >= boss5.targetY)
                boss5.descended = true;
        }
        else {
            boss5.wob += 0.012;
            boss5.x = W / 2 - boss5.w / 2 + Math.sin(boss5.wob) * (W / 2 - boss5.w / 2 - 10);
            boss5.y = boss5.targetY + Math.sin(boss5.wob * 0.6) * 18;
            boss5.shootTimer -= dt;
            if (boss5.shootTimer <= 0) {
                fireHomingShots();
                boss5.shootTimer = 3200 + Math.random() * 800;
            }
        }
        syncPos(boss5);
        if (!$player.classList.contains('inv') && overlaps(boss5, ph)) {
            loseHeart();
        }
    }
    for (const s of homingShots) {
        if (s.dead)
            continue;
        const dx = (px + 30) - (s.x + 11);
        const dy = (py + 30) - (s.y + 11);
        const dist = Math.hypot(dx, dy) || 1;
        s.vx += (dx / dist) * 0.10;
        s.vy += (dy / dist) * 0.10;
        const spd = Math.hypot(s.vx, s.vy);
        if (spd > 4.5) {
            s.vx = (s.vx / spd) * 4.5;
            s.vy = (s.vy / spd) * 4.5;
        }
        s.x += s.vx;
        s.y += s.vy;
        syncPos(s);
        if (s.y > H + 30 || s.x < -50 || s.x > W + 50 || s.y < -80) {
            kill(s);
            continue;
        }
        if (!$player.classList.contains('inv') && overlaps(s, ph)) {
            burst(s.x + 11, s.y + 11, '#aa44ff', 14);
            kill(s);
            loseHeart();
        }
    }
    for (const gem of gemArr) {
        if (gem.dead)
            continue;
        gem.y += gem.spd;
        syncPos(gem);
        if (gem.y > H + 10) {
            kill(gem);
            continue;
        }
        if (overlaps(gem, ph)) {
            const colMap = { 1: '#44aaff', 3: '#aa44ff', 10: '#ffdd00' };
            burst(gem.x + gem.w / 2, gem.y + gem.h / 2, colMap[gem.val] ?? '#fff', gem.val * 3 + 4);
            state.gems += gem.val;
            state.score += 10;
            kill(gem);
            updatePower();
            updateHUD();
        }
    }
    for (const h of heartArr) {
        if (h.dead)
            continue;
        h.y += h.spd;
        syncPos(h);
        if (h.y > H + 10) {
            kill(h);
            continue;
        }
        if (overlaps(h, ph)) {
            burst(h.x + h.w / 2, h.y + h.h / 2, '#ff4488', 12);
            state.hearts = Math.min(3, state.hearts + 1);
            kill(h);
            updateHUD();
        }
    }
    for (const cs of chainSlams) {
        if (cs.dead)
            continue;
        cs.x += cs.vx;
        cs.y += cs.vy;
        syncPos(cs);
        if (cs.y > H + 30 || cs.x < -50 || cs.x > W + 50 || cs.y < -50) {
            kill(cs);
            continue;
        }
        if (!$player.classList.contains('inv') && overlaps(cs, ph)) {
            burst(cs.x + 16, cs.y + 16, '#7777ff', 18);
            kill(cs);
            loseHeart();
            loseHeart();
        }
    }
    for (const p of particles) {
        if (p.dead)
            continue;
        p.life -= 0.05;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.91;
        p.vy *= 0.91;
        p.el.style.left = `${p.x}px`;
        p.el.style.top = `${p.y}px`;
        p.el.style.opacity = `${p.life}`;
        p.el.style.transform = `scale(${Math.max(0.01, p.life)})`;
        if (p.life <= 0)
            kill(p);
    }
    bullets = bullets.filter(b => !b.dead);
    bugArr = bugArr.filter(b => !b.dead);
    gemArr = gemArr.filter(g => !g.dead);
    heartArr = heartArr.filter(h => !h.dead);
    chainSlams = chainSlams.filter(c => !c.dead);
    vexarShots = vexarShots.filter(s => !s.dead);
    novaShots = novaShots.filter(s => !s.dead);
    homingShots = homingShots.filter(s => !s.dead);
    particles = particles.filter(p => !p.dead);
    animId = requestAnimationFrame(loop);
}
function startGame() {
    if (boss) {
        kill(boss);
        boss = null;
    }
    if (boss2) {
        kill(boss2);
        boss2 = null;
    }
    if (boss3) {
        kill(boss3);
        boss3 = null;
    }
    if (boss4) {
        kill(boss4);
        boss4 = null;
    }
    if (boss5) {
        kill(boss5);
        boss5 = null;
    }
    $bossBar.classList.add('hidden');
    bossSpawned = false;
    boss2Spawned = false;
    boss3Spawned = false;
    boss4Spawned = false;
    boss5Spawned = false;
    for (const cs of chainSlams)
        if (!cs.dead)
            cs.el.remove();
    chainSlams = [];
    for (const s of vexarShots)
        if (!s.dead)
            s.el.remove();
    vexarShots = [];
    for (const s of novaShots)
        if (!s.dead)
            s.el.remove();
    novaShots = [];
    for (const s of homingShots)
        if (!s.dead)
            s.el.remove();
    homingShots = [];
    [...bullets, ...bugArr, ...gemArr, ...heartArr, ...particles]
        .forEach(e => { if (!e.dead)
        e.el.remove(); });
    bullets = [];
    bugArr = [];
    gemArr = [];
    heartArr = [];
    particles = [];
    state.score = 0;
    state.gems = 0;
    state.hearts = 3;
    state.lives = 3;
    state.power = 1;
    state.running = true;
    px = W / 2 - 30;
    py = H - 90;
    canShoot = true;
    bugTimer = 1000;
    gemTimer = 1500;
    heartTimer = 8000;
    bombLastUsedScore = -50;
    sprayCount = 0;
    sprayTimer = 0;
    $player.className = 'plane pwr1';
    $player.style.left = `${px}px`;
    $player.style.top = `${py}px`;
    $player.style.filter = '';
    $player.classList.remove('inv');
    if (ouraTimeout !== null) {
        clearTimeout(ouraTimeout);
        ouraTimeout = null;
    }
    ouraActive = false;
    $player.classList.remove('oura');
    $ov.classList.add('hidden');
    updateHUD();
    lastTs = performance.now();
    animId = requestAnimationFrame(loop);
}
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ')
        e.preventDefault();
    if (e.key === 'b' || e.key === 'B')
        useBomb();
    if (e.key === 'm' || e.key === 'M')
        useSpray();
});
document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});
$btn.addEventListener('click', startGame);
