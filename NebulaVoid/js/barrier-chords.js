/**
 * NEBULA VOID — singleplayer arena chords.
 * One edge-to-edge stroke, any angle, same breath as the map barrier.
 * A body loses 1px of radius once per chord. Sparks are visual only.
 */
(function (global) {
    "use strict";

    const MAX_CHORDS = 2;
    const FIRST_DELAY = 2;
    const GAP_MIN = 2.4;
    const GAP_SPAN = 1.6;
    const LIFE_MIN = 0.78;
    const LIFE_SPAN = 0.32;
    const LINE_WIDTH = 5;
    const BARRIER_LIP = 11;
    const RADIUS_LOSS = 1;
    const SPARK_COUNT = 9;
    const MIN_CHORD = 160;
    const PLAYER_HIT = {};

    const chords = [];
    const sparks = Array.from({ length: 96 }, () => ({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        r: 1,
        color: "#fff",
    }));

    let spawnIn = FIRST_DELAY;
    let arenaSize = 0;
    let nextToneId = 1;
    let mirrorOn = false;
    let mirrorSeed = 0;
    let mirrorEpoch = 0;
    let mirrorCursor = FIRST_DELAY;
    let mirrorSerial = 0;

    const MIRROR_TONE_KEYS = [
        "TITAN",
        "GLITCH",
        "PULSAR",
        "NECROMANCER",
        "GRAVITY_WELL",
        "ARCHITECT",
        "WORMHOLE",
        "CHRONOS",
        "NEBULA",
        "MIMIC",
    ];
    const MIRROR_TONE_FALLBACK = [
        "#F5F5F5",
        "#00FF7F",
        "#FFFF00",
        "#32CD32",
        "#8A2BE2",
        "#FFD700",
        "#FF4500",
        "#00BFFF",
        "#4B0082",
        "#A9A9A9",
    ];

    function isSolo() {
        const mode = global.NebulaGameMode;
        return !mode || typeof mode.getRunMode !== "function" || mode.getRunMode() !== "mirror";
    }

    function botSeenColor(bot) {
        if (bot.isInvulnerable) return "#FFFFFF";
        if (bot.mimicTimer > 0 && bot.mimicColor) return bot.mimicColor;
        return bot.color || "#ffffff";
    }

    function pickColor(player, poolBots) {
        const choices = [];
        if (player && typeof player.glow === "string" && player.glow) choices.push(player.glow);
        if (poolBots) {
            for (let i = 0; i < poolBots.length; i++) {
                const bot = poolBots[i];
                if (bot && bot.active) choices.push(botSeenColor(bot));
            }
        }
        if (choices.length === 0) return "#ffffff";
        return choices[(Math.random() * choices.length) | 0];
    }

    function rayToBorder(x, y, dx, dy, world) {
        let t = Infinity;
        if (dx > 1e-6) t = Math.min(t, (world - x) / dx);
        else if (dx < -1e-6) t = Math.min(t, (0 - x) / dx);
        if (dy > 1e-6) t = Math.min(t, (world - y) / dy);
        else if (dy < -1e-6) t = Math.min(t, (0 - y) / dy);
        if (!Number.isFinite(t) || t < 0) t = 0;
        return {
            x: Math.max(0, Math.min(world, x + dx * t)),
            y: Math.max(0, Math.min(world, y + dy * t)),
        };
    }

    function takeSpark() {
        for (let i = 0; i < sparks.length; i++) {
            if (!sparks[i].active) return sparks[i];
        }
        return null;
    }

    function burst(x, y, nx, ny, ux, uy, color, spread) {
        const span = spread > 0 ? spread : 8;
        for (let i = 0; i < SPARK_COUNT; i++) {
            const spark = takeSpark();
            if (!spark) return;
            const side = i % 2 === 0 ? 1 : -1;
            const speed = 90 + Math.random() * 150;
            const along = (Math.random() - 0.5) * span;
            const tangent = (Math.random() - 0.5) * 70;
            spark.active = true;
            spark.x = x + ux * along;
            spark.y = y + uy * along;
            spark.vx = nx * side * speed + ux * tangent;
            spark.vy = ny * side * speed + uy * tangent;
            spark.r = 1.3 + Math.random() * 1.6;
            spark.maxLife = 0.28 + Math.random() * 0.18;
            spark.life = spark.maxLife;
            spark.color = color;
        }
    }

    function touch(px, py, chord) {
        let t = ((px - chord.x1) * chord.dx + (py - chord.y1) * chord.dy) * chord.invLenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const cx = chord.x1 + chord.dx * t;
        const cy = chord.y1 + chord.dy * t;
        const ox = px - cx;
        const oy = py - cy;
        const dist = Math.hypot(ox, oy);
        let nx;
        let ny;
        if (dist > 0.001) {
            nx = ox / dist;
            ny = oy / dist;
        } else {
            nx = -chord.uy;
            ny = chord.ux;
        }
        return { dist: dist, cx: cx, cy: cy, nx: nx, ny: ny };
    }

    function pointInRect(x, y, rect) {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
        const abx = bx - ax;
        const aby = by - ay;
        const cdx = dx - cx;
        const cdy = dy - cy;
        const denom = abx * cdy - aby * cdx;
        if (denom === 0) return false;
        const t = ((cx - ax) * cdy - (cy - ay) * cdx) / denom;
        const u = ((cx - ax) * aby - (cy - ay) * abx) / denom;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    function segmentHitsRect(x1, y1, x2, y2, rect) {
        if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
        return (
            segmentsCross(x1, y1, x2, y2, rect.left, rect.top, rect.right, rect.top) ||
            segmentsCross(x1, y1, x2, y2, rect.right, rect.top, rect.right, rect.bottom) ||
            segmentsCross(x1, y1, x2, y2, rect.right, rect.bottom, rect.left, rect.bottom) ||
            segmentsCross(x1, y1, x2, y2, rect.left, rect.bottom, rect.left, rect.top)
        );
    }

    /** 0 dacă linia nu taie ecranul. Altfel 1 lângă cameră, ~0.38 la margine. */
    function chordAudibility(chord, view) {
        if (!view || !(view.reach > 0)) return 0;
        const pad = 24;
        const rect = {
            left: view.left - pad,
            right: view.right + pad,
            top: view.top - pad,
            bottom: view.bottom + pad,
        };
        if (!segmentHitsRect(chord.x1, chord.y1, chord.x2, chord.y2, rect)) return 0;
        const near = touch(view.cx, view.cy, chord);
        const along = Math.min(1, near.dist / view.reach);
        return 0.38 + 0.62 * (1 - along * along);
    }

    function makeChord(x1, y1, x2, y2, player, poolBots) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const life = LIFE_MIN + Math.random() * LIFE_SPAN;
        return {
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
            dx: dx,
            dy: dy,
            invLenSq: 1 / (len * len),
            ux: dx / len,
            uy: dy / len,
            color: pickColor(player, poolBots),
            life: life,
            toneId: nextToneId++,
            hit: new Set(),
        };
    }

    /** Linia trece prin cadru și iese pe marginea hărții, sub barieră. */
    function spawnChord(player, poolBots, world, view) {
        if (!view || !(view.reach > 0) || !(world > 0)) return false;
        const spanX = Math.max(24, view.right - view.left);
        const spanY = Math.max(24, view.bottom - view.top);
        for (let attempt = 0; attempt < 6; attempt++) {
            const ax = Math.max(1, Math.min(world - 1, view.left + Math.random() * spanX));
            const ay = Math.max(1, Math.min(world - 1, view.top + Math.random() * spanY));
            const ang = Math.random() * Math.PI;
            const dx = Math.cos(ang);
            const dy = Math.sin(ang);
            const a = rayToBorder(ax, ay, dx, dy, world);
            const b = rayToBorder(ax, ay, -dx, -dy, world);
            if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_CHORD) continue;
            const chord = makeChord(a.x, a.y, b.x, b.y, player, poolBots);
            if (chordAudibility(chord, view) <= 0) continue;
            chords.push(chord);
            return true;
        }
        return false;
    }

    function chordToneLevel(chord, view) {
        const fade = Math.min(1, chord.life / 0.22);
        return fade * chordAudibility(chord, view);
    }

    function publishChordTones(view) {
        if (typeof global.syncChordTones !== "function") return;
        const entries = [];
        for (let i = 0; i < chords.length; i++) {
            const chord = chords[i];
            entries.push({ id: chord.toneId, level: chordToneLevel(chord, view) });
        }
        global.syncChordTones(entries);
    }

    function dropChords() {
        chords.length = 0;
        publishChordTones(null);
    }

    function stepSparks(dt) {
        for (let i = 0; i < sparks.length; i++) {
            const spark = sparks[i];
            if (!spark.active) continue;
            spark.life -= dt;
            if (spark.life <= 0) {
                spark.active = false;
                continue;
            }
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            const drag = Math.pow(0.9, dt * 60);
            spark.vx *= drag;
            spark.vy *= drag;
        }
    }

    function mix01(seed, id, salt) {
        let h = (seed >>> 0) ^ Math.imul(id >>> 0, 0x9e3779b1) ^ Math.imul(salt >>> 0, 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
        h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    function mirrorPalette() {
        const boot = global.__GAME_BOOT;
        const types = boot && boot.entityTypes;
        const out = [];
        for (let i = 0; i < MIRROR_TONE_KEYS.length; i++) {
            const row = types && types[MIRROR_TONE_KEYS[i]];
            if (row && typeof row.color === "string" && row.color) out.push(row.color);
            else out.push(MIRROR_TONE_FALLBACK[i]);
        }
        return out;
    }

    function mirrorMatchSec() {
        return Math.max(0, (performance.now() - mirrorEpoch) / 1000);
    }

    function makeSeededChord(serial, world, start, life) {
        let chord = null;
        for (let attempt = 0; attempt < 6 && !chord; attempt++) {
            const x = 1 + mix01(mirrorSeed, serial, 1 + attempt) * (world - 2);
            const y = 1 + mix01(mirrorSeed, serial, 20 + attempt) * (world - 2);
            const ang = mix01(mirrorSeed, serial, 40 + attempt) * Math.PI;
            const dx = Math.cos(ang);
            const dy = Math.sin(ang);
            const a = rayToBorder(x, y, dx, dy, world);
            const b = rayToBorder(x, y, -dx, -dy, world);
            if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_CHORD) continue;
            const dxL = b.x - a.x;
            const dyL = b.y - a.y;
            const len = Math.hypot(dxL, dyL) || 1;
            const palette = mirrorPalette();
            const color = palette[(mix01(mirrorSeed, serial, 7) * palette.length) | 0];
            chord = {
                x1: a.x,
                y1: a.y,
                x2: b.x,
                y2: b.y,
                dx: dxL,
                dy: dyL,
                invLenSq: 1 / (len * len),
                ux: dxL / len,
                uy: dyL / len,
                color: color,
                life: life,
                end: start + life,
                toneId: serial + 1,
                hit: new Set(),
            };
        }
        return chord;
    }

    function catchMirrorChords(now, world) {
        let guard = 0;
        while (mirrorCursor <= now && guard < 4000) {
            guard++;
            const life = LIFE_MIN + mix01(mirrorSeed, mirrorSerial, 5) * LIFE_SPAN;
            const start = mirrorCursor;
            const gap = GAP_MIN + mix01(mirrorSeed, mirrorSerial, 6) * GAP_SPAN;
            if (start + life > now && chords.length < MAX_CHORDS) {
                const chord = makeSeededChord(mirrorSerial, world, start, life);
                if (chord) chords.push(chord);
            }
            mirrorSerial++;
            mirrorCursor = start + gap;
        }
        for (let i = 0; i < chords.length; i++) {
            chords[i].life = chords[i].end - now;
        }
    }

    function mirrorRemotes() {
        const api = global.NebulaMpRemotes;
        if (!api || typeof api.getRemotePlayers !== "function") return [];
        const list = api.getRemotePlayers();
        return list || [];
    }

    function cutLocalPlayer(chord, player) {
        if (chord.hit.has(PLAYER_HIT)) return false;
        const hit = touch(player.x, player.y, chord);
        if (hit.dist > player.radius) return false;
        chord.hit.add(PLAYER_HIT);
        burst(hit.cx, hit.cy, hit.nx, hit.ny, chord.ux, chord.uy, player.glow || "#ffffff", player.radius);
        player.radius -= RADIUS_LOSS;
        if (typeof global.pulseChordCutShake === "function") global.pulseChordCutShake();
        if (typeof global.playChordCutSound === "function") global.playChordCutSound();
        if (player.radius < 5) {
            dropChords();
            if (typeof global.playerDeath === "function") global.playerDeath();
            return true;
        }
        return false;
    }

    function sparkRemote(chord, rp) {
        const id = rp && typeof rp.peerId === "string" ? rp.peerId : "";
        if (!id || chord.hit.has(id) || rp.arenaOut || rp.active === false) return;
        const x = typeof rp.displayX === "number" && Number.isFinite(rp.displayX) ? rp.displayX : rp.x;
        const y = typeof rp.displayY === "number" && Number.isFinite(rp.displayY) ? rp.displayY : rp.y;
        const r = typeof rp.displayRadius === "number" && rp.displayRadius > 0 ? rp.displayRadius : rp.radius;
        if (!(r > 0) || typeof x !== "number" || typeof y !== "number") return;
        const hit = touch(x, y, chord);
        if (hit.dist > r) return;
        chord.hit.add(id);
        burst(hit.cx, hit.cy, hit.nx, hit.ny, chord.ux, chord.uy, rp.glow || chord.color, r);
    }

    function tickMirrorChords(dt, player, worldSize, view) {
        if (!player || !(worldSize > 0) || !(dt > 0)) return false;
        arenaSize = worldSize;
        stepSparks(dt);
        const now = mirrorMatchSec();
        catchMirrorChords(now, worldSize);
        for (let i = chords.length - 1; i >= 0; i--) {
            const chord = chords[i];
            if (cutLocalPlayer(chord, player)) return true;
            const remotes = mirrorRemotes();
            for (let r = 0; r < remotes.length; r++) sparkRemote(chord, remotes[r]);
        }
        for (let i = chords.length - 1; i >= 0; i--) {
            if (chords[i].life <= 0) chords.splice(i, 1);
        }
        publishChordTones(view);
        return false;
    }

    function beginMirrorChords(seed) {
        mirrorOn = true;
        mirrorSeed = seed >>> 0;
        mirrorEpoch = performance.now();
        mirrorCursor = FIRST_DELAY;
        mirrorSerial = 0;
        chords.length = 0;
        spawnIn = FIRST_DELAY;
        for (let i = 0; i < sparks.length; i++) sparks[i].active = false;
        publishChordTones(null);
    }

    function clearBarrierChords() {
        mirrorOn = false;
        dropChords();
        spawnIn = FIRST_DELAY;
        for (let i = 0; i < sparks.length; i++) sparks[i].active = false;
    }

    /**
     * @returns {boolean} true când jucătorul moare și cadrul trebuie oprit
     */
    function tickBarrierChords(dt, player, poolBots, poolNutrients, worldSize, view) {
        if (mirrorOn) return tickMirrorChords(dt, player, worldSize, view);
        if (!isSolo()) {
            clearBarrierChords();
            return false;
        }
        if (!player || !(worldSize > 0) || !(dt > 0)) return false;

        arenaSize = worldSize;
        stepSparks(dt);

        for (let i = chords.length - 1; i >= 0; i--) {
            const chord = chords[i];
            if (!chord.hit.has(PLAYER_HIT)) {
                const hit = touch(player.x, player.y, chord);
                if (hit.dist <= player.radius) {
                    chord.hit.add(PLAYER_HIT);
                    burst(hit.cx, hit.cy, hit.nx, hit.ny, chord.ux, chord.uy, player.glow || "#ffffff", player.radius);
                    player.radius -= RADIUS_LOSS;
                    if (typeof global.pulseChordCutShake === "function") global.pulseChordCutShake();
                    if (typeof global.playChordCutSound === "function") global.playChordCutSound();
                    if (player.radius < 5) {
                        dropChords();
                        if (typeof global.playerDeath === "function") global.playerDeath();
                        return true;
                    }
                }
            }

            if (!poolBots) continue;
            for (let b = 0; b < poolBots.length; b++) {
                const bot = poolBots[b];
                if (!bot || !bot.active || chord.hit.has(bot)) continue;
                const hit = touch(bot.x, bot.y, chord);
                if (hit.dist > bot.radius) continue;
                chord.hit.add(bot);
                burst(hit.cx, hit.cy, hit.nx, hit.ny, chord.ux, chord.uy, botSeenColor(bot), bot.radius);
                if (bot.isInvulnerable) continue;
                bot.radius -= RADIUS_LOSS;
                if (bot.radius < 5) {
                    if (typeof global.onBotKilled === "function") global.onBotKilled(bot);
                    if (typeof bot.explode === "function") bot.explode(poolNutrients);
                }
            }
        }

        for (let i = chords.length - 1; i >= 0; i--) {
            chords[i].life -= dt;
            if (chords[i].life <= 0) chords.splice(i, 1);
        }

        spawnIn -= dt;
        if (spawnIn <= 0 && chords.length < MAX_CHORDS) {
            const placed = spawnChord(player, poolBots, worldSize, view);
            spawnIn = placed ? GAP_MIN + Math.random() * GAP_SPAN : 0.35;
        }
        publishChordTones(view);
        return false;
    }

    function drawBarrierChords(ctx, timeNow, dt, integrateSparks) {
        if (!mirrorOn && !isSolo()) return false;
        if (integrateSparks && dt > 0) stepSparks(dt);

        const pulse = 15 + Math.sin(timeNow * 0.005) * 10;
        let drew = false;
        ctx.save();
        if (arenaSize > 0) {
            ctx.beginPath();
            ctx.rect(
                BARRIER_LIP,
                BARRIER_LIP,
                Math.max(0, arenaSize - BARRIER_LIP * 2),
                Math.max(0, arenaSize - BARRIER_LIP * 2)
            );
            ctx.clip();
        }
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineCap = "butt";
        for (let i = 0; i < chords.length; i++) {
            const chord = chords[i];
            const alpha = Math.min(1, chord.life / 0.22);
            if (alpha <= 0) continue;
            drew = true;
            ctx.beginPath();
            ctx.moveTo(chord.x1, chord.y1);
            ctx.lineTo(chord.x2, chord.y2);
            ctx.strokeStyle = chord.color;
            ctx.shadowBlur = pulse;
            ctx.shadowColor = chord.color;
            ctx.globalAlpha = alpha;
            ctx.stroke();
        }
        ctx.restore();
        ctx.save();

        ctx.shadowBlur = 8;
        ctx.lineWidth = 1;
        for (let i = 0; i < sparks.length; i++) {
            const spark = sparks[i];
            if (!spark.active) continue;
            ctx.globalAlpha = Math.max(0, spark.life / spark.maxLife);
            ctx.fillStyle = spark.color;
            ctx.shadowColor = spark.color;
            ctx.beginPath();
            ctx.arc(spark.x, spark.y, spark.r, 0, 6.28);
            ctx.fill();
        }
        ctx.restore();
        return drew;
    }

    global.beginMirrorChords = beginMirrorChords;
    global.clearBarrierChords = clearBarrierChords;
    global.tickBarrierChords = tickBarrierChords;
    global.drawBarrierChords = drawBarrierChords;
})(typeof window !== "undefined" ? window : globalThis);
