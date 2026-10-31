/* ═══════════════════════════════════════════════════════════════════════════
 *
 *   CELL WARS · RETRO EDITION
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
/** Timpi de joc în unități dt (dt=1 la 60fps, ~60 dt/secundă indiferent de refresh rate) */
const MERGE_COOLDOWN = 120;
const VIRUS_MASS = 100;
const VIRUS_SPOTS = [
    { x: 750, y: 750 },
    { x: 4250, y: 750 },
    { x: 750, y: 4250 },
    { x: 4250, y: 4250 },
    { x: 2500, y: 2500 }
];
const VIRUS_JITTER = 90;
const VIRUS_SPLIT_MIN = 115;
const POWERUP_MAX = 3;
const POWERUP_SPAWN_INTERVAL = 900;
const COMBO_WINDOW = 240;
const KILL_FEED_MS = 4200;
const POWERUP_TYPES = ['speed', 'shield', 'magnet'];
const POWERUP_DEFS = {
    speed:  { color: '#00e5ff', rim: '#006688', duration: 660, label: 'SPEED', speedMul: 1.90 },
    shield: { color: '#ffb000', rim: '#886600', duration: 2, label: 'SHIELD' },
    magnet: { color: '#ff44ff', rim: '#882288', duration: 600, label: 'MAGNET', range: 600 }
};
const EJECT_MASS = 10;
const EJECT_MIN_CELL_MASS = 24;
const EJECT_SPEED = 11;
const EJECT_SPAWN_EXTRA = 8;
const EJECT_FRICTION = 0.965;
const EJECT_BORDER_PAD = 20;
const EJECT_EAT_IMMUNE = 50;
const SHAKE_DECAY = 0.86;
const SHAKE_MAX = 14;
const BOT_NAMES = ['Cell', 'Blob', 'Virus', 'Nova', 'Pixel', 'Dot', 'Orb', 'Morphe', 'Zap', 'Neo', 'Alpha', 'Beta', 'Omega', 'Flux', 'Prism', 'Echo', 'Spark', 'Nebula', 'Comet', 'Ion', 'Quark', 'Proton', 'Atom', 'Nucleus', 'Plasma'];
const COLORS = ['#ff0055','#00e5ff','#39ff14','#ffb000','#ff44ff','#0088ff','#ff8800','#00ff88','#ff0088','#8800ff','#ffff00','#00ffff'];

const settings = {
    zoomOut: 0.72,
    cameraLerp: 0.09,
    botCount: 25,
    foodCount: 800,
    fullscreen: false,
    playerColor: '#00e5ff',
    sounds: true,
    soundVolume: 0.65
};

let PLAYER_COLOR = settings.playerColor;

const massToRadius = m => Math.sqrt(m) * 6;

function clampCellToWorld(cell) {
    if (!Number.isFinite(cell.x) || !Number.isFinite(cell.y)) {
        cell.x = rand(200, WORLD.w - 200);
        cell.y = rand(200, WORLD.h - 200);
        cell.vx = 0;
        cell.vy = 0;
    }
    const r = massToRadius(Math.max(cell.mass, 1));
    cell.x = Math.max(r, Math.min(WORLD.w - r, cell.x));
    cell.y = Math.max(r, Math.min(WORLD.h - r, cell.y));
}


/* ───────────────────────────────────────────────────────────────────────────
 *  PHYSICS & COLLISION
 * ─────────────────────────────────────────────────────────────────────────── */

/** Viteză de deplasare — normalizată la dt (dt=1 @ 60fps) */
function moveSpeed(mass) {
    return Math.max(0.5, 8 * Math.pow(mass, -0.22));
}

function tickTimer(value, dt) {
    return value > 0 ? Math.max(0, value - dt) : 0;
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
    return !!(state.keys.ShiftLeft || state.keys.ShiftRight || state.mergeHeld || state.mergePointerHeld);
}

function canMergePair(a, b) {
    return a.mergeCooldown <= 0 && b.mergeCooldown <= 0;
}

function shouldBotSplit(bot, prey) {
    if (!prey?.alive || bot.mass < 72 || bot.splitCooldown > 0) return false;

    const vsPlayer = prey.isPlayer;
    const halfMass = bot.mass / 2;
    // Half the bot must clear canEat (mass strictly above 1.25x). Below that, the split cannot eat.
    const minHalfRatio = vsPlayer ? 1.28 : 1.36;

    if (halfMass <= prey.mass * minHalfRatio) return false;

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

function ejectPellet(cell, angle) {
    if (!cell.isPlayer || cell.mass < EJECT_MIN_CELL_MASS) return false;

    cell.mass -= EJECT_MASS;
    const spawnDist = massToRadius(cell.mass) + massToRadius(EJECT_MASS) + EJECT_SPAWN_EXTRA;
    const pellet = {
        x: cell.x + Math.cos(angle) * spawnDist,
        y: cell.y + Math.sin(angle) * spawnDist,
        mass: EJECT_MASS,
        color: cell.color,
        rim: darken(cell.color, 45),
        vx: Math.cos(angle) * EJECT_SPEED,
        vy: Math.sin(angle) * EJECT_SPEED,
        eject: true,
        ejectOwner: 'player',
        ejectImmune: EJECT_EAT_IMMUNE,
        pulse: rand(0, Math.PI * 2)
    };
    clampEjectPellet(pellet);
    state.food.push(pellet);
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
    clampCellToWorld(cell);
    clampCellToWorld(child);
    state.cells.push(child);
    return child;
}

function virusSplitCell(cell) {
    if (cell.mass < VIRUS_SPLIT_MIN || cell.splitCooldown > 0) return false;

    const pieces = Math.min(16, Math.max(4, Math.floor(cell.mass / 40)));
    const pieceMass = cell.mass / pieces;
    if (pieceMass < 18) return false;

    const originX = cell.x;
    const originY = cell.y;
    cell.mass = pieceMass;
    cell.splitCooldown = 60;
    cell.mergeCooldown = MERGE_COOLDOWN;

    for (let i = 0; i < pieces; i++) {
        const angle = (Math.PI * 2 * i) / pieces + rand(-0.12, 0.12);
        const sep = massToRadius(pieceMass) * 2.2;
        const px = originX + Math.cos(angle) * sep;
        const py = originY + Math.sin(angle) * sep;
        const vx = Math.cos(angle) * 11;
        const vy = Math.sin(angle) * 11;
        if (i === 0) {
            cell.x = px;
            cell.y = py;
            cell.vx = vx;
            cell.vy = vy;
            clampCellToWorld(cell);
        } else {
            const child = createCell(
                px, py,
                pieceMass, cell.name, cell.color, cell.isPlayer, cell.ownerId
            );
            child.vx = vx;
            child.vy = vy;
            child.splitCooldown = 60;
            child.mergeCooldown = MERGE_COOLDOWN;
            if (cell.personality) child.personality = { ...cell.personality };
            clampCellToWorld(child);
            state.cells.push(child);
        }
    }
    if (cell.isPlayer) {
        Sfx.play('virus');
        addScreenShake(7.5);
    }
    return true;
}

function resolveVirusCollisions(dt) {
    state.cells.filter(c => c.alive).forEach(cell => {
        state.viruses.forEach(virus => {
            const d = dist(cell, virus);
            const rC = massToRadius(cell.mass);
            const rV = massToRadius(virus.mass);
            if (d >= rC + rV - 2) return;

            const popped = cell.mass > virus.mass * 1.15 && cell.splitCooldown <= 0 && virusSplitCell(cell);
            if (!popped && d > 0.01) {
                const nx = (cell.x - virus.x) / d;
                const ny = (cell.y - virus.y) / d;
                const push = (rC + rV - d) * 0.6 * dt;
                cell.x += nx * push;
                cell.y += ny * push;
                clampCellToWorld(cell);
            }
        });
    });
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

function separateOwnedCells(dt, playerMerging = false) {
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
                        const push = (minD - d) * (playerMerging && isPlayerPair ? 0.25 : 0.55) * dt;
                        a.x -= nx * push;
                        a.y -= ny * push;
                        b.x += nx * push;
                        b.y += ny * push;
                        a.vx -= nx * 0.35 * dt;
                        a.vy -= ny * 0.35 * dt;
                        b.vx += nx * 0.35 * dt;
                        b.vy += ny * 0.35 * dt;
                    } else if (!isPlayerPair) {
                        const pull = 0.2 * dt;
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
    let bestPowerup = null, bestPowerupScore = 0;
    let fleeX = 0, fleeY = 0, fleeWeight = 0;

    for (const other of state.cells) {
        if (other === bot || !other.alive || other.ownerId === bot.ownerId) continue;
        const d = dist(bot, other);
        if (d > vision) continue;

        if (other.mass > bot.mass * 1.12) {
            const threat = (other.mass / bot.mass) * (1 - d / (vision * 1.2));
            if (threat > 0.15) {
                const nd = d || 1;
                fleeX += (bot.x - other.x) / nd * threat;
                fleeY += (bot.y - other.y) / nd * threat;
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

    for (const pu of state.powerups) {
        const d = dist(bot, pu);
        if (d > vision * 0.85) continue;
        const score = (1 - d / vision) * (fleeWeight > 0.6 ? 0.35 : 1.15);
        if (score > bestPowerupScore) {
            bestPowerupScore = score;
            bestPowerup = pu;
        }
    }

    for (const virus of state.viruses) {
        const d = dist(bot, virus);
        if (d > vision * 0.8) continue;
        if (bot.mass > virus.mass * 1.15) {
            const threat = (bot.mass / virus.mass) * (1 - d / (vision * 1.1)) * 0.85;
            if (threat > 0.2) {
                const nd = d || 1;
                fleeX += (bot.x - virus.x) / nd * threat;
                fleeY += (bot.y - virus.y) / nd * threat;
                fleeWeight += threat;
            }
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
    const botFx = getOwnerEffects(bot.ownerId);
    if (botFx.speed > 0) speedMul *= POWERUP_DEFS.speed.speedMul;

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
    } else if (bestPowerup && bestPowerupScore > 0.22 && fleeWeight < 0.9
        && (!bestPrey || bestPreyScore < 0.55)) {
        const d = dist(bot, bestPowerup) || 1;
        mx += ((bestPowerup.x - bot.x) / d) * 1.25;
        my += ((bestPowerup.y - bot.y) / d) * 1.25;
        speedMul = Math.max(speedMul, 0.88);
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

    clampCellToWorld(bot);
}


/* ───────────────────────────────────────────────────────────────────────────
 *  RUNTIME STATE
 * ─────────────────────────────────────────────────────────────────────────── */

const state = {
    playing: false,
    mouse: { x: 0, y: 0 },
    pointerSeen: false,
    camera: { x: 2500, y: 2500, zoom: 0.5, targetX: 2500, targetY: 2500, targetZoom: 0.5, smoothX: 2500, smoothY: 2500, smoothZoom: 0.5 },
    food: [],
    cells: [],
    viruses: [],
    powerups: [],
    player: null,
    nick: 'You',
    keys: {},
    mergeHeld: false,
    mergePointerHeld: false,
    joystick: { active: false, x: 0, y: 0, lastX: 1, lastY: 0 },
    mergeSoundPlayed: false,
    lastRank: -1,
    lastPlayerMass: 0,
    maxMass: 0,
    matchStartedAt: 0,
    lastBlow: null,
    spectateName: '',
    showMinimap: true,
    killFeed: [],
    combo: 0,
    comboTimer: 0,
    ownerEffects: {},
    powerupSpawnTimer: 0,
    playerDead: false,
    playerWon: false,
    gameSession: false,
    screenShake: { amount: 0 }
};


/* ───────────────────────────────────────────────────────────────────────────
 *  CAMERA
 * ─────────────────────────────────────────────────────────────────────────── */

function groupSpan(cells) {
    if (!cells.length) return 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of cells) {
        const r = massToRadius(c.mass);
        minX = Math.min(minX, c.x - r);
        minY = Math.min(minY, c.y - r);
        maxX = Math.max(maxX, c.x + r);
        maxY = Math.max(maxY, c.y + r);
    }
    return Math.max(maxX - minX, maxY - minY);
}

function getPlayerFocus() {
    const cells = state.cells.filter(c => c.isPlayer && c.alive);
    if (!cells.length) return null;
    let sx = 0, sy = 0, mass = 0;
    for (const c of cells) {
        sx += c.x * c.mass;
        sy += c.y * c.mass;
        mass += c.mass;
    }
    return { x: sx / mass, y: sy / mass, mass, span: groupSpan(cells) };
}

function getTargetZoom(totalMass = START_MASS, span = 0) {
    const r = massToRadius(totalMass);
    const grow = Math.pow(r / 900, 0.62);
    const base = 0.88 - grow * 0.58;
    const massZoom = Math.max(0.24, Math.min(0.88, base * settings.zoomOut));
    if (span <= 0) return massZoom;
    const view = Math.min(window.innerWidth, window.innerHeight);
    const fit = (view * 0.62) / (span + 90);
    return Math.max(0.16, Math.min(massZoom, fit));
}

function formatClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
}

function getZoom() {
    return state.camera.zoom;
}

function snapCamera(x, y, zoom) {
    const cam = state.camera;
    cam.x = cam.targetX = cam.smoothX = x;
    cam.y = cam.targetY = cam.smoothY = y;
    cam.zoom = cam.targetZoom = cam.smoothZoom = zoom;
}

function updateCamera(dt) {
    const cam = state.camera;
    const lerp = settings.cameraLerp;
    const focusT = 1 - Math.pow(1 - Math.min(lerp * 1.35, 0.2), dt);
    const posT = 1 - Math.pow(1 - lerp, dt);
    const zoomT = 1 - Math.pow(1 - Math.min(lerp * 0.9, 0.16), dt);

    cam.smoothX += (cam.targetX - cam.smoothX) * focusT;
    cam.smoothY += (cam.targetY - cam.smoothY) * focusT;
    cam.smoothZoom += (cam.targetZoom - cam.smoothZoom) * focusT;

    cam.x += (cam.smoothX - cam.x) * posT;
    cam.y += (cam.smoothY - cam.y) * posT;
    cam.zoom += (cam.smoothZoom - cam.zoom) * zoomT;
}

function addScreenShake(amount) {
    state.screenShake.amount = Math.min(state.screenShake.amount + amount, SHAKE_MAX);
}

function updateScreenShake(dt) {
    if (state.screenShake.amount <= 0) return;
    state.screenShake.amount *= Math.pow(SHAKE_DECAY, dt);
    if (state.screenShake.amount < 0.12) state.screenShake.amount = 0;
}

function getShakeOffset() {
    const s = state.screenShake.amount;
    if (s <= 0) return { x: 0, y: 0 };
    return {
        x: (Math.random() - 0.5) * s * 2.2,
        y: (Math.random() - 0.5) * s * 2.2
    };
}


/* ───────────────────────────────────────────────────────────────────────────
 *  UTILITIES & SPAWNING
 * ─────────────────────────────────────────────────────────────────────────── */

function rand(min, max) { return min + Math.random() * (max - min); }
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}
function randColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }
function setHintAct(el, text) {
    const act = el && el.querySelector('.hint-act');
    if (act) act.textContent = text;
}
function toggleMinimap() {
    if (!state.playing) return;
    state.showMinimap = !state.showMinimap;
    const mapEl = document.getElementById('ctl-map');
    if (mapEl) {
        setHintAct(mapEl, state.showMinimap ? ' MAP' : ' MAP OFF');
        mapEl.classList.toggle('wait', !state.showMinimap);
    }
    document.getElementById('pad-map')?.classList.toggle('wait', !state.showMinimap);
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function clampEjectPellet(f) {
    const r = massToRadius(f.mass) * 0.9;
    const min = EJECT_BORDER_PAD + r;
    const maxX = WORLD.w - EJECT_BORDER_PAD - r;
    const maxY = WORLD.h - EJECT_BORDER_PAD - r;

    if (f.x < min) {
        f.x = min;
        if (f.vx) f.vx = Math.abs(f.vx) * 0.3;
    } else if (f.x > maxX) {
        f.x = maxX;
        if (f.vx) f.vx = -Math.abs(f.vx) * 0.3;
    }
    if (f.y < min) {
        f.y = min;
        if (f.vy) f.vy = Math.abs(f.vy) * 0.3;
    } else if (f.y > maxY) {
        f.y = maxY;
        if (f.vy) f.vy = -Math.abs(f.vy) * 0.3;
    }
}

function canCellEatFood(cell, f) {
    if (f.eject && f.ejectImmune > 0) {
        const owner = cell.isPlayer ? 'player' : cell.ownerId;
        if (owner === f.ejectOwner) return false;
    }
    return dist(cell, f) < massToRadius(cell.mass);
}

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

function spawnViruses() {
    state.viruses = VIRUS_SPOTS.map(spot => ({
        x: spot.x + rand(-VIRUS_JITTER, VIRUS_JITTER),
        y: spot.y + rand(-VIRUS_JITTER, VIRUS_JITTER),
        mass: VIRUS_MASS
    }));
}

function createPowerup(x, y, type) {
    const def = POWERUP_DEFS[type];
    return { x, y, type, mass: 16, color: def.color, rim: def.rim, pulse: rand(0, Math.PI * 2) };
}

function spawnPowerup() {
    if (state.powerups.length >= POWERUP_MAX) return;
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    state.powerups.push(createPowerup(
        rand(150, WORLD.w - 150),
        rand(150, WORLD.h - 150),
        type
    ));
}

function getOwnerKey(cell) {
    return cell.isPlayer ? 'player' : cell.ownerId;
}

function getOwnerEffects(key) {
    if (!state.ownerEffects[key]) {
        state.ownerEffects[key] = { speed: 0, shield: 0, magnet: 0 };
    }
    return state.ownerEffects[key];
}

function clearOwnerEffects(key) {
    delete state.ownerEffects[key];
}

function applyPowerup(type, ownerKey, isPlayer = false) {
    const def = POWERUP_DEFS[type];
    const fx = getOwnerEffects(ownerKey);
    if (type === 'shield') fx.shield = 1;
    else fx[type] = def.duration;
    if (isPlayer) {
        ui.showPowerupToast(type);
        ui.updateBuffs();
    }
}

function updateOwnerEffects(dt) {
    for (const key in state.ownerEffects) {
        const fx = state.ownerEffects[key];
        if (fx.speed > 0) fx.speed = Math.max(0, fx.speed - dt);
        if (fx.magnet > 0) fx.magnet = Math.max(0, fx.magnet - dt);
        if (fx.speed <= 0 && fx.magnet <= 0 && fx.shield <= 0) delete state.ownerEffects[key];
    }
    if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) {
            state.combo = 0;
            ui.updateCombo();
        }
    }
    ui.updateBuffs();
}

function applyMagnet(dt) {
    const range = POWERUP_DEFS.magnet.range;
    const owners = new Set();
    state.cells.filter(c => c.alive).forEach(c => owners.add(getOwnerKey(c)));

    owners.forEach(key => {
        const fx = getOwnerEffects(key);
        if (fx.magnet <= 0) return;
        const cells = state.cells.filter(c => c.alive && getOwnerKey(c) === key);
        if (!cells.length) return;
        const anchor = getMergeAnchor(cells);

        state.food.forEach(f => {
            const d = dist(f, anchor);
            if (d < range && d > 1) {
                const pull = (1 - d / range) * 3.5 * dt;
                f.x += (anchor.x - f.x) / d * pull;
                f.y += (anchor.y - f.y) / d * pull;
                f.x = Math.max(30, Math.min(WORLD.w - 30, f.x));
                f.y = Math.max(30, Math.min(WORLD.h - 30, f.y));
            }
        });
    });
}

function collectPowerups(dt) {
    state.powerups.forEach(p => { p.pulse += 0.08 * dt; });
    const cells = state.cells.filter(c => c.alive).sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer));
    for (const cell of cells) {
        if (!state.powerups.length) break;
        const ownerKey = getOwnerKey(cell);
        const reach = massToRadius(cell.mass);
        const kept = [];
        for (const p of state.powerups) {
            const pr = massToRadius(p.mass);
            if (dist(cell, p) < reach + pr * 0.5) {
                applyPowerup(p.type, ownerKey, cell.isPlayer);
                if (cell.isPlayer) Sfx.play('powerup');
            } else {
                kept.push(p);
            }
        }
        state.powerups = kept;
    }
}

function consumeFood() {
    const cells = state.cells.filter(c => c.alive);
    if (!cells.length || !state.food.length) return;
    cells.sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer));
    state.food = state.food.filter(f => {
        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            if (!canCellEatFood(cell, f)) continue;
            cell.mass += f.mass;
            if (cell.isPlayer) Sfx.play('eatFood', { mass: f.mass });
            return false;
        }
        return true;
    });
}

function setGameFrozen(frozen, mode = '') {
    const screen = document.getElementById('screen-game');
    if (!screen) return;
    screen.classList.toggle('player-dead', frozen && mode === 'dead');
    screen.classList.toggle('player-won', frozen && mode === 'won');
}

function updateSpectateCamera() {
    const bots = state.cells.filter(c => !c.isPlayer && c.alive);
    const label = document.getElementById('spectate-label');
    const nameEl = document.getElementById('spectate-name');
    if (!bots.length) {
        state.spectateName = '';
        label?.classList.add('hidden');
        return;
    }
    let focus = null;
    if (state.lastBlow?.ownerId) {
        const owned = bots.filter(c => c.ownerId === state.lastBlow.ownerId);
        if (owned.length) focus = getMergeAnchor(owned);
    }
    if (!focus) focus = bots.reduce((best, c) => (c.mass > best.mass ? c : best), bots[0]);
    const group = bots.filter(c => c.ownerId === focus.ownerId);
    const center = getOwnerMassCentroid(group.length ? group : [focus]);
    const mass = group.reduce((sum, c) => sum + c.mass, 0);
    state.camera.targetX = center.x;
    state.camera.targetY = center.y;
    state.camera.targetZoom = getTargetZoom(mass, groupSpan(group));
    state.spectateName = focus.name;
    if (label && nameEl) {
        nameEl.textContent = focus.name;
        label.classList.remove('hidden');
    }
}

function botOwnersAlive() {
    const owners = new Set();
    state.cells.filter(c => c.alive && !c.isPlayer).forEach(c => owners.add(c.ownerId));
    return owners.size;
}

function recordKill(killer, victim) {
    if (!killer.isPlayer && !victim.isPlayer) return;

    const entry = {
        killer: killer.name,
        victim: victim.name,
        isPlayerKill: killer.isPlayer,
        time: performance.now()
    };
    state.killFeed.unshift(entry);
    if (state.killFeed.length > 6) state.killFeed.pop();

    if (killer.isPlayer) {
        if (state.comboTimer > 0) state.combo++;
        else state.combo = 1;
        state.comboTimer = COMBO_WINDOW;
        if (state.combo >= 2) Sfx.play('combo', { level: state.combo });
        addScreenShake(Math.min(5.5, 1.2 + Math.sqrt(victim.mass) * 0.22));
        if (state.combo >= 3) addScreenShake(0.6 + state.combo * 0.28);
    } else if (victim.isPlayer) {
        state.lastBlow = { name: killer.name, ownerId: killer.ownerId };
        state.combo = 0;
        state.comboTimer = 0;
        addScreenShake(8.5);
    }
    ui.updateKillFeed(state.combo);
    ui.updateCombo();
}

function clearKillFeed() {
    state.killFeed = [];
    ui.updateKillFeed(0);
}

function tickKillFeed() {
    const now = performance.now();
    const next = state.killFeed.filter(entry => now - entry.time < KILL_FEED_MS);
    const removed = next.length !== state.killFeed.length;
    if (removed) state.killFeed = next;
    if (state.killFeed.length || removed) ui.updateKillFeed(state.combo);
}

function resetSessionState() {
    clearKillFeed();
    state.combo = 0;
    state.comboTimer = 0;
    state.ownerEffects = {};
    state.powerupSpawnTimer = 0;
    state.powerups = [];
    state.playerDead = false;
    state.playerWon = false;
    state.lastBlow = null;
    state.spectateName = '';
    state.maxMass = 0;
    state.screenShake = { amount: 0 };
    setGameFrozen(false);
    ui.updateBuffs();
    ui.updateCombo();
}

function createCell(x, y, mass, name, color, isPlayer = false, ownerId = null) {
    return {
        x, y, mass, name, color, isPlayer,
        ownerId: ownerId ?? (isPlayer ? 'player' : null),
        vx: 0, vy: 0,
        splitCooldown: 0,
        mergeCooldown: 0,
        ejectCooldown: 0,
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

function findSafeSpawn(mass) {
    const r = massToRadius(mass);
    const threats = state.cells.filter(c => c.alive && !c.isPlayer);

    const scoreAt = (x, y) => {
        let score = Infinity;
        for (const c of threats) {
            const d = Math.hypot(c.x - x, c.y - y);
            const canSnipe = c.mass / 2 > mass * 1.28;
            const lethal = c.mass > mass * 1.2;
            const pad = canSnipe ? 780 : lethal ? 360 : 80;
            score = Math.min(score, d - (massToRadius(c.mass) + r + pad));
        }
        for (const v of state.viruses) {
            const d = Math.hypot(v.x - x, v.y - y);
            score = Math.min(score, d - (massToRadius(v.mass) + r + 140));
        }
        return score;
    };

    let best = { x: WORLD.w / 2, y: WORLD.h / 2 };
    let bestScore = scoreAt(best.x, best.y);
    for (let x = 220; x <= WORLD.w - 220; x += 420) {
        for (let y = 220; y <= WORLD.h - 220; y += 420) {
            const score = scoreAt(x, y);
            if (score > bestScore) {
                bestScore = score;
                best = { x, y };
            }
        }
    }
    return best;
}

function spawnPlayer() {
    const spot = findSafeSpawn(START_MASS);
    const cell = createCell(spot.x, spot.y, START_MASS, state.nick, PLAYER_COLOR, true);
    state.cells.push(cell);
    state.player = cell;
    snapCamera(cell.x, cell.y, getTargetZoom(START_MASS));
}

function separatePlayerCells(dt) {
    separateOwnedCells(dt);
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

function tabletModeOn() {
    return document.body.classList.contains('tablet-mode');
}

function moveTarget(origin) {
    if (!tabletModeOn()) return mouseWorldPos();
    if (!state.joystick.active) return { x: origin.x, y: origin.y };
    const len = Math.hypot(state.joystick.x, state.joystick.y) || 1;
    return {
        x: origin.x + (state.joystick.x / len) * 480,
        y: origin.y + (state.joystick.y / len) * 480
    };
}

function actionAim(origin) {
    if (!tabletModeOn()) return mouseWorldPos();
    const j = state.joystick;
    const nx = j.active ? j.x : j.lastX;
    const ny = j.active ? j.y : j.lastY;
    const len = Math.hypot(nx, ny) || 1;
    return {
        x: origin.x + (nx / len) * 480,
        y: origin.y + (ny / len) * 480
    };
}


/* ───────────────────────────────────────────────────────────────────────────
 *  SPACEJUNK SIGNAL — shared tint with studio deck (alien mark only)
 * ─────────────────────────────────────────────────────────────────────────── */

const SJ_SIGNAL_KEY = 'spacejunkStudioTint';
const SJ_SIGNAL_FALLBACK_KEYS = ['nebulaVoidHubTitleColor', 'cosmic-quiz-signal'];
const SJ_SIGNAL_DEFAULT = '#ff2d2d';

function sjIsHex(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function sjReadSignalTint() {
    const keys = [SJ_SIGNAL_KEY].concat(SJ_SIGNAL_FALLBACK_KEYS);
    try {
        for (let i = 0; i < keys.length; i++) {
            const saved = localStorage.getItem(keys[i]);
            if (saved && sjIsHex(saved)) return saved.toLowerCase();
        }
    } catch (_) { /* private mode */ }
    return SJ_SIGNAL_DEFAULT;
}

function sjApplySignalTint() {
    document.documentElement.style.setProperty('--sj-signal', sjReadSignalTint());
}

function sjOnSignalStorage(ev) {
    if (!ev.key) return;
    if (ev.key === SJ_SIGNAL_KEY || SJ_SIGNAL_FALLBACK_KEYS.indexOf(ev.key) !== -1) {
        sjApplySignalTint();
    }
}

/* ───────────────────────────────────────────────────────────────────────────
 *  SCREEN FLOW — Intro · Menu · Navigation
 * ─────────────────────────────────────────────────────────────────────────── */

const screens = {
    show(id) {
        document.querySelectorAll('.screen').forEach(s => {
            const on = s.id === 'screen-' + id;
            s.classList.toggle('active', on);
            s.inert = !on;
        });
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
        sjApplySignalTint();
        window.addEventListener('storage', sjOnSignalStorage);

        options.loadUI();
        options.bind();

        document.getElementById('btn-play').addEventListener('click', () => { Sfx.play('click'); game.start(); });
        document.getElementById('nick-input').addEventListener('keydown', e => { if (e.key === 'Enter') { Sfx.play('click'); game.start(); } });
        document.getElementById('btn-respawn').addEventListener('click', () => { Sfx.play('click'); game.respawn(); });
        document.getElementById('btn-options').addEventListener('click', () => {
            options.loadUI();
            Sfx.play('menuOpen');
            screens.show('options');
        });
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            options.loadUI();
            Sfx.play('menuBack');
            screens.show('menu');
        });
        document.getElementById('btn-save-options').addEventListener('click', () => { options.save(); Sfx.play('save'); screens.show('menu'); });
        document.getElementById('btn-menu-death').addEventListener('click', () => {
            Sfx.play('menuBack');
            document.getElementById('death-screen').classList.add('hidden');
            state.playing = false;
            state.gameSession = false;
            state.playerDead = false;
            setGameFrozen(false);
            screens.show('menu');
        });
        document.getElementById('btn-victory-again').addEventListener('click', () => {
            Sfx.play('click');
            document.getElementById('victory-screen').classList.add('hidden');
            game.start();
        });
        document.getElementById('btn-menu-victory').addEventListener('click', () => {
            Sfx.play('menuBack');
            document.getElementById('victory-screen').classList.add('hidden');
            state.playing = false;
            state.gameSession = false;
            state.playerWon = false;
            setGameFrozen(false);
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
        document.getElementById('opt-fullscreen').checked = settings.fullscreen || this.isFullscreen();
        document.getElementById('opt-color').value = settings.playerColor;
        document.getElementById('opt-sounds').checked = settings.sounds;
        document.getElementById('opt-sound-vol').value = Math.round(settings.soundVolume * 100);
        document.getElementById('val-sound-vol').textContent = Math.round(settings.soundVolume * 100) + '%';
        Sfx.setEnabled(settings.sounds);
        Sfx.setVolume(settings.soundVolume);
    },

    save() {
        settings.zoomOut = document.getElementById('opt-zoom').value / 100;
        settings.cameraLerp = document.getElementById('opt-camera').value / 100;
        settings.botCount = +document.getElementById('opt-bots').value;
        settings.foodCount = +document.getElementById('opt-food').value;
        settings.fullscreen = document.getElementById('opt-fullscreen').checked;
        settings.playerColor = document.getElementById('opt-color').value;
        settings.sounds = document.getElementById('opt-sounds').checked;
        settings.soundVolume = document.getElementById('opt-sound-vol').value / 100;
        PLAYER_COLOR = settings.playerColor;
        Sfx.setEnabled(settings.sounds);
        Sfx.setVolume(settings.soundVolume);
        const wantFull = settings.fullscreen;
        this.applyFullscreen(wantFull).finally(() => {
            settings.fullscreen = options.isFullscreen();
            const cb = document.getElementById('opt-fullscreen');
            if (cb) cb.checked = settings.fullscreen;
        });
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
        resetSessionState();
        spawnFood(settings.foodCount);
        spawnViruses();
        spawnBots();
        spawnPlayer();
        spawnPowerup();
        state.playing = true;
        state.gameSession = true;
        if (!state.pointerSeen) {
            state.mouse.x = window.innerWidth / 2;
            state.mouse.y = window.innerHeight / 2;
        }
        state.mergeSoundPlayed = false;
        state.lastRank = -1;
        state.matchStartedAt = performance.now();
        state.maxMass = START_MASS;
        document.getElementById('death-screen').classList.add('hidden');
        document.getElementById('victory-screen').classList.add('hidden');
        document.getElementById('spectate-label')?.classList.add('hidden');
        document.getElementById('control-bar')?.classList.remove('hidden');
        setTabletChrome(true);
        screens.show('game');
        Sfx.play('start');
        engine.start();
    },

    respawn() {
        document.getElementById('death-screen').classList.add('hidden');
        state.playerDead = false;
        setGameFrozen(false);
        state.cells = state.cells.filter(c => !c.isPlayer);
        spawnPlayer();
        state.mergeSoundPlayed = false;
        state.lastRank = -1;
        state.matchStartedAt = performance.now();
        state.maxMass = START_MASS;
        state.lastBlow = null;
        state.spectateName = '';
        document.getElementById('spectate-label')?.classList.add('hidden');
        document.getElementById('control-bar')?.classList.remove('hidden');
        setTabletChrome(true);
        state.combo = 0;
        state.comboTimer = 0;
        clearKillFeed();
        clearOwnerEffects('player');
        ui.updateCombo();
        ui.updateBuffs();
        Sfx.play('respawn');
    },

    die(score) {
        if (state.playerDead || state.playerWon) return;
        state.playerDead = true;
        state.keys = {};
        state.mergeHeld = false;
        state.mergePointerHeld = false;
        tabletPad.stop();
        const mass = Math.floor(score || 0);
        state.maxMass = Math.max(state.maxMass, mass);
        document.getElementById('final-score').textContent = mass;
        document.getElementById('score').textContent = mass;
        document.getElementById('death-best').textContent = Math.floor(state.maxMass);
        document.getElementById('death-rank').textContent = state.lastRank >= 0 ? '#' + (state.lastRank + 1) : '—';
        document.getElementById('death-time').textContent = formatClock(performance.now() - state.matchStartedAt);
        document.getElementById('death-killer').textContent = state.lastBlow?.name || '—';
        document.getElementById('death-screen').classList.remove('hidden');
        document.getElementById('control-bar')?.classList.add('hidden');
        setTabletChrome(false);
        document.getElementById('combo-box')?.classList.add('hidden');
        document.getElementById('buff-bar')?.classList.add('hidden');
        state.combo = 0;
        state.comboTimer = 0;
        setGameFrozen(true, 'dead');
        addScreenShake(10);
        Sfx.play('death');
    },

    win() {
        if (state.playerWon || state.playerDead) return;
        state.playerWon = true;
        state.keys = {};
        state.mergeHeld = false;
        state.mergePointerHeld = false;
        tabletPad.stop();
        const score = state.cells.filter(c => c.isPlayer).reduce((s, c) => s + c.mass, 0);
        state.maxMass = Math.max(state.maxMass, score);
        const rank = ui.getPlayerRank();
        document.getElementById('victory-score').textContent = Math.floor(score);
        document.getElementById('victory-best').textContent = Math.floor(state.maxMass);
        document.getElementById('victory-rank').textContent = rank >= 0 ? '#' + (rank + 1) : '#1';
        document.getElementById('victory-time').textContent = formatClock(performance.now() - state.matchStartedAt);
        document.getElementById('victory-screen').classList.remove('hidden');
        document.getElementById('spectate-label')?.classList.add('hidden');
        document.getElementById('control-bar')?.classList.add('hidden');
        setTabletChrome(false);
        document.getElementById('combo-box')?.classList.add('hidden');
        document.getElementById('buff-bar')?.classList.add('hidden');
        state.combo = 0;
        state.comboTimer = 0;
        ui.updateCombo();
        ui.updateBuffs();
        setGameFrozen(true, 'won');
        addScreenShake(5.5);
        Sfx.play('victory');
    },

    split() {
        if (!state.playing || state.playerDead || state.playerWon) return;
        const players = state.cells.filter(c =>
            c.isPlayer && c.alive && c.mass >= 72 && c.splitCooldown <= 0
        );
        if (!players.length) return;

        let count = 0;
        players.forEach(p => {
            const aim = actionAim(p);
            const angle = Math.atan2(aim.y - p.y, aim.x - p.x);
            if (splitCell(p, angle)) count++;
        });
        if (count) {
            Sfx.play('split');
            addScreenShake(Math.min(6, 2.2 + count * 0.35));
        }
    },

    eject() {
        if (!state.playing || state.playerDead || state.playerWon || !state.player?.alive) return;
        const p = state.player;
        const aim = actionAim(p);
        const angle = Math.atan2(aim.y - p.y, aim.x - p.x);
        if (ejectPellet(p, angle)) {
            Sfx.play('eject');
            addScreenShake(1.5);
        }
    },

    update(dt) {
        if (!state.gameSession) return;

        try {
        tickKillFeed();
        updateScreenShake(dt);
        if (state.playerWon) {
            updateCamera(dt);
            return;
        }
        updateOwnerEffects(dt);

        state.powerupSpawnTimer += dt;
        if (state.powerupSpawnTimer >= POWERUP_SPAWN_INTERVAL) {
            state.powerupSpawnTimer = 0;
            spawnPowerup();
        }

        state.cells.forEach(c => {
            c.splitCooldown = tickTimer(c.splitCooldown, dt);
            c.mergeCooldown = tickTimer(c.mergeCooldown, dt);
        });

        const merging = !state.playerDead && !state.playerWon && isMergeKeyHeld();
        const playerCells = state.cells.filter(c => c.isPlayer && c.alive);
        const mergeAnchor = playerCells.length > 1 ? getMergeAnchor(playerCells) : null;

        if (!state.playerDead && !state.playerWon) {
        const playerFx = getOwnerEffects('player');
        playerCells.forEach(p => {
            const aim = moveTarget(p);
            let tx = aim.x, ty = aim.y;
            let speedMul = playerFx.speed > 0 ? POWERUP_DEFS.speed.speedMul : 1;
            if (tabletModeOn() && state.joystick.active) {
                const mag = Math.min(1, Math.hypot(state.joystick.x, state.joystick.y));
                speedMul *= 0.4 + 0.6 * mag;
            }

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
            clampCellToWorld(p);
        });
        }

        separateOwnedCells(dt, merging);
        applyMergeAttraction(dt, merging);

        state.cells.filter(c => !c.isPlayer && c.alive).forEach(bot => updateBotAI(bot, dt));

        mergeOwnedCells(merging);
        resolveVirusCollisions(dt);
        applyMagnet(dt);
        collectPowerups(dt);

        ui.updateControls(merging);

        // Food velocity (eject pellets travel farther with less drag)
        state.food.forEach(f => {
            if (f.eject) {
                if (f.ejectImmune > 0) f.ejectImmune = Math.max(0, f.ejectImmune - dt);
                if (f.pulse != null) f.pulse += 0.1 * dt;
            }
            const hasVel = f.vx != null || f.vy != null;
            if (!hasVel) return;

            f.x += (f.vx || 0) * dt;
            f.y += (f.vy || 0) * dt;
            const decay = f.eject ? EJECT_FRICTION : 0.95;
            if (f.vx != null) f.vx *= Math.pow(decay, dt);
            if (f.vy != null) f.vy *= Math.pow(decay, dt);
            if (f.eject) clampEjectPellet(f);

            const vxDone = f.vx == null || Math.abs(f.vx) < 0.04;
            const vyDone = f.vy == null || Math.abs(f.vy) < 0.04;
            if (vxDone && vyDone) {
                delete f.vx;
                delete f.vy;
            }
        });

        consumeFood();

        // Cells eat cells — capture player mass before removal
        const playerMassBefore = state.cells.filter(c => c.isPlayer).reduce((s, c) => s + c.mass, 0);

        const eaten = new Set();
        state.cells.forEach((a, i) => {
            if (!a.alive || eaten.has(i)) return;
            for (let j = 0; j < state.cells.length; j++) {
                if (i === j || eaten.has(j)) continue;
                const b = state.cells[j];
                if (!b.alive) continue;
                if (canEat(a, b)) {
                    const bFx = getOwnerEffects(getOwnerKey(b));
                    if (bFx.shield > 0) {
                        bFx.shield = 0;
                        if (b.isPlayer) {
                            Sfx.play('shieldBreak');
                            addScreenShake(4.8);
                            ui.updateBuffs();
                            ui.showPowerupToast('shieldBreak');
                        }
                        const d = dist(a, b) || 1;
                        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
                        b.vx += nx * 14;
                        b.vy += ny * 14;
                        a.vx -= nx * 6;
                        a.vy -= ny * 6;
                        b.x += nx * massToRadius(b.mass) * 0.4;
                        b.y += ny * massToRadius(b.mass) * 0.4;
                        clampCellToWorld(a);
                        clampCellToWorld(b);
                        continue;
                    }
                    a.mass += b.mass;
                    b.alive = false;
                    eaten.add(j);
                    recordKill(a, b);
                    if (a.isPlayer) Sfx.play('eatCell', { mass: b.mass });
                    else if (b.isPlayer) Sfx.play('eatenBy');
                }
            }
        });

        state.cells = state.cells.filter(c => c.alive);
        state.lastPlayerMass = state.cells.some(c => c.isPlayer)
            ? state.cells.filter(c => c.isPlayer).reduce((s, c) => s + c.mass, 0)
            : playerMassBefore;

        if (!state.playerDead && !state.playerWon && !state.cells.some(c => c.isPlayer)) {
            game.die(state.lastPlayerMass || 0);
        }

        if (!state.playerDead && !state.playerWon && botOwnersAlive() === 0 && state.cells.some(c => c.isPlayer)) {
            game.win();
        }

        // Re-spawn ambient food (eject pellets don't count toward cap)
        let ambient = state.food.filter(f => !f.eject).length;
        while (ambient < settings.foodCount) {
            state.food.push({
                x: rand(50, WORLD.w - 50),
                y: rand(50, WORLD.h - 50),
                mass: rand(1, 3),
                color: randColor()
            });
            ambient++;
        }

        // Camera fluida — centrul de masa al jucatorului + zoom subtil la crestere
        const focus = getPlayerFocus();
        state.player = focus ? state.cells.filter(c => c.isPlayer && c.alive).sort((a, b) => b.mass - a.mass)[0] : null;
        if (focus) {
            let tx = focus.x;
            let ty = focus.y;
            if (tabletModeOn()) {
                if (state.joystick.active) {
                    const len = Math.hypot(state.joystick.x, state.joystick.y) || 1;
                    const lead = 170 * Math.min(1, len);
                    tx += (state.joystick.x / len) * lead;
                    ty += (state.joystick.y / len) * lead;
                }
            } else if (state.pointerSeen) {
                const mouse = mouseWorldPos();
                const dx = mouse.x - focus.x;
                const dy = mouse.y - focus.y;
                const len = Math.hypot(dx, dy);
                if (len > 8) {
                    const lead = Math.min(len * 0.16, 240);
                    tx += (dx / len) * lead;
                    ty += (dy / len) * lead;
                }
            }
            state.camera.targetX = tx;
            state.camera.targetY = ty;
            state.camera.targetZoom = getTargetZoom(focus.mass, focus.span);
            document.getElementById('spectate-label')?.classList.add('hidden');
        } else if (state.playerDead || state.playerWon) {
            updateSpectateCamera();
        }
        updateCamera(dt);

        ui.updateLeaderboard();
        if (!state.playerDead && !state.playerWon) {
            const playerMass = state.cells.filter(c => c.isPlayer).reduce((s, c) => s + c.mass, 0);
            state.maxMass = Math.max(state.maxMass, playerMass);
            document.getElementById('score').textContent = Math.floor(playerMass);

            const rank = ui.getPlayerRank();
            const rankLabel = document.getElementById('rank-label');
            if (rankLabel) rankLabel.textContent = rank >= 0 ? '#' + (rank + 1) : '#—';
            if (rank >= 0 && state.lastRank >= 0 && rank < state.lastRank) Sfx.play('rankUp');
            if (rank >= 0) state.lastRank = rank;
        }
        } catch (err) {
            console.error('Game update error:', err);
        }
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
        const all = this.getLeaderboard();
        const top = all.slice(0, 10);
        const meIndex = all.findIndex(c => c.isPlayer);
        let html = top.map((c, i) =>
            `<li class="${c.isPlayer ? 'me' : ''}"><span>${i + 1} ${escapeHtml(c.name)}</span><span>${Math.floor(c.mass)}</span></li>`
        ).join('');
        if (meIndex >= 10) {
            const me = all[meIndex];
            html += `<li class="me pinned"><span>${meIndex + 1} ${escapeHtml(me.name)}</span><span>${Math.floor(me.mass)}</span></li>`;
        }
        document.getElementById('leader-list').innerHTML = html;
    },

    updateControls(merging) {
        const bar = document.getElementById('control-bar');
        if (!bar) return;
        const live = state.playing && !state.playerDead && !state.playerWon;
        bar.classList.toggle('hidden', !live);
        setTabletChrome(live);
        if (!live) return;

        const cells = state.cells.filter(c => c.isPlayer && c.alive);
        const pieces = cells.length;
        const splitEl = document.getElementById('ctl-split');
        const mergeEl = document.getElementById('ctl-merge');
        const ready = cells.some(c => c.mass >= 72 && c.splitCooldown <= 0);
        let wait = Infinity;
        for (const c of cells) {
            if (c.mass >= 72 && c.splitCooldown > 0) wait = Math.min(wait, c.splitCooldown);
        }
        if (splitEl) {
            if (!ready && wait < Infinity) {
                setHintAct(splitEl, ' ' + (wait / 60).toFixed(1) + 's');
                splitEl.classList.add('wait');
            } else {
                setHintAct(splitEl, ' SPLIT');
                splitEl.classList.remove('wait');
            }
        }
        if (mergeEl) {
            const active = pieces >= 2;
            mergeEl.classList.toggle('armed', active && !merging);
            mergeEl.classList.toggle('hot', active && merging);
            setHintAct(mergeEl, active && merging ? 'MERGING' : ' MERGE');
        }
        const mapEl = document.getElementById('ctl-map');
        if (mapEl) {
            setHintAct(mapEl, state.showMinimap ? ' MAP' : ' MAP OFF');
            mapEl.classList.toggle('wait', !state.showMinimap);
        }
        const padSplit = document.getElementById('pad-split');
        const padMerge = document.getElementById('pad-merge');
        const padMap = document.getElementById('pad-map');
        if (padSplit) padSplit.classList.toggle('wait', !ready && wait < Infinity);
        if (padMerge) {
            const canMerge = pieces >= 2;
            padMerge.classList.toggle('hot', canMerge && merging);
            padMerge.setAttribute('aria-pressed', canMerge && merging ? 'true' : 'false');
        }
        if (padMap) {
            padMap.classList.toggle('wait', !state.showMinimap);
            padMap.setAttribute('aria-pressed', state.showMinimap ? 'true' : 'false');
        }
        if (merging && pieces >= 2 && !state.mergeSoundPlayed) {
            state.mergeSoundPlayed = true;
            Sfx.play('mergeHold');
        }
        if (!merging) state.mergeSoundPlayed = false;
    },

    updateCombo() {
        const box = document.getElementById('combo-box');
        const count = document.getElementById('combo-count');
        if (!box || !count) return;
        if (state.combo >= 2) {
            box.classList.remove('hidden');
            count.textContent = state.combo;
        } else {
            box.classList.add('hidden');
        }
    },

    updateKillFeed(combo) {
        const el = document.getElementById('kill-feed');
        if (!el) return;
        const now = performance.now();
        el.innerHTML = state.killFeed.map(entry => {
            const age = now - entry.time;
            const fade = age > 2600 ? ` style="opacity:${age > 3400 ? 0.2 : 0.55}"` : '';
            const cls = entry.isPlayerKill ? 'kill-entry player-kill' : 'kill-entry';
            const comboTag = entry.isPlayerKill && combo >= 2 && entry === state.killFeed[0]
                ? `<span class="combo-tag">x${combo}</span>` : '';
            return `<div class="${cls}"${fade}><span class="killer">${escapeHtml(entry.killer)}</span> ate <span class="victim">${escapeHtml(entry.victim)}</span>${comboTag}</div>`;
        }).join('');
    },

    updateBuffs() {
        const bar = document.getElementById('buff-bar');
        const fx = getOwnerEffects('player');
        const rows = [
            ['buff-speed-row', 'buff-speed-fill', fx.speed, POWERUP_DEFS.speed.duration],
            ['buff-shield-row', 'buff-shield-fill', fx.shield, 1],
            ['buff-magnet-row', 'buff-magnet-fill', fx.magnet, POWERUP_DEFS.magnet.duration]
        ];
        if (!bar || state.playerDead || state.playerWon) {
            bar?.classList.add('hidden');
            return;
        }
        let any = false;
        for (const [rowId, fillId, value, max] of rows) {
            const row = document.getElementById(rowId);
            const fill = document.getElementById(fillId);
            const on = value > 0;
            row?.classList.toggle('hidden', !on);
            if (fill) fill.style.width = on ? Math.max(8, Math.min(100, (value / max) * 100)) + '%' : '0%';
            if (on) any = true;
        }
        bar.classList.toggle('hidden', !any);
    },

    showPowerupToast(type) {
        const el = document.getElementById('powerup-toast');
        const bar = document.getElementById('buff-bar');
        if (!el) return;
        const msgs = {
            speed: 'SPEED ACQUIRED',
            shield: 'SHIELD ONLINE',
            magnet: 'MAGNET ACTIVE',
            shieldBreak: 'SHIELD BROKEN'
        };
        el.textContent = msgs[type] || '';
        el.classList.remove('hidden');
        if (bar && type !== 'shieldBreak') {
            bar.classList.remove('buff-pulse');
            void bar.offsetWidth;
            bar.classList.add('buff-pulse');
            clearTimeout(ui._buffPulseTimer);
            ui._buffPulseTimer = setTimeout(() => bar.classList.remove('buff-pulse'), 460);
        }
        clearTimeout(ui._toastTimer);
        ui._toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
    },

    _toastTimer: null,
    _buffPulseTimer: null
};


/* ───────────────────────────────────────────────────────────────────────────
 *  TABLET PAD — touch aim + round controls. PC mouse/keyboard stay untouched.
 * ─────────────────────────────────────────────────────────────────────────── */

function isTabletDevice() {
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    if (shortSide < 600) return false;
    const ua = navigator.userAgent || '';
    const iPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const androidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
    if (iPad || androidTablet) return true;
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    return (coarse || noHover) && navigator.maxTouchPoints > 0;
}

function setTabletChrome(live) {
    const shown = live && document.body.classList.contains('tablet-mode');
    const pad = document.getElementById('tablet-pad');
    if (pad) {
        pad.classList.toggle('hidden', !live);
        pad.setAttribute('aria-hidden', shown ? 'false' : 'true');
    }
    if (!live) tabletPad.hideStick();
}

function syncTabletMode() {
    const on = isTabletDevice();
    document.documentElement.classList.toggle('tablet-mode', on);
    document.body.classList.toggle('tablet-mode', on);
    if (!on) tabletPad.stop();
}

function padLive() {
    return document.body.classList.contains('tablet-mode')
        && state.playing && !state.playerDead && !state.playerWon;
}

const tabletPad = {
    bound: false,
    splitTimer: 0,
    ejectTimer: 0,

    stop() {
        clearInterval(this.splitTimer);
        clearInterval(this.ejectTimer);
        this.splitTimer = 0;
        this.ejectTimer = 0;
        state.mergePointerHeld = false;
        this.hideStick();
        document.querySelectorAll('#tablet-pad .pressed').forEach(el => el.classList.remove('pressed'));
    },

    hold(id, start, end) {
        const el = document.getElementById(id);
        if (!el) return;
        const finish = () => {
            el.classList.remove('pressed');
            end();
        };
        el.addEventListener('pointerdown', e => {
            if (!padLive()) return;
            e.preventDefault();
            e.stopPropagation();
            try { el.setPointerCapture(e.pointerId); } catch (_) { /* already released */ }
            el.classList.add('pressed');
            start();
        });
        el.addEventListener('pointerup', finish);
        el.addEventListener('pointercancel', finish);
        el.addEventListener('contextmenu', e => e.preventDefault());
    },

    bind() {
        if (this.bound) return;
        this.bound = true;
        this.hold('pad-split', () => {
            game.split();
            clearInterval(this.splitTimer);
            this.splitTimer = setInterval(() => {
                if (!padLive()) {
                    clearInterval(tabletPad.splitTimer);
                    tabletPad.splitTimer = 0;
                    return;
                }
                game.split();
            }, 140);
        }, () => {
            clearInterval(this.splitTimer);
            this.splitTimer = 0;
        });
        this.hold('pad-merge', () => {
            state.mergePointerHeld = true;
        }, () => {
            state.mergePointerHeld = false;
        });
        this.hold('pad-eject', () => {
            game.eject();
            clearInterval(this.ejectTimer);
            this.ejectTimer = setInterval(() => {
                if (!padLive()) {
                    clearInterval(tabletPad.ejectTimer);
                    tabletPad.ejectTimer = 0;
                    return;
                }
                game.eject();
            }, 80);
        }, () => {
            clearInterval(this.ejectTimer);
            this.ejectTimer = 0;
        });
        this.hold('pad-map', () => toggleMinimap(), () => {});
        this.bindStick();
        this.bindTabletGuards();
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) tabletPad.stop();
        });
    },

    hideStick() {
        state.joystick.active = false;
        state.joystick.x = 0;
        state.joystick.y = 0;
        const el = document.getElementById('tablet-stick');
        const knob = document.getElementById('tablet-knob');
        if (knob) knob.style.transform = '';
        if (el) {
            el.classList.remove('shown');
            el.classList.add('hidden');
            el.setAttribute('aria-hidden', 'true');
        }
    },

    bindStick() {
        const el = document.getElementById('tablet-stick');
        const knob = document.getElementById('tablet-knob');
        const canvas = document.getElementById('gameCanvas');
        if (!el || !knob || !canvas) return;
        let pointerId = null;
        let origin = null;

        const place = e => {
            if (!origin) return;
            const max = (el.offsetWidth / 2) - 22;
            let dx = e.clientX - origin.x;
            let dy = e.clientY - origin.y;
            const dist = Math.hypot(dx, dy);
            if (dist > max && max > 0) {
                dx = dx / dist * max;
                dy = dy / dist * max;
            }
            const mag = max > 0 ? Math.min(1, Math.hypot(dx, dy) / max) : 0;
            state.joystick.active = mag > 0.12;
            state.joystick.x = max > 0 ? dx / max : 0;
            state.joystick.y = max > 0 ? dy / max : 0;
            if (state.joystick.active) {
                state.joystick.lastX = state.joystick.x;
                state.joystick.lastY = state.joystick.y;
            }
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const showAt = (clientX, clientY) => {
            el.classList.remove('hidden');
            el.classList.add('shown');
            const size = el.offsetWidth || 108;
            const half = size / 2;
            const x = Math.max(half, Math.min(window.innerWidth - half, clientX));
            const y = Math.max(half, Math.min(window.innerHeight - half, clientY));
            el.style.left = (x - half) + 'px';
            el.style.top = (y - half) + 'px';
            el.setAttribute('aria-hidden', 'false');
            knob.style.transform = '';
            origin = { x, y };
        };

        const end = e => {
            if (pointerId == null || (e && e.pointerId !== pointerId)) return;
            pointerId = null;
            origin = null;
            this.hideStick();
        };

        canvas.addEventListener('pointerdown', e => {
            if (!padLive() || e.pointerType === 'mouse' || pointerId != null) return;
            e.preventDefault();
            pointerId = e.pointerId;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* already gone */ }
            showAt(e.clientX, e.clientY);
            place(e);
        });
        canvas.addEventListener('pointermove', e => {
            if (e.pointerId !== pointerId) return;
            place(e);
        });
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    },

    bindTabletGuards() {
        const blockZoom = e => {
            if (document.documentElement.classList.contains('tablet-mode')) e.preventDefault();
        };
        document.addEventListener('gesturestart', blockZoom, { passive: false });
        document.addEventListener('gesturechange', blockZoom, { passive: false });
        document.addEventListener('touchmove', e => {
            const game = document.getElementById('screen-game');
            if (document.body.classList.contains('tablet-mode') && game && game.classList.contains('active')) {
                e.preventDefault();
            }
        }, { passive: false });
    }
};

window.addEventListener('resize', syncTabletMode);


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
                if (document.body.classList.contains('tablet-mode')) return;
                const r = this.canvas.getBoundingClientRect();
                state.mouse.x = e.clientX - r.left;
                state.mouse.y = e.clientY - r.top;
                state.pointerSeen = true;
            });
            window.addEventListener('keydown', e => {
                state.keys[e.code] = true;
                const live = state.playing && !state.playerDead && !state.playerWon;
                if (live && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault();
                if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.mergeHeld = true;
                if (e.code === 'Space' && live) game.split();
                if (e.code === 'KeyW' && live) game.eject();
                if (e.code === 'KeyM' && state.playing && !e.repeat) toggleMinimap();
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
                tabletPad.stop();
            });
            tabletPad.bind();
            this.resize();
            if (!state.pointerSeen) {
                state.mouse.x = this.canvas.width / 2;
                state.mouse.y = this.canvas.height / 2;
            }
        }
        if (!this.running) {
            this.running = true;
            this.loop();
        }
    },

    resize() {
        syncTabletMode();
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.buffer.width = Math.floor(this.canvas.width * this.pixelScale);
        this.buffer.height = Math.floor(this.canvas.height * this.pixelScale);
    },

    loop(time = 0) {
        if (!this.lastTime) this.lastTime = time;
        const dt = Math.min((time - this.lastTime) / 16.667, 2.5);
        this.lastTime = time;
        try {
            if (state.gameSession) game.update(dt);
            else updateCamera(dt);
            this.draw();
        } catch (err) {
            console.error('Game frame error:', err);
        }
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
        state.powerups.forEach(p => this.drawPowerup(ctx, p));
        state.viruses.forEach(v => this.drawVirus(ctx, v));
        if (!state.playerDead) this.drawMagnetFields(ctx);
        [...state.cells].sort((a, b) => a.mass - b.mass).forEach(c => this.drawCell(ctx, c));
        ctx.restore();

        const out = this.ctx;
        const shake = getShakeOffset();
        out.imageSmoothingEnabled = false;
        out.fillStyle = '#000';
        out.fillRect(0, 0, this.canvas.width, this.canvas.height);
        out.drawImage(
            this.buffer,
            Math.round(shake.x),
            Math.round(shake.y),
            this.canvas.width,
            this.canvas.height
        );
        this.drawMinimap(out);
    },

    drawMinimap(ctx) {
        if (!state.gameSession || !state.showMinimap) return;
        const size = 128;
        const x = 16;
        const y = document.body.classList.contains('tablet-mode')
            ? 12
            : Math.max(8, ctx.canvas.height - size - 12);
        ctx.save();
        ctx.fillStyle = 'rgba(8, 6, 18, 0.9)';
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = '#5ce1ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

        const inner = size - 12;
        const mapX = wx => x + 6 + (wx / WORLD.w) * inner;
        const mapY = wy => y + 6 + (wy / WORLD.h) * inner;

        ctx.fillStyle = '#ff4b6e';
        for (const v of state.viruses) {
            ctx.fillRect(mapX(v.x) - 1, mapY(v.y) - 1, 3, 3);
        }
        for (const c of state.cells) {
            if (!c.alive) continue;
            const px = mapX(c.x);
            const py = mapY(c.y);
            if (c.isPlayer) {
                ctx.fillStyle = '#ff4fd8';
                ctx.fillRect(px - 2, py - 2, 5, 5);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.strokeRect(px - 3, py - 3, 7, 7);
            } else {
                ctx.fillStyle = c.color;
                ctx.fillRect(px - 1, py - 1, 3, 3);
            }
        }
        ctx.restore();
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
        if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) return;
        if (f.eject) {
            this.drawEjectPellet(ctx, f);
            return;
        }
        const r = Math.max(massToRadius(f.mass) * 0.35, 3);
        ctx.fillStyle = f.color;
        ctx.fillRect(Math.floor(f.x - r), Math.floor(f.y - r), Math.ceil(r * 2), Math.ceil(r * 2));
    },

    drawEjectPellet(ctx, f) {
        const r = massToRadius(f.mass) * 0.9;
        const ix = Math.floor(f.x), iy = Math.floor(f.y);
        const ir = Math.ceil(r);
        const pulse = 1 + Math.sin(f.pulse ?? 0) * 0.1;

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.arc(ix + 2, iy + 2, ir * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(ix, iy, ir * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = f.rim || darken(f.color, 45);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix, iy, ir * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = lighten(f.color, 70);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ix, iy, ir * 0.5 * pulse, 0, Math.PI * 2);
        ctx.stroke();
    },

    drawVirus(ctx, v) {
        const r = massToRadius(v.mass);
        const ix = Math.floor(v.x), iy = Math.floor(v.y);
        const spikes = 14;
        const ir = Math.ceil(r);

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        for (let i = 0; i < spikes; i++) {
            const a = (Math.PI * 2 * i) / spikes - Math.PI / 2;
            const rr = i % 2 === 0 ? ir + 4 : ir * 0.72;
            const px = ix + 3 + Math.cos(a) * rr;
            const py = iy + 3 + Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#33ff66';
        ctx.beginPath();
        for (let i = 0; i < spikes; i++) {
            const a = (Math.PI * 2 * i) / spikes - Math.PI / 2;
            const rr = i % 2 === 0 ? ir + 3 : ir * 0.72;
            const px = ix + Math.cos(a) * rr;
            const py = iy + Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#118833';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#004411';
        ctx.beginPath();
        ctx.arc(ix, iy, ir * 0.35, 0, Math.PI * 2);
        ctx.fill();
    },

    drawMagnetFields(ctx) {
        const range = POWERUP_DEFS.magnet.range;
        const owners = new Set();
        state.cells.filter(c => c.alive).forEach(c => owners.add(getOwnerKey(c)));

        owners.forEach(key => {
            const fx = getOwnerEffects(key);
            if (fx.magnet <= 0) return;
            const cells = state.cells.filter(c => c.alive && getOwnerKey(c) === key);
            if (!cells.length) return;
            const anchor = getMergeAnchor(cells);
            const ix = Math.floor(anchor.x), iy = Math.floor(anchor.y);
            ctx.strokeStyle = 'rgba(255, 68, 255, 0.22)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(ix, iy, range, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        });
    },

    drawPowerup(ctx, p) {
        const r = massToRadius(p.mass);
        const ix = Math.floor(p.x), iy = Math.floor(p.y);
        const ir = Math.ceil(r);
        const pulse = 1 + Math.sin(p.pulse) * 0.12;

        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.arc(ix + 2, iy + 2, ir * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(ix, iy, ir * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = p.rim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix, iy, ir * pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = lighten(p.color, 80);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ix, iy, ir * 0.55 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        if (p.type === 'speed') {
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(ix + 3, iy);
            ctx.lineTo(ix - 2, iy - 4);
            ctx.lineTo(ix - 2, iy + 4);
            ctx.fill();
        } else if (p.type === 'shield') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(ix, iy, ir * 0.45, 0, Math.PI * 2);
            ctx.stroke();
        } else if (p.type === 'magnet') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(ix - 1, iy - 3, 2, 6);
            ctx.fillRect(ix - 3, iy - 1, 6, 2);
        }
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
            ctx.strokeStyle = c.isPlayer ? 'rgba(255,79,216,0.55)' : 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(ix, iy, ir + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        const fx = getOwnerEffects(getOwnerKey(c));

        if (fx.shield > 0) {
            ctx.strokeStyle = 'rgba(255, 176, 0, 0.85)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(ix, iy, ir + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ix, iy, ir + 9, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (fx.speed > 0) {
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.55)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(ix, iy, ir + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
            ctx.beginPath();
            ctx.moveTo(ix - ir - 8, iy);
            ctx.lineTo(ix - ir - 2, iy - 4);
            ctx.lineTo(ix - ir - 2, iy + 4);
            ctx.fill();
        }

        if (fx.magnet > 0) {
            ctx.strokeStyle = 'rgba(255, 68, 255, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ix, iy, ir + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (r > 16) {
            ctx.fillStyle = '#000';
            ctx.font = `bold ${Math.min(Math.floor(r * 0.42), 18)}px VT323, monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(c.name || '').toUpperCase(), ix, iy);
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

syncTabletMode();
window.onload = () => {
    syncTabletMode();
    screens.init();
};
