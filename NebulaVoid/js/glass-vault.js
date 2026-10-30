/**
 * NEBULA VOID — mirror chambers (replaces jelly in a duel).
 * Shared seed: size, color, and egg spots match on every client.
 * Eggs appear in place, one at a time, until the chamber is full.
 * The relay hears a message only when an egg is eaten.
 * Every client replays the same eat list, so respawn times do not depend on arrival order.
 * Two claims on one egg: the earlier match-time keeps the reward. Peer id breaks a tie.
 * Entering or leaving plays a sound on this client only. Entering also shakes the rectangle.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/glass-vault.js");
    }

    const GAME_SETTINGS = boot.gameSettings;
    const ID_MAX = 8000000;
    const PLACE_TRIES = 64;
    const SHAKE_SEC = 0.18;
    const CHAMBER_GAP = 52;
    /** Gri prăfuit. Radial: 5% culoarea conturului în centru, 13% spre colțuri. */
    const INTERIOR_RGB = [45, 42, 40];
    const INTERIOR_ALPHA = 0.72;
    const INTERIOR_TINT_CORE = 0.05;
    const INTERIOR_TINT_EDGE = 0.21;

    /** Aceleași membrane ca jeleul. Conturul e culoarea asta, plină. */
    const SHELL_COLORS = [
        "rgba(0, 210, 255, 1)",
        "rgba(96, 165, 255, 1)",
        "rgba(148, 118, 255, 1)",
        "rgba(224, 242, 255, 1)",
        "rgba(255, 0, 0, 1)",
        "rgba(57, 255, 20, 1)",
    ];

    /** Aceleași ouă ca în singleplayer. */
    const EGG_COLORS = [
        "#5CB8FF",
        "#6B9FFF",
        "#8B7CF6",
        "#4FD1C5",
        "#7DD3FC",
        "#A5B4FC",
        "#67E8F9",
        "#C4B5FD",
    ];

    let fieldOn = false;
    let fieldSeed = 1;
    let fieldEpoch = 0;
    let stride = 56;
    let appearStepSec = 1.5;
    let eggsPerChamber = 4;
    /** @type {object[]} */
    let chambers = [];
    /** @type {object[]} */
    let slots = [];
    /** @type {number[]} */
    const localEats = [];
    /** @type {{ id: number, at: number, peer: string, local: boolean }[]} */
    let events = [];
    /** @type {Map<number, { radius: number, score: number }>} */
    const grants = new Map();
    /** @type {{ radius: number, score: number }[]} */
    const revoked = [];
    /** Local eats that won the replay. Ids are the generation that was eaten. */
    const wonLocal = new Set();

    function mix01(seed, id, salt) {
        let h = (seed >>> 0) ^ Math.imul(id >>> 0, 0x9e3779b1) ^ Math.imul(salt >>> 0, 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
        h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    function readInt(key, fallback, min, max) {
        const v = GAME_SETTINGS[key];
        if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
        return Math.max(min, Math.min(max, Math.floor(v)));
    }

    function matchSec() {
        return Math.max(0, (performance.now() - fieldEpoch) / 1000);
    }

    function quantize(sec) {
        return Math.round(Math.max(0, sec) * 20) / 20;
    }

    function appearStep() {
        const v = GAME_SETTINGS.JELLY_EGG_SPAWN_RATE;
        if (typeof v !== "number" || !(v > 0)) return 1.5;
        return v;
    }

    function colorOrder(seed, count) {
        const idx = [];
        const n = SHELL_COLORS.length;
        for (let i = 0; i < n; i++) idx.push(i);
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(mix01(seed, 50, i) * (i + 1));
            const swap = idx[i];
            idx[i] = idx[j];
            idx[j] = swap;
        }
        const out = [];
        for (let i = 0; i < count; i++) out.push(idx[i % n]);
        return out;
    }

    function obbSeparated(a, b, pad) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const axes = [
            [a.cos, a.sin],
            [-a.sin, a.cos],
            [b.cos, b.sin],
            [-b.sin, b.cos],
        ];
        for (let i = 0; i < 4; i++) {
            const ax = axes[i][0];
            const ay = axes[i][1];
            const dist = Math.abs(dx * ax + dy * ay);
            const rA = a.hw * Math.abs(ax * a.cos + ay * a.sin) + a.hh * Math.abs(-ax * a.sin + ay * a.cos);
            const rB = b.hw * Math.abs(ax * b.cos + ay * b.sin) + b.hh * Math.abs(-ax * b.sin + ay * b.cos);
            if (dist > rA + rB + pad) return true;
        }
        return false;
    }

    function spotBlocked(placed, spot, world, center, bhKeep) {
        const reach = Math.hypot(spot.hw, spot.hh);
        if (spot.x < reach || spot.y < reach || spot.x > world - reach || spot.y > world - reach) return true;
        const dx = spot.x - center;
        const dy = spot.y - center;
        if (dx * dx + dy * dy < (bhKeep + reach) * (bhKeep + reach)) return true;
        for (let p = 0; p < placed.length; p++) {
            if (!obbSeparated(spot, placed[p], CHAMBER_GAP)) return true;
        }
        return false;
    }

    function buildChambers(seed) {
        const count = readInt("GLASS_VAULT_COUNT", 18, 8, 22);
        const world = GAME_SETTINGS.WORLD_SIZE;
        const center = world * 0.5;
        const bhKeep = 1100;
        const colors = colorOrder(seed, count);
        const placed = [];

        for (let i = 0; i < count; i++) {
            let hw = 128 + mix01(seed, i, 3) * 56;
            let hh = 108 + mix01(seed, i, 4) * 52;
            if (Math.abs(hw - hh) < 24) hh += 28;
            hw = Math.max(128, hw);
            hh = Math.max(108, hh);
            const rot = (mix01(seed, i, 5) - 0.5) * 0.7;
            const cos = Math.cos(rot);
            const sin = Math.sin(rot);
            const color = SHELL_COLORS[colors[i]];
            const edge = Math.hypot(hw, hh) + 16;
            let x = 0;
            let y = 0;
            let found = false;

            function consider(rx, ry) {
                const spot = { x: rx, y: ry, hw: hw, hh: hh, cos: cos, sin: sin };
                if (spotBlocked(placed, spot, world, center, bhKeep)) return false;
                x = rx;
                y = ry;
                found = true;
                return true;
            }

            for (let attempt = 0; attempt < PLACE_TRIES; attempt++) {
                const rx = edge + mix01(seed, i, 10 + attempt) * (world - edge * 2);
                const ry = edge + mix01(seed, i, 80 + attempt) * (world - edge * 2);
                if (consider(rx, ry)) break;
            }

            if (!found) {
                const step = 210;
                const shift = mix01(seed, 4, 9) * 90;
                for (let gy = edge + shift; gy <= world - edge && !found; gy += step) {
                    for (let gx = edge + shift; gx <= world - edge; gx += step) {
                        if (consider(gx, gy)) break;
                    }
                }
            }

            if (!found) continue;

            placed.push({
                n: i,
                x: x,
                y: y,
                hw: hw,
                hh: hh,
                rot: rot,
                cos: cos,
                sin: sin,
                color: color,
                rgb: shellRgb(color),
                phase: mix01(seed, i, 7) * Math.PI * 2,
                inside: false,
                shakeT: 0,
            });
        }
        return placed;
    }

    function eggLocal(chamber, slot, perChamber) {
        const col = slot % 2;
        const row = Math.floor(slot / 2);
        const ax = Math.max(16, chamber.hw - 36);
        const ay = Math.max(16, chamber.hh - 36);
        let xNorm = col === 0 ? -0.46 : 0.46;
        let yNorm = row === 0 ? -0.42 : 0.42;
        let jitter = 0.28;
        // 2×2 stays exactly as shipped. A 5th or 6th egg gets its own row, pulled in so pulses cannot overlap.
        if (perChamber > 4) {
            const rows = Math.ceil(perChamber / 2);
            yNorm = -0.7 + (1.4 * row) / (rows - 1);
            jitter = 0.1;
        }
        const jx = (mix01(fieldSeed, chamber.n + 1, 20 + slot) - 0.5) * ax * jitter;
        const jy = (mix01(fieldSeed, chamber.n + 1, 40 + slot) - 0.5) * ay * jitter;
        return {
            lx: xNorm * ax + jx,
            ly: yNorm * ay + jy,
        };
    }

    function worldOf(chamber, lx, ly) {
        return {
            x: chamber.x + lx * chamber.cos - ly * chamber.sin,
            y: chamber.y + lx * chamber.sin + ly * chamber.cos,
        };
    }

    function shellRgb(css) {
        const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(css);
        if (!match) return INTERIOR_RGB;
        return [Number(match[1]), Number(match[2]), Number(match[3])];
    }

    function interiorStop(rgb, tint) {
        const r = Math.round(INTERIOR_RGB[0] + (rgb[0] - INTERIOR_RGB[0]) * tint);
        const g = Math.round(INTERIOR_RGB[1] + (rgb[1] - INTERIOR_RGB[1]) * tint);
        const b = Math.round(INTERIOR_RGB[2] + (rgb[2] - INTERIOR_RGB[2]) * tint);
        return `rgba(${r}, ${g}, ${b}, ${INTERIOR_ALPHA})`;
    }

    function fillInterior(ctx, chamber) {
        const reach = Math.hypot(chamber.hw, chamber.hh);
        const wash = ctx.createRadialGradient(0, 0, reach * 0.08, 0, 0, reach);
        const rgb = chamber.rgb || INTERIOR_RGB;
        wash.addColorStop(0, interiorStop(rgb, INTERIOR_TINT_CORE));
        wash.addColorStop(1, interiorStop(rgb, INTERIOR_TINT_EDGE));
        ctx.fillStyle = wash;
        ctx.fillRect(-chamber.hw, -chamber.hh, chamber.hw * 2, chamber.hh * 2);
    }

    function eggRadius(slotIndex) {
        return 10 + Math.sin(Date.now() * 0.002 + slotIndex) * 6.5;
    }

    function findSlot(id) {
        for (let i = 0; i < slots.length; i++) {
            if (slots[i].id === id) return slots[i];
        }
        return null;
    }

    function scheduleAppear(chamberIndex, at) {
        let when = at + appearStepSec;
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (slot.chamber !== chamberIndex) continue;
            if (slot.bornAt > at && slot.bornAt + appearStepSec > when) when = slot.bornAt + appearStepSec;
        }
        return when;
    }

    function hideSlot(slot, at) {
        const nextId = slot.id + stride;
        const when = scheduleAppear(slot.chamber, at);
        if (nextId > ID_MAX) {
            slot.dead = true;
            slot.bornAt = when;
            return;
        }
        slot.id = nextId;
        slot.bornAt = when;
    }

    function begin(seed) {
        fieldOn = true;
        fieldSeed = seed >>> 0;
        fieldEpoch = performance.now();
        appearStepSec = appearStep();
        chambers = buildChambers(fieldSeed);
        eggsPerChamber = readInt("GLASS_EGGS_PER", 4, 2, 6);
        stride = chambers.length * eggsPerChamber;
        slots = [];
        localEats.length = 0;
        events = [];
        grants.clear();
        revoked.length = 0;
        wonLocal.clear();
        for (let c = 0; c < chambers.length; c++) {
            const chamber = chambers[c];
            const lead = mix01(fieldSeed, c, 11) * appearStepSec;
            for (let s = 0; s < eggsPerChamber; s++) {
                const local = eggLocal(chamber, s, eggsPerChamber);
                const bornAt = lead + s * appearStepSec;
                const id = c * eggsPerChamber + s + 1;
                slots.push({
                    id: id,
                    baseId: id,
                    bornAt: bornAt,
                    baseBorn: bornAt,
                    chamber: c,
                    slot: s,
                    dead: false,
                    lx: local.lx,
                    ly: local.ly,
                    color: EGG_COLORS[Math.floor(mix01(fieldSeed, c + 1, 60 + s) * EGG_COLORS.length)],
                });
            }
        }
    }

    function end() {
        fieldOn = false;
        chambers = [];
        slots = [];
        localEats.length = 0;
        events = [];
        grants.clear();
        revoked.length = 0;
        wonLocal.clear();
    }

    /** Death respawn teleports the body. Do not play an exit for the chamber it left behind. */
    function forgetPresence() {
        for (let i = 0; i < chambers.length; i++) {
            chambers[i].inside = false;
            chambers[i].shakeT = 0;
        }
    }

    /** The new life starts at the spawn radius and score. Pending undos belong to the body that died. */
    function discardBodyGrants() {
        grants.clear();
        revoked.length = 0;
    }

    function circleHitsRect(chamber, px, py, pr) {
        const dx = px - chamber.x;
        const dy = py - chamber.y;
        const lx = dx * chamber.cos + dy * chamber.sin;
        const ly = -dx * chamber.sin + dy * chamber.cos;
        const cx = Math.max(-chamber.hw, Math.min(chamber.hw, lx));
        const cy = Math.max(-chamber.hh, Math.min(chamber.hh, ly));
        const ddx = lx - cx;
        const ddy = ly - cy;
        return ddx * ddx + ddy * ddy < pr * pr;
    }

    function tick(dt, player) {
        if (!fieldOn || !player) return;
        const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
        for (let i = 0; i < chambers.length; i++) {
            const chamber = chambers[i];
            if (chamber.shakeT > 0) chamber.shakeT = Math.max(0, chamber.shakeT - step);
            const inside = circleHitsRect(chamber, player.x, player.y, player.radius);
            if (inside && !chamber.inside) {
                chamber.shakeT = SHAKE_SEC;
                if (typeof global.playGlassEnterSound === "function") global.playGlassEnterSound();
            } else if (!inside && chamber.inside) {
                chamber.shakeT = SHAKE_SEC;
                if (typeof global.playGlassExitSound === "function") global.playGlassExitSound();
            }
            chamber.inside = inside;
        }
    }

    function visitAlive(fn) {
        if (!fieldOn) return;
        const t = matchSec();
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (slot.dead || t < slot.bornAt) continue;
            const chamber = chambers[slot.chamber];
            if (!chamber) continue;
            const at = worldOf(chamber, slot.lx, slot.ly);
            fn({ id: slot.id, x: at.x, y: at.y, r: eggRadius(slot.slot) });
        }
    }

    function localPeer() {
        const remotes = global.NebulaMpRemotes;
        if (remotes && typeof remotes.getLocalPeerId === "function") {
            const id = remotes.getLocalPeerId();
            if (typeof id === "string" && id) return id;
        }
        const mirror = global.NebulaMpMirror;
        if (mirror && typeof mirror.getMirrorSession === "function") {
            const sess = mirror.getMirrorSession();
            if (sess && typeof sess.peerId === "string" && sess.peerId) return sess.peerId;
        }
        return "";
    }

    function hasEvent(id, peer) {
        for (let i = 0; i < events.length; i++) {
            if (events[i].id === id && events[i].peer === peer) return true;
        }
        return false;
    }

    function compareEat(a, b) {
        if (a.at !== b.at) return a.at < b.at ? -1 : 1;
        if (a.peer !== b.peer) return a.peer < b.peer ? -1 : 1;
        if (a.id !== b.id) return a.id < b.id ? -1 : 1;
        return 0;
    }

    /**
     * Replay from the opening eggs. Sort is (time, peer, id), then a later generation
     * whose message arrived first is applied on the next pass once its parent exists.
     * The sender's match-time is kept as sent — rewriting it to the local clock
     * makes the two clients schedule different respawns.
     */
    function reconcile() {
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            slot.dead = false;
            slot.id = slot.baseId;
            slot.bornAt = slot.baseBorn;
        }
        const ordered = events.slice().sort(compareEat);
        const applied = new Set();
        wonLocal.clear();
        const limit = ordered.length;
        for (let pass = 0; pass < limit; pass++) {
            let progressed = false;
            for (let i = 0; i < ordered.length; i++) {
                const ev = ordered[i];
                if (applied.has(ev)) continue;
                const slot = findSlot(ev.id);
                if (!slot || slot.dead) continue;
                hideSlot(slot, ev.at);
                applied.add(ev);
                if (ev.local) wonLocal.add(ev.id);
                progressed = true;
            }
            if (!progressed) break;
        }
        const stale = [];
        grants.forEach((_g, id) => {
            if (!wonLocal.has(id)) stale.push(id);
        });
        for (let i = 0; i < stale.length; i++) {
            const id = stale[i];
            revoked.push(grants.get(id));
            grants.delete(id);
        }
    }

    function consumeLocal(id) {
        if (!fieldOn) return false;
        if (!Number.isInteger(id) || id < 1 || id > ID_MAX) return false;
        const peer = localPeer();
        if (hasEvent(id, peer)) return false;
        const slot = findSlot(id);
        if (!slot || slot.dead || matchSec() < slot.bornAt) return false;
        const at = quantize(matchSec());
        events.push({ id: id, at: at, peer: peer, local: true });
        localEats.push(at);
        localEats.push(id);
        reconcile();
        return wonLocal.has(id);
    }

    function consumeRemote(id, at, peerId) {
        if (!fieldOn) return;
        if (!Number.isInteger(id) || id < 1 || id > ID_MAX) return;
        if (typeof at !== "number" || !Number.isFinite(at) || at < 0) return;
        const peer = typeof peerId === "string" ? peerId : "";
        if (hasEvent(id, peer)) return;
        events.push({ id: id, at: at, peer: peer, local: false });
        reconcile();
    }

    function noteLocalGrant(id, radius, score) {
        if (!fieldOn || !Number.isInteger(id)) return;
        const radiusAdded = Number(radius);
        const scoreAdded = Number(score);
        if (!Number.isFinite(radiusAdded) || !Number.isFinite(scoreAdded)) return;
        if (radiusAdded < 0 || scoreAdded < 0) return;
        if (!wonLocal.has(id)) {
            revoked.push({ radius: radiusAdded, score: scoreAdded });
            return;
        }
        grants.set(id, { radius: radiusAdded, score: scoreAdded });
    }

    function takeRevokedGrants() {
        if (!revoked.length) return [];
        const out = revoked.slice();
        revoked.length = 0;
        return out;
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

    function draw(ctx, camX, camY, viewDist, timeNow) {
        if (!fieldOn || !ctx) return;
        const t = matchSec();
        const now = typeof timeNow === "number" ? timeNow : Date.now();
        const pulseGlow = 15 + Math.sin(now * 0.005) * 10;
        const limit = (viewDist || 800) + 340;
        const limitSq = limit * limit;

        for (let i = 0; i < chambers.length; i++) {
            const chamber = chambers[i];
            const dx = chamber.x - camX;
            const dy = chamber.y - camY;
            if (dx * dx + dy * dy > limitSq) continue;

            let shakeX = 0;
            let shakeY = 0;
            if (chamber.shakeT > 0) {
                const amp = 4.2 * (chamber.shakeT / SHAKE_SEC);
                shakeX = (Math.random() * 2 - 1) * amp;
                shakeY = (Math.random() * 2 - 1) * amp;
            }

            ctx.save();
            ctx.translate(chamber.x + shakeX, chamber.y + shakeY);
            ctx.rotate(chamber.rot);

            fillInterior(ctx, chamber);

            const barrier = chamber.color;
            ctx.strokeStyle = barrier;
            ctx.lineWidth = 12;
            ctx.shadowBlur = pulseGlow;
            ctx.shadowColor = barrier;
            ctx.strokeRect(-chamber.hw, -chamber.hh, chamber.hw * 2, chamber.hh * 2);
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = barrier;
            ctx.shadowBlur = 0;
            const margin = 10;
            ctx.strokeRect(
                -chamber.hw + margin,
                -chamber.hh + margin,
                chamber.hw * 2 - margin * 2,
                chamber.hh * 2 - margin * 2
            );
            ctx.globalAlpha = 1;

            for (let s = 0; s < slots.length; s++) {
                const slot = slots[s];
                if (slot.chamber !== i || slot.dead || t < slot.bornAt) continue;
                const r = eggRadius(slot.slot);
                ctx.beginPath();
                ctx.arc(slot.lx, slot.ly, r, 0, Math.PI * 2);
                ctx.fillStyle = slot.color;
                ctx.shadowBlur = 12;
                ctx.shadowColor = slot.color;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            ctx.restore();
        }
    }

    global.NebulaGlass = {
        isActive() {
            return fieldOn;
        },
        begin,
        end,
        tick,
        visitAlive,
        consumeLocal,
        consumeRemote,
        noteLocalGrant,
        takeRevokedGrants,
        forgetPresence,
        discardBodyGrants,
        takeLocalEats,
        restoreLocalEats,
        draw,
    };
})(typeof window !== "undefined" ? window : globalThis);
