/* ═══════════════════════════════════════════════════════════════════════════
 *
 *   AGAR · RETRO EDITION
 *   ─────────────────────
 *   Core Game Logic
 *
 *   Gameplay loop, physics, bot AI, screen flow, render engine.
 *   Audio delegat către sounds.js (modulul Sfx).
 *
 *   @module  Game
 *   @version 1.1.0
 *
 * ═══════════════════════════════════════════════════════════════════════════ */


/* ───────────────────────────────────────────────────────────────────────────
 *  CONSTANTS & CONFIGURATION
 * ─────────────────────────────────────────────────────────────────────────── */

const WORLD = { w: 5000, h: 5000 };
const START_MASS = 100;
const MERGE_COOLDOWN = 120;
const BOT_NAMES = ['Cell', 'Blob', 'Virus', 'Nova', 'Pixel', 'Dot', 'Orb', 'Morphe', 'Zap', 'Neo', 'Alpha', 'Beta', 'Omega', 'Flux', 'Prism', 'Echo', 'Spark', 'Nebula', 'Comet', 'Ion', 'Quark', 'Proton', 'Atom', 'Nucleus', 'Plasma'];
const COLORS = ['#ff0055','#00e5ff','#39ff14','#ffb000','#ff44ff','#0088ff','#ff8800','#00ff88','#ff0088','#8800ff','#ffff00','#00ffff'];

const settings = {
    zoomOut: 0.72,
    cameraLerp: 0.09,
    zoomLerp: 0.07,
    botCount: 25,
    foodCount: 800,
    scanlines: true,
    fullscreen: false,
    playerColor: '#39ff14',
    sounds: true,
    soundVolume: 0.65
};

let PLAYER_COLOR = settings.playerColor;

const massToRadius = m => Math.sqrt(m) * 6;


/* ───────────────────────────────────────────────────────────────────────────
 *  PHYSICS & COLLISION
 * ─────────────────────────────────────────────────────────────────────────── */

/** Viteză de deplasare — normalizată la 60 fps */
function moveSpeed(mass) {
    return Math.max(0.5, 8 * Math.pow(mass, -0.22));
}

function canEat(eater, eaten) {
    if (eater === eaten) return false;
    if (eater.ownerId && eaten.ownerId && eater.ownerId === eaten.ownerId) return false;
    if (eater.mass <= eaten.mass * 1.25) return false;

    const rE = massToRadius(eater.mass);
    const rS = massToRadius(eaten.mass);
    const d = dist(eater, eaten);
    return d < rE - rS * 0.85;
}

function botVision(mass) {
    return 350 + massToRadius(mass) * 4.5;
}

function getOwnedCells(ownerId) {
    return state.cells.filter(c => c.alive && c.ownerId === ownerId);
}

function getOwnerMassCentroid(cells) {
    if (!cells.length) return { x: 0, y: 0 };
    let mx = 0, my = 0, mass = 0;
    cells.forEach(c => { mx += c.x * c.mass; my += c.y * c.mass; mass += c.mass; });
    return { x: mx / mass, y: my / mass };
}

function getMergeAnchor(cells) {
    return cells.reduce((best, c) => (c.mass > best.mass ? c : best), cells[0]);
}

function isMergeKeyHeld() {
    return !!(state.keys.ShiftLeft || state.keys.ShiftRight || state.mergeHeld);
}

function canMergePair(a, b) {
    return a.mergeCooldown <= 0 && b.mergeCooldown <= 0;
}

function shouldBotSplit(bot, prey) {
    if (bot.mass < 72 || bot.splitCooldown > 0) return false;

    const vsPlayer = prey.isPlayer;
    const halfMass = bot.mass / 2;
    const minBotRatio = vsPlayer ? 1.15 : 1.3;
    const minHalfRatio = vsPlayer ? 1.05 : 1.12;

    if (halfMass <= prey.mass * minHalfRatio) return false;
    if (bot.mass <= prey.mass * minBotRatio) return false;

    const d = dist(bot, prey);
    const rBot = massToRadius(bot.mass);
    const rPrey = massToRadius(prey.mass);
    const eatRange = rBot - rPrey * 0.85;

    if (d <= eatRange) return false;
    if (d > rBot + rPrey * (vsPlayer ? 5.5 : 4.5)) return false;

    return true;
}

function tryBotSplit(bot, prey) {
    if (!shouldBotSplit(bot, prey)) return false;
    const d = dist(bot, prey);
    const rBot = massToRadius(bot.mass);
    const rPrey = massToRadius(prey.mass);
    const inEatRange = d <= rBot - rPrey * 0.85;
    if (inEatRange) return false;

    splitCell(bot, Math.atan2(prey.y - bot.y, prey.x - bot.x));
    return true;
}


/* ───────────────────────────────────────────────────────────────────────────
 *  CELL MECHANICS — Split · Merge · Separation
 * ─────────────────────────────────────────────────────────────────────────── */

function splitCell(cell, angle) {
    if (cell.mass < 72 || cell.splitCooldown > 0) return null;

    const newMass = cell.mass / 2;
    const r = massToRadius(newMass);
    const sep = r * 1.15;

    cell.mass = newMass;
    cell.splitCooldown = 60;
    cell.mergeCooldown = MERGE_COOLDOWN;

    cell.x -= Math.cos(angle) * sep;
    cell.y -= Math.sin(angle) * sep;
    cell.vx = -Math.cos(angle) * 10;
    cell.vy = -Math.sin(angle) * 10;

    const child = createCell(
        cell.x + Math.cos(angle) * sep * 2,
        cell.y + Math.sin(angle) * sep * 2,
        newMass, cell.name, cell.color, cell.isPlayer, cell.ownerId
    );
    child.vx = Math.cos(angle) * 14;
    child.vy = Math.sin(angle) * 14;
    child.splitCooldown = 60;
    child.mergeCooldown = MERGE_COOLDOWN;
    if (cell.personality) child.personality = { ...cell.personality };
    state.cells.push(child);
    if (cell.isPlayer) Sfx.play('split');
    return child;
}

function applyMergeAttraction(dt, playerMerging = false) {
    const groups = {};
    state.cells.filter(c => c.alive).forEach(c => {
        const id = c.ownerId || (c.isPlayer ? 'player' : c.name);
        (groups[id] ||= []).push(c);
    });

    for (const id in groups) {
        if (id === 'player' && !playerMerging) continue;

        const cells = groups[id];
        if (cells.length < 2) continue;
        const anchor = getMergeAnchor(cells);
        const boost = id === 'player' && playerMerging;
        const pullMul = boost ? 0.55 : 0.22;

        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                const a = cells[i], b = cells[j];
                if (!canMergePair(a, b)) continue;
                const d = dist(a, b) || 1;
                const pull = pullMul * dt;
                a.vx += (b.x - a.x) / d * pull;
                a.vy += (b.y - a.y) / d * pull;
                b.vx += (a.x - b.x) / d * pull;
                b.vy += (a.y - b.y) / d * pull;
            }
            const c = cells[i];
            const d = dist(c, anchor) || 1;
            const pull = (boost ? 0.45 : 0.18) * dt;
            c.vx += (anchor.x - c.x) / d * pull;
            c.vy += (anchor.y - c.y) / d * pull;
        }
    }
}

function separateOwnedCells(playerMerging = false) {
    const groups = {};
    state.cells.filter(c => c.alive).forEach(c => {
        const id = c.ownerId || (c.isPlayer ? 'player' : c.name);
        (groups[id] ||= []).push(c);
    });

    for (const id in groups) {
        const cells = groups[id];
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                const a = cells[i], b = cells[j];
                const d = dist(a, b);
                const sumR = massToRadius(a.mass) + massToRadius(b.mass);
                const minD = sumR + 4;
                const mergeDist = sumR * 0.75;
                const canMerge = canMergePair(a, b);
                const isPlayerPair = a.isPlayer && b.isPlayer;

                if (d < mergeDist && canMerge && (!isPlayerPair || playerMerging)) continue;

                if (d < minD && d > 0.01) {
                    const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;

                    if (a.mergeCooldown > 0 || b.mergeCooldown > 0 || (isPlayerPair && !playerMerging)) {
                        const push = (minD - d) * (playerMerging && isPlayerPair ? 0.25 : 0.55);
                        a.x -= nx * push;
                        a.y -= ny * push;
                        b.x += nx * push;
                        b.y += ny * push;
                        a.vx -= nx * 0.35;
                        a.vy -= ny * 0.35;
                        b.vx += nx * 0.35;
                        b.vy += ny * 0.35;
                    } else if (!isPlayerPair) {
                        const pull = 0.2;
                        a.vx += nx * pull;
                        a.vy += ny * pull;
                        b.vx -= nx * pull;
                        b.vy -= ny * pull;
                    }
                }
            }
        }
    }
}

function mergeOwnedCells(playerMerging = false) {
    const groups = {};
    state.cells.filter(c => c.alive).forEach(c => {
        const id = c.ownerId || (c.isPlayer ? 'player' : c.name);
        (groups[id] ||= []).push(c);
    });

    const dead = new Set();
    for (const id in groups) {
        if (id === 'player' && !playerMerging) continue;

        const cells = groups[id];
        if (cells.length < 2) continue;
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                const a = cells[i], b = cells[j];
                if (dead.has(a) || dead.has(b) || !a.alive || !b.alive) continue;
                if (!canMergePair(a, b)) continue;
                const d = dist(a, b);
                const mergeDist = (massToRadius(a.mass) + massToRadius(b.mass)) * 0.75;
                if (d < mergeDist) {
                    const total = a.mass + b.mass;
                    const big = a.mass >= b.mass ? a : b;
                    const small = a.mass >= b.mass ? b : a;
                    big.x = (big.x * big.mass + small.x * small.mass) / total;
                    big.y = (big.y * big.mass + small.y * small.mass) / total;
                    big.mass = total;
                    big.vx = (big.vx + small.vx) * 0.45;
                    big.vy = (big.vy + small.vy) * 0.45;
                    small.alive = false;
                    dead.add(small);
                    if (a.isPlayer || b.isPlayer) Sfx.play('merge');
                }
            }
        }
    }
    if (dead.size) state.cells = state.cells.filter(c => c.alive);
}


/* ───────────────────────────────────────────────────────────────────────────
 *  BOT AI — Decision & Movement
 * ─────────────────────────────────────────────────────────────────────────── */

function updateBotAI(bot, dt) {
    if (!bot.personality) {
        bot.personality = {
            aggression: rand(0.55, 1),
            caution: rand(0.35, 0.85),
            ambition: rand(0.5, 1),
            wanderAngle: rand(0, Math.PI * 2),
            wanderTimer: rand(40, 120)
        };
    }
    const p = bot.personality;
    p.wanderTimer -= dt;
    if (p.wanderTimer <= 0) {
        p.wanderAngle += rand(-1.2, 1.2);
        p.wanderTimer = rand(50, 140);
    }

    const vision = botVision(bot.mass);
    let bestPrey = null, bestPreyScore = 0;
    let bestFood = null, bestFoodScore = 0;
    let fleeX = 0, fleeY = 0, fleeWeight = 0;

    for (const other of state.cells) {
        if (other === bot || !other.alive || other.ownerId === bot.ownerId) continue;
        const d = dist(bot, other);
        if (d > vision) continue;

        if (other.mass > bot.mass * 1.12) {
            const threat = (other.mass / bot.mass) * (1 - d / (vision * 1.2));
            if (threat > 0.15) {
                fleeX += (bot.x - other.x) / d * threat;
                fleeY += (bot.y - other.y) / d * threat;
                fleeWeight += threat;
            }
            continue;
        }

        const ratio = bot.mass / other.mass;
        if (ratio < 1.15) continue;
        const catchable = ratio >= 1.25 ? 1.4 : 0.85 + p.aggression * 0.4;
        const score = catchable * ratio * (1 - d / vision) * p.ambition;
        if (score > bestPreyScore) {
            bestPreyScore = score;
            bestPrey = other;
        }
    }

    for (const f of state.food) {
        const d = dist(bot, f);
        if (d > vision * 0.65) continue;
        const score = (1 - d / vision) * (bestPreyScore > 0.8 ? 0.25 : 1);
        if (score > bestFoodScore) {
            bestFoodScore = score;
            bestFood = f;
        }
    }

    const siblings = getOwnedCells(bot.ownerId);
    const anchor = siblings.length > 1 ? getMergeAnchor(siblings) : null;
    const reformMode = siblings.length > 1 && bot.mergeCooldown <= 0
        && siblings.every(c => c.mergeCooldown <= 0)
        && (!bestPrey || bestPreyScore < 0.45 || fleeWeight > 0.6);

    let mx = Math.cos(p.wanderAngle) * 0.35;
    let my = Math.sin(p.wanderAngle) * 0.35;
    let speedMul = 0.7;

    if (reformMode && (!bestPrey || bestPreyScore < 0.55 || fleeWeight > 0.5)) {
        const d = dist(bot, anchor) || 1;
        mx = (anchor.x - bot.x) / d * 1.35;
        my = (anchor.y - bot.y) / d * 1.35;
        speedMul = 0.82;
    } else if (fleeWeight > 0) {
        mx += (fleeX / fleeWeight) * p.caution * 1.6;
        my += (fleeY / fleeWeight) * p.caution * 1.6;
        speedMul = 1.05;
    }

    if (bestPrey && bestPreyScore > 0.35 && fleeWeight < 1.2) {
        const d = dist(bot, bestPrey) || 1;
        const dx = (bestPrey.x - bot.x) / d;
        const dy = (bestPrey.y - bot.y) / d;
        const hunt = p.aggression * Math.min(bestPreyScore, 2);
        mx += dx * hunt * 1.5;
        my += dy * hunt * 1.5;
        speedMul = 0.92 + p.aggression * 0.12;

        if (bot === getMergeAnchor(siblings) || bestPrey.isPlayer) {
            tryBotSplit(bot, bestPrey);
        }
    } else if (bestFood && bestFoodScore > 0.1) {
        const d = dist(bot, bestFood) || 1;
        mx += ((bestFood.x - bot.x) / d) * 0.9;
        my += ((bestFood.y - bot.y) / d) * 0.9;
    }

    const len = Math.hypot(mx, my) || 1;
    const speed = moveSpeed(bot.mass) * speedMul * dt;
    bot.x += (mx / len) * speed;
    bot.y += (my / len) * speed;

    if (Math.abs(bot.vx) > 0.02 || Math.abs(bot.vy) > 0.02) {
        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;
        bot.vx *= Math.pow(0.88, dt);
        bot.vy *= Math.pow(0.88, dt);
    }

    const r = massToRadius(bot.mass);
    bot.x = Math.max(r, Math.min(WORLD.w - r, bot.x));
    bot.y = Math.max(r, Math.min(WORLD.h - r, bot.y));
}


/* ───────────────────────────────────────────────────────────────────────────
 *  RUNTIME STATE
 * ─────────────────────────────────────────────────────────────────────────── */

const state = {
    playing: false,
    mouse: { x: 0, y: 0 },
    camera: { x: 2500, y: 2500, zoom: 0.5, targetX: 2500, targetY: 2500, targetZoom: 0.5 },
    food: [],
    cells: [],
    player: null,
    nick: 'You',
    keys: {},
    mergeHeld: false,
    mergeSoundPlayed: false,
    lastRank: -1
};


/* ───────────────────────────────────────────────────────────────────────────
 *  CAMERA
 * ─────────────────────────────────────────────────────────────────────────── */

function getTargetZoom() {
    const m = state.player?.mass || START_MASS;
    const base = 1 - massToRadius(m) / 750;
    return Math.max(0.22, Math.min(0.85, base * settings.zoomOut));
}

function getZoom() {
    return state.camera.zoom;
}

function updateCamera(dt) {
    const t = 1 - Math.pow(1 - settings.cameraLerp, dt);
    const tz = 1 - Math.pow(1 - settings.zoomLerp, dt);
    state.camera.x += (state.camera.targetX - state.camera.x) * t;
    state.camera.y += (state.camera.targetY - state.camera.y) * t;
    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * tz;
}


/* ───────────────────────────────────────────────────────────────────────────
 *  UTILITIES & SPAWNING
 * ─────────────────────────────────────────────────────────────────────────── */

function rand(min, max) { return min + Math.random() * (max - min); }
function randColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function spawnFood(n) {
    for (let i = 0; i < n; i++) {
        state.food.push({
            x: rand(50, WORLD.w - 50),
            y: rand(50, WORLD.h - 50),
            mass: rand(1, 3),
            color: randColor()
        });
    }
}

function createCell(x, y, mass, name, color, isPlayer = false, ownerId = null) {
    return {
        x, y, mass, name, color, isPlayer,
        ownerId: ownerId ?? (isPlayer ? 'player' : null),
        vx: 0, vy: 0,
        splitCooldown: 0,
        mergeCooldown: 0,
        alive: true,
        personality: null
    };
}

function spawnBots() {
    state.cells = state.cells.filter(c => c.isPlayer);
    for (let i = 0; i < settings.botCount; i++) {
        const cell = createCell(
            rand(200, WORLD.w - 200),
            rand(200, WORLD.h - 200),
            START_MASS,
            BOT_NAMES[i % BOT_NAMES.length] + Math.floor(Math.random() * 99),
            randColor(),
            false,
            'bot_' + i
        );
        cell.personality = {
            aggression: rand(0.55, 1),
            caution: rand(0.35, 0.85),
            ambition: rand(0.5, 1),
            wanderAngle: rand(0, Math.PI * 2),
            wanderTimer: rand(40, 120)
        };
        state.cells.push(cell);
    }
}

function spawnPlayer() {
    const cell = createCell(WORLD.w / 2, WORLD.h / 2, START_MASS, state.nick, PLAYER_COLOR, true);
    state.cells.push(cell);
    state.player = cell;
    state.camera.x = state.camera.targetX = cell.x;
    state.camera.y = state.camera.targetY = cell.y;
    state.camera.zoom = state.camera.targetZoom = getTargetZoom();
}

function separatePlayerCells() {
    separateOwnedCells();
}

function mouseWorldPos() {
    const cw = engine.canvas?.width || window.innerWidth;
    const ch = engine.canvas?.height || window.innerHeight;
    const zoom = getZoom();
    return {
        x: state.camera.x + (state.mouse.x - cw / 2) / zoom,
        y: state.camera.y + (state.mouse.y - ch / 2) / zoom
    };
}


/* ───────────────────────────────────────────────────────────────────────────
 *  SCREEN FLOW — Intro · Menu · Navigation
 * ─────────────────────────────────────────────────────────────────────────── */

const screens = {
    show(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-' + id).classList.add('active');
    },

    goMenu() { this.show('menu'); },

    goIntro() {
        this.show('intro');
        const go = () => {
            introEl.removeEventListener('click', go);
            clearTimeout(introTimer);
            Sfx.play('introDone');
            this.show('menu');
        };
        const introEl = document.getElementById('screen-intro');
        introEl.addEventListener('click', go);
        const introTimer = setTimeout(go, 2800);
    },

    init() {
        options.loadUI();
        options.bind();

        document.getElementById('btn-play').addEventListener('click', () => { Sfx.play('click'); game.start(); });
        document.getElementById('nick-input').addEventListener('keydown', e => { if (e.key === 'Enter') { Sfx.play('click'); game.start(); } });
        document.getElementById('btn-respawn').addEventListener('click', () => { Sfx.play('click'); game.respawn(); });
        document.getElementById('btn-options').addEventListener('click', () => { Sfx.play('menuOpen'); screens.show('options'); });
        document.getElementById('btn-back-menu').addEventListener('click', () => { Sfx.play('menuBack'); screens.show('menu'); });
        document.getElementById('btn-save-options').addEventListener('click', () => { options.save(); Sfx.play('save'); screens.show('menu'); });
        document.getElementById('btn-menu-death').addEventListener('click', () => {
            Sfx.play('menuBack');
            document.getElementById('death-screen').classList.add('hidden');
            state.playing = false;
            screens.show('menu');
        });
        document.getElementById('nick-input').value = 'You';

        this.goIntro();
    }
};


/* ───────────────────────────────────────────────────────────────────────────
 *  OPTIONS MENU — Settings persistence & UI binding
 * ─────────────────────────────────────────────────────────────────────────── */

const options = {
    isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    },

    async applyFullscreen(on) {
        try {
            if (on) {
                if (!this.isFullscreen()) {
                    const el = document.documentElement;
                    const req = el.requestFullscreen || el.webkitRequestFullscreen;
                    if (req) await req.call(el);
                }
            } else if (this.isFullscreen()) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) await exit.call(document);
            }
        } catch (_) { /* browser a refuzat fullscreen */ }
    },

    bind() {
        const bind = (id, valId, fn) => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => {
                document.getElementById(valId).textContent = fn(el);
            });
        };
        bind('opt-zoom', 'val-zoom', el => el.value + '%');
        bind('opt-camera', 'val-camera', el => el.value);
        bind('opt-bots', 'val-bots', el => el.value);
        bind('opt-food', 'val-food', el => el.value);
        bind('opt-sound-vol', 'val-sound-vol', el => el.value + '%');

        document.getElementById('opt-sound-vol').addEventListener('input', e => {
            Sfx.setVolume(e.target.value / 100);
        });

        document.addEventListener('fullscreenchange', () => {
            settings.fullscreen = options.isFullscreen();
            const cb = document.getElementById('opt-fullscreen');
            if (cb) cb.checked = settings.fullscreen;
            if (engine.canvas) engine.resize();
        });
    },

    loadUI() {
        document.getElementById('opt-zoom').value = Math.round(settings.zoomOut * 100);
        document.getElementById('val-zoom').textContent = Math.round(settings.zoomOut * 100) + '%';
        document.getElementById('opt-camera').value = Math.round(settings.cameraLerp * 100);
        document.getElementById('val-camera').textContent = Math.round(settings.cameraLerp * 100);
        document.getElementById('opt-bots').value = settings.botCount;
        document.getElementById('val-bots').textContent = settings.botCount;
        document.getElementById('opt-food').value = settings.foodCount;
        document.getElementById('val-food').textContent = settings.foodCount;
        document.getElementById('opt-scanlines').checked = settings.scanlines;
        document.getElementById('opt-fullscreen').checked = settings.fullscreen || this.isFullscreen();
        document.getElementById('opt-color').value = settings.playerColor;
        document.getElementById('opt-sounds').checked = settings.sounds;
        document.getElementById('opt-sound-vol').value = Math.round(settings.soundVolume * 100);
        document.getElementById('val-sound-vol').textContent = Math.round(settings.soundVolume * 100) + '%';
        Sfx.setEnabled(settings.sounds);
        Sfx.setVolume(settings.soundVolume);
        document.getElementById('crt-overlay').style.opacity = settings.scanlines ? '1' : '0';
    },

    save() {
        settings.zoomOut = document.getElementById('opt-zoom').value / 100;
        settings.cameraLerp = document.getElementById('opt-camera').value / 100;
        settings.botCount = +document.getElementById('opt-bots').value;
        settings.foodCount = +document.getElementById('opt-food').value;
        settings.scanlines = document.getElementById('opt-scanlines').checked;
        settings.fullscreen = document.getElementById('opt-fullscreen').checked;
        settings.playerColor = document.getElementById('opt-color').value;
        settings.sounds = document.getElementById('opt-sounds').checked;
        settings.soundVolume = document.getElementById('opt-sound-vol').value / 100;
        PLAYER_COLOR = settings.playerColor;
        Sfx.setEnabled(settings.sounds);
        Sfx.setVolume(settings.soundVolume);
        document.getElementById('crt-overlay').style.opacity = settings.scanlines ? '1' : '0';
        this.applyFullscreen(settings.fullscreen);
    }
};


/* ───────────────────────────────────────────────────────────────────────────
 *  GAME LOOP — Update · Collisions · Win/Loss
 * ─────────────────────────────────────────────────────────────────────────── */

const game = {
    start() {
        state.nick = document.getElementById('nick-input').value.trim() || 'You';
        state.food = [];
        state.cells = [];
        spawnFood(settings.foodCount);
        spawnBots();
        spawnPlayer();
        state.playing = true;
        state.mergeSoundPlayed = false;
        state.lastRank = -1;
        document.getElementById('death-screen').classList.add('hidden');
        screens.show('game');
        Sfx.play('start');
        engine.start();
    },

    respawn() {
        document.getElementById('death-screen').classList.add('hidden');
        state.cells = state.cells.filter(c => !c.isPlayer);
        spawnPlayer();
        state.playing = true;
        state.mergeSoundPlayed = false;
        state.lastRank = -1;
        Sfx.play('respawn');
    },

    die() {
        if (!state.playing) return;
        state.playing = false;
        const score = state.cells.filter(c => c.isPlayer).reduce((s, c) => s + c.mass, 0);
        document.getElementById('final-score').textContent = Math.floor(score);
        document.getElementById('death-screen').classList.remove('hidden');
        Sfx.play('death');
    },

    split() {
        if (!state.playing) return;
        const mouse = mouseWorldPos();
        const players = state.cells.filter(c =>
            c.isPlayer && c.alive && c.mass >= 72 && c.splitCooldown <= 0
        );
        if (!players.length) return;

        let last = null;
        players.forEach(p => {
            const angle = Math.atan2(mouse.y - p.y, mouse.x - p.x);
            last = splitCell(p, angle) || last;
        });
        if (last) state.player = last;
    },

    eject() {
        if (!state.playing || !state.player?.alive) return;
        const p = state.player;
        if (p.mass < 20) return;
        p.mass -= 8;
        const angle = Math.atan2(state.mouse.y - engine.canvas.height / 2, state.mouse.x - engine.canvas.width / 2);
        state.food.push({
            x: p.x + Math.cos(angle) * massToRadius(p.mass),
            y: p.y + Math.sin(angle) * massToRadius(p.mass),
            mass: 8,
            color: p.color,
            vx: Math.cos(angle) * 5,
            vy: Math.sin(angle) * 5
        });
        Sfx.play('eject');
    },

    update(dt) {
        if (!state.playing) return;

        state.cells.forEach(c => {
            if (c.splitCooldown > 0) c.splitCooldown--;
            if (c.mergeCooldown > 0) c.mergeCooldown--;
        });

        const mouse = mouseWorldPos();
        const merging = isMergeKeyHeld();
        const playerCells = state.cells.filter(c => c.isPlayer && c.alive);
        const mergeAnchor = playerCells.length > 1 ? getMergeAnchor(playerCells) : null;

        playerCells.forEach(p => {
            let tx = mouse.x, ty = mouse.y;
            let speedMul = 1;

            if (merging && mergeAnchor) {
                tx = mergeAnchor.x;
                ty = mergeAnchor.y;
                speedMul = 1.55;
            }

            const dx = tx - p.x, dy = ty - p.y;
            const d = Math.hypot(dx, dy);
            if (d > 1) {
                const speed = moveSpeed(p.mass) * speedMul * dt;
                p.x += (dx / d) * Math.min(speed, d);
                p.y += (dy / d) * Math.min(speed, d);
            }
            if (merging && mergeAnchor && canMergePair(p, mergeAnchor) && p !== mergeAnchor) {
                const d2 = dist(p, mergeAnchor) || 1;
                const snap = moveSpeed(p.mass) * 0.85 * dt;
                p.x += (mergeAnchor.x - p.x) / d2 * snap;
                p.y += (mergeAnchor.y - p.y) / d2 * snap;
            }
            if (Math.abs(p.vx) > 0.02 || Math.abs(p.vy) > 0.02) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vx *= Math.pow(0.88, dt);
                p.vy *= Math.pow(0.88, dt);
            }
            const r = massToRadius(p.mass);
            p.x = Math.max(r, Math.min(WORLD.w - r, p.x));
            p.y = Math.max(r, Math.min(WORLD.h - r, p.y));
        });

        separateOwnedCells(merging);
        applyMergeAttraction(dt, merging);
        state.cells.filter(c => !c.isPlayer && c.alive).forEach(bot => updateBotAI(bot, dt));

        mergeOwnedCells(merging);

        const mergeHint = document.getElementById('merge-hint');
        if (mergeHint) {
            const pieces = playerCells.length;
            mergeHint.classList.toggle('hidden', pieces < 2);
            mergeHint.textContent = merging
                ? 'SHIFT · MERGE ACTIVE'
                : 'SHIFT · MERGE';
            if (merging && pieces >= 2 && !state.mergeSoundPlayed) {
                state.mergeSoundPlayed = true;
                Sfx.play('mergeHold');
            }
            if (!merging) state.mergeSoundPlayed = false;
        }

        // Food eject velocity
        state.food.forEach(f => {
            if (f.vx) {
                f.x += f.vx * dt; f.y += f.vy * dt;
                f.vx *= Math.pow(0.95, dt); f.vy *= Math.pow(0.95, dt);
                if (Math.abs(f.vx) < 0.05) delete f.vx;
            }
        });

        // Mâncare — celule mănâncă food
        state.cells.filter(c => c.alive).forEach(cell => {
            const r = massToRadius(cell.mass);
            state.food = state.food.filter(f => {
                if (dist(cell, f) < r) {
                    cell.mass += f.mass;
                    if (cell.isPlayer) Sfx.play('eatFood', { mass: f.mass });
                    return false;
                }
                return true;
            });
        });

        // Celule mănâncă celule — doar perechea cu eater mai mare
        const eaten = new Set();
        state.cells.forEach((a, i) => {
            if (!a.alive || eaten.has(i)) return;
            for (let j = 0; j < state.cells.length; j++) {
                if (i === j || eaten.has(j)) continue;
                const b = state.cells[j];
                if (!b.alive) continue;
                if (canEat(a, b)) {
                    a.mass += b.mass;
                    b.alive = false;
                    eaten.add(j);
                    if (a.isPlayer) Sfx.play('eatCell', { mass: b.mass });
                    else if (b.isPlayer) Sfx.play('eatenBy');
                }
            }
        });

        state.cells = state.cells.filter(c => c.alive);

        if (state.playing && !state.cells.some(c => c.isPlayer)) {
            game.die();
        }

        // Re-spawn food
        while (state.food.length < settings.foodCount) {
            state.food.push({
                x: rand(50, WORLD.w - 50),
                y: rand(50, WORLD.h - 50),
                mass: rand(1, 3),
                color: randColor()
            });
        }

        // Camera fluida
        const p = state.cells.filter(c => c.isPlayer).sort((a, b) => b.mass - a.mass)[0];
        state.player = p || null;
        if (p) {
            state.camera.targetX = p.x;
            state.camera.targetY = p.y;
            state.camera.targetZoom = getTargetZoom();
        }
        updateCamera(dt);

        ui.updateLeaderboard();
        const playerMass = state.cells.filter(c => c.isPlayer).reduce((s, c) => s + c.mass, 0);
        document.getElementById('score').textContent = Math.floor(playerMass);

        const rank = ui.getPlayerRank();
        if (rank >= 0 && state.lastRank >= 0 && rank < state.lastRank) Sfx.play('rankUp');
        if (rank >= 0) state.lastRank = rank;
    }
};


/* ───────────────────────────────────────────────────────────────────────────
 *  HUD & LEADERBOARD
 * ─────────────────────────────────────────────────────────────────────────── */

const ui = {
    getLeaderboard() {
        const totals = {};
        state.cells.forEach(c => {
            const key = c.ownerId || c.name;
            if (!totals[key]) totals[key] = { name: c.name, mass: 0, isPlayer: c.isPlayer };
            totals[key].mass += c.mass;
        });
        return Object.values(totals).sort((a, b) => b.mass - a.mass);
    },

    getPlayerRank() {
        const sorted = this.getLeaderboard();
        const idx = sorted.findIndex(c => c.isPlayer);
        return idx;
    },

    updateLeaderboard() {
        const sorted = this.getLeaderboard().slice(0, 10);
        document.getElementById('leader-list').innerHTML = sorted.map(c =>
            `<li class="${c.isPlayer ? 'me' : ''}"><span>${c.name}</span><span>${Math.floor(c.mass)}</span></li>`
        ).join('');
    }
};


/* ───────────────────────────────────────────────────────────────────────────
 *  RENDER ENGINE — Canvas · Pixel buffer · Draw calls
 * ─────────────────────────────────────────────────────────────────────────── */

const engine = {
    canvas: null, ctx: null, buffer: null, bctx: null,
    running: false, lastTime: 0,
    pixelScale: 0.5,

    start() {
        if (!this.canvas) {
            this.canvas = document.getElementById('gameCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.buffer = document.createElement('canvas');
            this.bctx = this.buffer.getContext('2d');
            window.addEventListener('resize', () => this.resize());
            this.canvas.addEventListener('mousemove', e => {
                const r = this.canvas.getBoundingClientRect();
                state.mouse.x = e.clientX - r.left;
                state.mouse.y = e.clientY - r.top;
            });
            window.addEventListener('keydown', e => {
                state.keys[e.code] = true;
                if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.mergeHeld = true;
                if (e.code === 'Space' && state.playing) { e.preventDefault(); game.split(); }
                if (e.code === 'KeyW' && state.playing) game.eject();
            });
            window.addEventListener('keyup', e => {
                state.keys[e.code] = false;
                if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                    state.mergeHeld = !!(state.keys.ShiftLeft || state.keys.ShiftRight);
                }
            });
            window.addEventListener('blur', () => {
                state.keys = {};
                state.mergeHeld = false;
            });
            this.resize();
        }
        if (!this.running) {
            this.running = true;
            this.loop();
        }
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.buffer.width = Math.floor(this.canvas.width * this.pixelScale);
        this.buffer.height = Math.floor(this.canvas.height * this.pixelScale);
    },

    loop(time = 0) {
        if (!this.lastTime) this.lastTime = time;
        const dt = Math.min((time - this.lastTime) / 16.667, 2.5);
        this.lastTime = time;
        if (state.playing) game.update(dt);
        else updateCamera(dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    },

    draw() {
        const ctx = this.bctx;
        const cw = this.buffer.width, ch = this.buffer.height;
        const cam = state.camera;
        const zoom = getZoom();

        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(0, 0, cw, ch);

        ctx.save();
        ctx.translate(cw / 2, ch / 2);
        ctx.scale(zoom * this.pixelScale, zoom * this.pixelScale);
        ctx.translate(-cam.x, -cam.y);

        this.drawGrid(ctx);
        this.drawBorder(ctx);
        state.food.forEach(f => this.drawFood(ctx, f));
        [...state.cells].sort((a, b) => a.mass - b.mass).forEach(c => this.drawCell(ctx, c));
        ctx.restore();

        const out = this.ctx;
        out.imageSmoothingEnabled = false;
        out.fillStyle = '#000';
        out.fillRect(0, 0, this.canvas.width, this.canvas.height);
        out.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
    },

    drawGrid(ctx) {
        const step = 50;
        ctx.strokeStyle = '#12122a';
        ctx.lineWidth = 1;
        const sx = Math.floor((state.camera.x - 1000) / step) * step;
        const sy = Math.floor((state.camera.y - 1000) / step) * step;
        for (let x = sx; x < state.camera.x + 1500; x += step) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.h); ctx.stroke();
        }
        for (let y = sy; y < state.camera.y + 1500; y += step) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.w, y); ctx.stroke();
        }
    },

    drawBorder(ctx) {
        ctx.strokeStyle = '#ff0055';
        ctx.lineWidth = 16;
        ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
        ctx.strokeStyle = '#880033';
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, WORLD.w - 16, WORLD.h - 16);
    },

    drawFood(ctx, f) {
        const r = Math.max(massToRadius(f.mass) * 0.35, 3);
        ctx.fillStyle = f.color;
        ctx.fillRect(Math.floor(f.x - r), Math.floor(f.y - r), Math.ceil(r * 2), Math.ceil(r * 2));
    },

    drawCell(ctx, c) {
        const r = massToRadius(c.mass);
        const ix = Math.floor(c.x), iy = Math.floor(c.y);
        const ir = Math.ceil(r);

        // Umbră retro
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.arc(ix + 3, iy + 3, ir, 0, Math.PI * 2);
        ctx.fill();

        // Corp flat
        ctx.fillStyle = c.color;
        ctx.beginPath();
        ctx.arc(ix, iy, ir, 0, Math.PI * 2);
        ctx.fill();

        // Highlight pixel (stripe sus)
        ctx.fillStyle = lighten(c.color, 50);
        ctx.beginPath();
        ctx.arc(ix, iy - ir * 0.25, ir * 0.75, Math.PI * 1.1, Math.PI * 1.9);
        ctx.fill();

        // Contur gros retro
        ctx.strokeStyle = darken(c.color, 60);
        ctx.lineWidth = Math.max(2, ir * 0.08);
        ctx.beginPath();
        ctx.arc(ix, iy, ir, 0, Math.PI * 2);
        ctx.stroke();

        if (c.mergeCooldown > 0) {
            ctx.strokeStyle = c.isPlayer ? 'rgba(57,255,20,0.5)' : 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(ix, iy, ir + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (r > 16) {
            ctx.fillStyle = '#000';
            ctx.font = `bold ${Math.min(Math.floor(r * 0.42), 18)}px VT323, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(c.name.toUpperCase(), ix, iy);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }
    }
};


/* ───────────────────────────────────────────────────────────────────────────
 *  COLOR UTILITIES
 * ─────────────────────────────────────────────────────────────────────────── */

function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return `rgb(${r},${g},${b})`;
}

function darken(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - amt);
    const g = Math.max(0, ((n >> 8) & 0xff) - amt);
    const b = Math.max(0, (n & 0xff) - amt);
    return `rgb(${r},${g},${b})`;
}


/* ───────────────────────────────────────────────────────────────────────────
 *  BOOT
 * ─────────────────────────────────────────────────────────────────────────── */

window.onload = () => screens.init();
