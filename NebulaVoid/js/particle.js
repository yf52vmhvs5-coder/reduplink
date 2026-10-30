/**
 * NEBULA VOID — stardust particles.
 * Singleplayer rolls each mote with Math.random.
 * Mirror matches share one seed: mote id N looks the same on every client.
 * Eating one sends only that id. Motion is a function of match time, not the network.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/particle.js");
    }

    const GAME_SETTINGS = boot.gameSettings;
    const DUST_STEP = 1 / 30;
    const DUST_ID_MAX = 8000000;
    const COLOR_TYPES = [
        { h: 185, s: 100, l: 60 },
        { h: 320, s: 100, l: 65 },
        { h: 270, s: 100, l: 65 },
        { h: 90, s: 100, l: 55 },
        { h: 300, s: 100, l: 60 },
        { h: 50, s: 100, l: 60 },
    ];

    let nextSpawnId = 0;

    function paintMote(p, next, x, y) {
        p.x = x;
        p.y = y;
        p.baseRadius = next() * 3 + 2;
        p.frozen = 0;
        const tone = COLOR_TYPES[Math.floor(next() * COLOR_TYPES.length)];
        p.h = tone.h;
        p.s = tone.s;
        p.l = tone.l;
        p.opacity = next() * 0.4 + 0.5;
        p.basePulse = next() * 6.28;
        p.pulse = p.basePulse;
        p.pulseSpeed = 0.8 + next() * 1.6;
        p.colorString = `hsla(${p.h}, ${p.s}%, ${p.l}%, ${p.opacity})`;
        p.glowColor = `hsl(${p.h}, ${p.s}%, ${p.l}%)`;
        p.active = true;
    }

    class Particle {
        constructor() {
            this.active = false;
            this.spawnId = 0;
            this.dustId = 0;
            this.dustLocked = false;
            this.bornAt = 0;
            this.integrated = 0;
            this.basePulse = 0;
        }

        spawn() {
            this.dustLocked = false;
            this.dustId = 0;
            this.bornAt = 0;
            this.integrated = 0;
            this.spawnId = ++nextSpawnId;
            const x = Math.random() * GAME_SETTINGS.WORLD_SIZE;
            const y = Math.random() * GAME_SETTINGS.WORLD_SIZE;
            paintMote(this, Math.random, x, y);
        }

        draw(ctx, pX, pY, scrW, scrH, dt = 0.016, zoom = 1) {
            if (!this.active) return;
            const halfW = scrW / 2 / zoom + 50;
            const halfH = scrH / 2 / zoom + 50;
            if (Math.abs(this.x - pX) > halfW || Math.abs(this.y - pY) > halfH) return;
            if (!this.dustLocked) this.pulse += this.pulseSpeed * dt;
            let r = this.baseRadius + Math.sin(this.pulse) * 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, r, 0, 6.28);
            if (GAME_SETTINGS.PARTICLE_SHADOW) {
                if (this.frozen > 0) {
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = "#8a2be2";
                    ctx.fillStyle = "#ffffff";
                } else {
                    ctx.shadowBlur = 8;
                    ctx.shadowColor = this.glowColor;
                    ctx.fillStyle = this.colorString;
                }
                ctx.fill();
                ctx.shadowBlur = 0;
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = this.frozen > 0 ? "#ffffff" : this.colorString;
                ctx.fill();
            }
        }
    }

    function mix01(seed, id, salt) {
        let h = (seed >>> 0) ^ Math.imul(id >>> 0, 0x9e3779b1) ^ Math.imul(salt >>> 0, 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
        h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    /** @type {null | (() => unknown[])} */
    let poolGetter = null;
    let fieldOn = false;
    let fieldSeed = 1;
    let fieldEpoch = 0;
    /** @type {Map<number, Particle>} */
    const byId = new Map();
    /** @type {number[]} */
    const localEats = [];

    function stride() {
        return GAME_SETTINGS.MAX_PARTICLES;
    }

    function pool() {
        return poolGetter ? poolGetter() : null;
    }

    function clearPoolActive() {
        const list = pool();
        if (!list) return;
        for (let i = 0; i < list.length; i++) {
            list[i].active = false;
            list[i].dustLocked = false;
            list[i].dustId = 0;
        }
    }

    function spawnShared(id, bornAt) {
        if (byId.has(id)) return byId.get(id);
        const list = pool();
        if (!list || typeof global.getFromPool !== "function") return null;
        const p = global.getFromPool(list);
        if (!p) return null;
        let salt = 1;
        const next = () => mix01(fieldSeed, id, salt++);
        const x = mix01(fieldSeed, id, 20) * GAME_SETTINGS.WORLD_SIZE;
        const y = mix01(fieldSeed, id, 21) * GAME_SETTINGS.WORLD_SIZE;
        paintMote(p, next, x, y);
        p.dustLocked = true;
        p.dustId = id;
        p.spawnId = id;
        p.bornAt = bornAt;
        p.integrated = bornAt;
        p.basePulse = p.pulse;
        byId.set(id, p);
        return p;
    }

    function killAt(id, bornAt) {
        const p = byId.get(id);
        if (!p || !p.active || p.dustId !== id) return false;
        p.active = false;
        p.dustLocked = false;
        p.dustId = 0;
        byId.delete(id);
        const nextId = id + stride();
        if (nextId > 0 && nextId <= DUST_ID_MAX) spawnShared(nextId, bornAt);
        return true;
    }

    function integrateUntil(p, targetSec) {
        const step = DUST_STEP;
        let t = p.integrated;
        if (!(targetSec > t)) return { dead: false, at: 0 };
        const bhX = GAME_SETTINGS.WORLD_SIZE * 0.5;
        const bhY = GAME_SETTINGS.WORLD_SIZE * 0.5;
        const range = GAME_SETTINGS.BH_PARTICLE_PULL_RANGE;
        const rangeSq = range * range;
        const coreSq = GAME_SETTINGS.BH_CORE_RADIUS * GAME_SETTINGS.BH_CORE_RADIUS;
        const pullMax = GAME_SETTINGS.BH_PARTICLE_PULL_SPEED;
        let steps = 0;
        while (t + step <= targetSec && steps < 90) {
            const dx = bhX - p.x;
            const dy = bhY - p.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < coreSq) {
                p.integrated = t;
                return { dead: true, at: t };
            }
            if (dSq < rangeSq && dSq > 1e-8) {
                const dist = Math.sqrt(dSq);
                const fall = 1 - dist / range;
                const pull = fall * fall * pullMax;
                p.x += (dx / dist) * pull * step;
                p.y += (dy / dist) * pull * step;
            }
            t += step;
            steps++;
        }
        p.integrated = t;
        return { dead: false, at: 0 };
    }

    function syncPulse(p, matchSec) {
        const age = Math.max(0, matchSec - p.bornAt);
        p.pulse = p.basePulse + p.pulseSpeed * age;
    }

    function advance(now) {
        if (!fieldOn) return;
        const target = Math.max(0, (now - fieldEpoch) / 1000);
        for (let pass = 0; pass < 4; pass++) {
            /** @type {{ id: number, at: number }[]} */
            const deaths = [];
            for (const [id, p] of byId) {
                if (!p.active || p.dustId !== id) continue;
                syncPulse(p, target);
                if (p.integrated + DUST_STEP > target) continue;
                const fate = integrateUntil(p, target);
                if (fate.dead) deaths.push({ id: id, at: fate.at });
            }
            if (!deaths.length) break;
            for (let i = 0; i < deaths.length; i++) killAt(deaths[i].id, deaths[i].at);
        }
    }

    function begin(seed) {
        const list = pool();
        if (!list) return;
        fieldOn = true;
        fieldSeed = seed >>> 0;
        fieldEpoch = performance.now();
        byId.clear();
        localEats.length = 0;
        clearPoolActive();
        const count = stride();
        for (let id = 1; id <= count; id++) spawnShared(id, 0);
    }

    function end() {
        fieldOn = false;
        byId.clear();
        localEats.length = 0;
        clearPoolActive();
    }

    function consumeLocal(id) {
        if (!fieldOn) return false;
        const matchSec = Math.max(0, (performance.now() - fieldEpoch) / 1000);
        const bornAt = Math.round(matchSec / DUST_STEP) * DUST_STEP;
        if (!killAt(id, bornAt)) return false;
        localEats.push(bornAt);
        localEats.push(id);
        return true;
    }

    function consumeRemote(id, bornAt) {
        if (!fieldOn) return;
        if (!Number.isInteger(id) || id < 1 || id > DUST_ID_MAX) return;
        const at = typeof bornAt === "number" && bornAt >= 0 ? bornAt : 0;
        killAt(id, at);
    }

    function takeLocalEats() {
        if (!localEats.length) return [];
        const out = [];
        for (let i = 0; i + 1 < localEats.length; i += 2) {
            out.push({ id: localEats[i + 1], s: localEats[i] });
        }
        localEats.length = 0;
        return out;
    }

    function restoreLocalEats(batch) {
        if (!batch) return;
        for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            if (!item || !Number.isInteger(item.id)) continue;
            localEats.push(item.s || 0);
            localEats.push(item.id);
        }
    }

    global.Particle = Particle;
    global.NebulaDust = {
        bind(getter) {
            poolGetter = getter;
        },
        isActive() {
            return fieldOn;
        },
        begin,
        end,
        advance,
        consumeLocal,
        consumeRemote,
        takeLocalEats,
        restoreLocalEats,
    };
})(typeof window !== "undefined" ? window : globalThis);
