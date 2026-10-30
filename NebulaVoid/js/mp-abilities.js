/**
 * NEBULA VOID — mirror base abilities (blood rift, void shriek, corrosive dash).
 * One `cast` per Space. The victim applies rift damage locally and confirms it
 * with `riftAck` at 10 Hz; the caster gains half, and only if that cell is near the rift.
 * x1 / x2 / x3 stay singleplayer until they have their own sync.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, Function>} */
    let deps = null;

    const RIFT_ACK_INTERVAL_MS = 100;
    const RIFT_ACK_MAX = 20;
    const RIFT_VALIDATE_SLACK = 160;
    const RIFT_ACK_GRACE_MS = 400;
    const MAX_RIFTS_PER_PEER = 3;
    const GHOST_INTERVAL_SEC = 0.075;
    const MAX_DASH_GHOSTS = 40;

    /** @type {Record<string, { seenSeq: number, shriekBorn: number, dashUntil: number, ghostAcc: number, freezeUntil: number }>} */
    let peerFx = Object.create(null);
    /** @type {{ ownerId: string, x: number, y: number, r: number, lifeSec: number, bornAt: number, expireAt: number }[]} */
    const remoteRifts = [];
    /** @type {{ x: number, y: number, r: number, expireAt: number }[]} */
    const ownRifts = [];
    /** @type {{ ownerId: string, x: number, y: number, r: number, fill: string, glow: string, expireAt: number, fadeMs: number }[]} */
    const dashGhosts = [];
    /** @type {Record<string, number>} */
    let riftDebt = Object.create(null);
    /** @type {Record<string, number>} */
    let riftGrantAt = Object.create(null);

    let castSeq = 0;
    let lastRiftAckAt = 0;
    let ackCursor = 0;

    function configureMirrorAbilities(next) {
        if (!next || typeof next.getPlayer !== "function") {
            throw new Error("configureMirrorAbilities requires getPlayer");
        }
        deps = next;
    }

    function mirrorLive() {
        return !!(
            deps &&
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror"
        );
    }

    function combatLive() {
        if (!mirrorLive()) return false;
        if (typeof deps.getGameActive === "function" && !deps.getGameActive()) return false;
        if (typeof deps.getIsDying === "function" && deps.getIsDying()) return false;
        return true;
    }

    function abilitySettings() {
        if (!deps || typeof deps.getAbilitySettings !== "function") return null;
        return deps.getAbilitySettings();
    }

    function gameSettings() {
        if (!deps || typeof deps.getGameSettings !== "function") return null;
        return deps.getGameSettings();
    }

    function localPeerId() {
        if (deps && typeof deps.getLocalPeerId === "function") {
            const id = deps.getLocalPeerId();
            if (id) return id;
        }
        const api = global.NebulaMpRemotes;
        if (api && typeof api.getLocalPeerId === "function") return api.getLocalPeerId() || "";
        return "";
    }

    function quantize(n) {
        return Math.round(n * 10) / 10;
    }

    function findRemote(id) {
        if (!id || !deps || typeof deps.getRemotePlayers !== "function") return null;
        const list = deps.getRemotePlayers() || [];
        for (let i = 0; i < list.length; i++) {
            if (list[i] && list[i].peerId === id) return list[i];
        }
        const api = global.NebulaMpRemotes;
        if (api && typeof api.getRemotePlayer === "function") return api.getRemotePlayer(id);
        return null;
    }

    function ensureRemote(id) {
        const existing = findRemote(id);
        if (existing) return existing;
        const api = global.NebulaMpRemotes;
        if (api && typeof api.ensureRemotePeer === "function") return api.ensureRemotePeer(id);
        return null;
    }

    function remotePoint(rp) {
        const x = typeof rp.displayX === "number" && Number.isFinite(rp.displayX) ? rp.displayX : rp.x;
        const y = typeof rp.displayY === "number" && Number.isFinite(rp.displayY) ? rp.displayY : rp.y;
        const r =
            typeof rp.displayRadius === "number" && rp.displayRadius > 0 ? rp.displayRadius : rp.radius;
        return { x: x, y: y, r: r };
    }

    function fxFor(id) {
        let fx = peerFx[id];
        if (!fx) {
            fx = { seenSeq: 0, shriekBorn: 0, dashUntil: 0, ghostAcc: 0, freezeUntil: 0 };
            peerFx[id] = fx;
        }
        return fx;
    }

    function sendMirror(payload) {
        const api = global.NebulaMpMirror;
        if (!api || typeof api.send !== "function") return false;
        return api.send(payload) === true;
    }

    function pruneOwnRifts(now) {
        for (let i = ownRifts.length - 1; i >= 0; i--) {
            if (now > ownRifts[i].expireAt + RIFT_ACK_GRACE_MS) ownRifts.splice(i, 1);
        }
    }

    function rememberOwnRift(x, y, settings, now) {
        pruneOwnRifts(now);
        if (ownRifts.length >= MAX_RIFTS_PER_PEER) ownRifts.shift();
        const life = Number(settings.VAMPIRE_RIFT_LIFE) || 0;
        const radius = Number(settings.VAMPIRE_RIFT_RADIUS) || 0;
        if (!(life > 0) || !(radius > 0)) return;
        ownRifts.push({
            x: quantize(x),
            y: quantize(y),
            r: radius,
            expireAt: now + life * 1000,
        });
    }

    function notifyMirrorAbilityCast(kind, x, y) {
        if (!mirrorLive()) return false;
        if (kind !== "vampire" && kind !== "warp" && kind !== "speed") return false;
        if (typeof x !== "number" || typeof y !== "number") return false;
        const settings = abilitySettings();
        if (!settings) return false;
        castSeq += 1;
        if (castSeq > 1e9) castSeq = 1;
        if (kind === "vampire") rememberOwnRift(x, y, settings, performance.now());
        return sendMirror({
            type: "cast",
            kind: kind,
            t: performance.now(),
            x: x,
            y: y,
            seq: castSeq,
        });
    }

    function playRemoteCast(kind) {
        if (kind === "vampire") {
            if (typeof global.playBloodRiftCastSound === "function") global.playBloodRiftCastSound(false);
            return;
        }
        if (typeof global.playAbilitySound === "function") global.playAbilitySound(kind);
    }

    function addRemoteRift(ownerId, x, y, settings, now) {
        const life = Number(settings.VAMPIRE_RIFT_LIFE) || 0;
        const radius = Number(settings.VAMPIRE_RIFT_RADIUS) || 0;
        if (!(life > 0) || !(radius > 0)) return;
        let count = 0;
        let oldest = -1;
        let oldestAt = Infinity;
        for (let i = 0; i < remoteRifts.length; i++) {
            if (remoteRifts[i].ownerId !== ownerId) continue;
            count += 1;
            if (remoteRifts[i].bornAt < oldestAt) {
                oldestAt = remoteRifts[i].bornAt;
                oldest = i;
            }
        }
        if (count >= MAX_RIFTS_PER_PEER && oldest >= 0) remoteRifts.splice(oldest, 1);
        remoteRifts.push({
            ownerId: ownerId,
            x: x,
            y: y,
            r: radius,
            lifeSec: life,
            bornAt: now,
            expireAt: now + life * 1000,
        });
    }

    function onRemoteAbilityCast(msg) {
        if (!mirrorLive() || !msg) return;
        const id = typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        const self = localPeerId();
        if (!id || (self && id === self)) return;
        const kind = msg.kind;
        if (kind !== "vampire" && kind !== "warp" && kind !== "speed") return;
        if (!Number.isInteger(msg.seq) || msg.seq < 1) return;
        const rp = ensureRemote(id);
        if (!rp || rp.arenaOut) return;
        const fx = fxFor(id);
        if (msg.seq <= fx.seenSeq) return;
        fx.seenSeq = msg.seq;
        const settings = abilitySettings();
        if (!settings) return;
        const now = performance.now();
        if (kind === "vampire") {
            if (typeof msg.x !== "number" || typeof msg.y !== "number") return;
            addRemoteRift(id, msg.x, msg.y, settings, now);
        } else if (kind === "warp") {
            fx.shriekBorn = now;
        } else {
            fx.dashUntil = now + (Number(settings.SPEED_DASH_DURATION) || 0) * 1000;
            fx.ghostAcc = 0;
        }
        playRemoteCast(kind);
    }

    function shriekRadius(fx, now, settings) {
        if (!fx.shriekBorn) return 0;
        const expansion = Number(settings.WARP_PULSE_EXPANSION) || 0;
        const maxR = Number(settings.WARP_PULSE_MAX) || 0;
        if (!(expansion > 0) || !(maxR > 0)) return 0;
        const radius = 1 + ((now - fx.shriekBorn) / 1000) * expansion;
        if (radius > maxR) {
            fx.shriekBorn = 0;
            return 0;
        }
        return radius;
    }

    function victimNearOwnRift(peerId, now) {
        const rp = findRemote(peerId);
        if (!rp || rp.arenaOut) return false;
        const pt = remotePoint(rp);
        pruneOwnRifts(now);
        for (let i = 0; i < ownRifts.length; i++) {
            const rift = ownRifts[i];
            const dx = pt.x - rift.x;
            const dy = pt.y - rift.y;
            const reach = rift.r + RIFT_VALIDATE_SLACK;
            if (dx * dx + dy * dy <= reach * reach) return true;
        }
        return false;
    }

    function onRemoteRiftAck(msg) {
        if (!mirrorLive() || !msg) return;
        const self = localPeerId();
        if (!self || msg.ownerPeerId !== self) return;
        const from = typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        if (!from || from === self) return;
        const amount = typeof msg.amount === "number" ? msg.amount : 0;
        if (!(amount > 0) || amount > RIFT_ACK_MAX) return;
        const now = performance.now();
        if (!victimNearOwnRift(from, now)) return;
        const settings = abilitySettings();
        const rules = gameSettings();
        const player = deps.getPlayer();
        if (!settings || !rules || !player) return;
        const dps = Number(settings.VAMPIRE_DAMAGE_BOTS) || 0;
        if (!(dps > 0)) return;
        const last = riftGrantAt[from] || 0;
        const elapsed = last > 0 ? (now - last) / 1000 : 0.12;
        const sec = Math.min(0.45, Math.max(0.05, elapsed));
        const cap = dps * 2 * sec * 1.15;
        const gain = Math.min(amount, cap) * 0.5;
        if (!(gain > 0)) return;
        const maxR = Number(rules.MAX_PLAYER_RADIUS) || player.radius;
        player.radius = Math.min(maxR, player.radius + gain);
        riftGrantAt[from] = now;
    }

    function addDebt(ownerId, loss) {
        if (!ownerId || !(loss > 0)) return;
        riftDebt[ownerId] = (riftDebt[ownerId] || 0) + loss;
    }

    function flushRiftDebt(force) {
        const now = performance.now();
        if (!force && lastRiftAckAt > 0 && now - lastRiftAckAt < RIFT_ACK_INTERVAL_MS) return false;
        const owners = [];
        const ids = Object.keys(riftDebt);
        for (let i = 0; i < ids.length; i++) {
            if (riftDebt[ids[i]] >= 0.01) owners.push(ids[i]);
        }
        if (!owners.length) return false;
        owners.sort();
        const owner = owners[ackCursor % owners.length];
        ackCursor = (ackCursor + 1) % 1000000;
        const amount = Math.min(RIFT_ACK_MAX, Math.round(riftDebt[owner] * 100) / 100);
        if (!(amount > 0)) return false;
        const sent = sendMirror({
            type: "riftAck",
            t: now,
            amount: amount,
            ownerPeerId: owner,
        });
        if (!sent) return false;
        riftDebt[owner] -= amount;
        if (riftDebt[owner] < 0.005) delete riftDebt[owner];
        lastRiftAckAt = now;
        return true;
    }

    function flushRiftDebtAll() {
        const n = Object.keys(riftDebt).length;
        for (let i = 0; i < n; i++) {
            if (!flushRiftDebt(true)) break;
        }
    }

    function killFromRift(ownerId) {
        if (typeof global.noteMirrorAttacker === "function") global.noteMirrorAttacker(ownerId);
        flushRiftDebtAll();
        if (typeof global.playerDeath === "function") global.playerDeath();
    }

    function spawnDashGhost(ownerId, rp, settings, now) {
        const pt = remotePoint(rp);
        if (!(pt.r > 0)) return;
        const fadeMs = (Number(settings.SPEED_DASH_DURATION) || 0.31) * 1000;
        dashGhosts.push({
            ownerId: ownerId,
            x: pt.x,
            y: pt.y,
            r: pt.r,
            fill: typeof rp.color === "string" && rp.color ? rp.color : "#0a0a0a",
            glow: typeof rp.glow === "string" && rp.glow ? rp.glow : "#888888",
            expireAt: now + fadeMs,
            fadeMs: fadeMs,
        });
        if (dashGhosts.length > MAX_DASH_GHOSTS) dashGhosts.shift();
    }

    function tickMirrorAbilities(dt) {
        if (!combatLive()) return false;
        const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
        if (!(step > 0)) return false;
        const settings = abilitySettings();
        const player = deps.getPlayer();
        if (!settings || !player) return false;
        const now = performance.now();
        const effects = typeof deps.getActiveEffects === "function" ? deps.getActiveEffects() : null;
        const list = typeof deps.getRemotePlayers === "function" ? deps.getRemotePlayers() || [] : [];
        const freezeFor = (Number(settings.WARP_FREEZE_DURATION) || 0) * 1000;
        const pulse = effects && typeof effects.shriekPulse === "number" ? effects.shriekPulse : 0;

        const ids = Object.keys(peerFx);
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const fx = peerFx[id];
            const rp = findRemote(id);
            const radius = shriekRadius(fx, now, settings);
            if (radius > 0 && rp && !rp.arenaOut && freezeFor > 0) {
                const pt = remotePoint(rp);
                const dx = player.x - pt.x;
                const dy = player.y - pt.y;
                if (dx * dx + dy * dy < radius * radius) player.mirrorFreezeUntil = now + freezeFor;
            }
            if (rp && !rp.arenaOut && now < fx.dashUntil) {
                fx.ghostAcc += step;
                if (fx.ghostAcc >= GHOST_INTERVAL_SEC) {
                    fx.ghostAcc = 0;
                    spawnDashGhost(id, rp, settings, now);
                }
            } else if (fx.ghostAcc) {
                fx.ghostAcc = 0;
            }
        }

        if (pulse > 0 && freezeFor > 0) {
            for (let i = 0; i < list.length; i++) {
                const rp = list[i];
                if (!rp || !rp.peerId || rp.arenaOut) continue;
                const pt = remotePoint(rp);
                const dx = pt.x - player.x;
                const dy = pt.y - player.y;
                if (dx * dx + dy * dy < pulse * pulse) fxFor(rp.peerId).freezeUntil = now + freezeFor;
            }
        }

        const dps = Number(settings.VAMPIRE_DAMAGE_BOTS) || 0;
        let killedBy = "";
        for (let i = remoteRifts.length - 1; i >= 0; i--) {
            const rift = remoteRifts[i];
            if (now >= rift.expireAt) {
                remoteRifts.splice(i, 1);
                continue;
            }
            if (killedBy || !(dps > 0)) continue;
            const dx = player.x - rift.x;
            const dy = player.y - rift.y;
            if (dx * dx + dy * dy >= rift.r * rift.r) continue;
            const loss = dps * step;
            player.radius -= loss;
            addDebt(rift.ownerId, loss);
            if (typeof global.pulseDamageShake === "function") global.pulseDamageShake(1.6);
            if (player.radius < 5) killedBy = rift.ownerId;
        }

        if (killedBy) {
            killFromRift(killedBy);
            return true;
        }
        flushRiftDebt(false);

        for (let i = dashGhosts.length - 1; i >= 0; i--) {
            if (now >= dashGhosts[i].expireAt) dashGhosts.splice(i, 1);
        }
        return false;
    }

    function clearMirrorPeerAbilities(peerId) {
        const id = String(peerId || "");
        if (!id) return;
        delete peerFx[id];
        delete riftDebt[id];
        delete riftGrantAt[id];
        for (let i = remoteRifts.length - 1; i >= 0; i--) {
            if (remoteRifts[i].ownerId === id) remoteRifts.splice(i, 1);
        }
        for (let i = dashGhosts.length - 1; i >= 0; i--) {
            if (dashGhosts[i].ownerId === id) dashGhosts.splice(i, 1);
        }
    }

    function clearLocalMirrorCasts() {
        ownRifts.length = 0;
        const player = deps && typeof deps.getPlayer === "function" ? deps.getPlayer() : null;
        if (player) player.mirrorFreezeUntil = 0;
    }

    function resetMirrorAbilities() {
        peerFx = Object.create(null);
        remoteRifts.length = 0;
        ownRifts.length = 0;
        dashGhosts.length = 0;
        riftDebt = Object.create(null);
        riftGrantAt = Object.create(null);
        lastRiftAckAt = 0;
        ackCursor = 0;
        castSeq = 0;
        clearLocalMirrorCasts();
    }

    function mirrorPeerFrozen(peerId) {
        const fx = peerFx[peerId];
        return !!(fx && fx.freezeUntil > performance.now());
    }

    function mirrorLocalFrozen() {
        const player = deps && typeof deps.getPlayer === "function" ? deps.getPlayer() : null;
        return !!(player && typeof player.mirrorFreezeUntil === "number" && player.mirrorFreezeUntil > performance.now());
    }

    function drawRift(ctx, rift, timeNow, now) {
        const left = (rift.expireAt - now) / 1000;
        if (!(left > 0)) return;
        const t = Math.max(0, Math.min(1, left / rift.lifeSec));
        const wobble = (Math.sin(timeNow * 0.005) + Math.sin(timeNow * 0.01) * 0.5) * 6;
        const r = rift.r + wobble;
        ctx.save();
        ctx.translate(rift.x, rift.y);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(5,0,0,${0.9 * t})`);
        g.addColorStop(0.4, `rgba(70,0,0,${0.7 * t})`);
        g.addColorStop(0.8, `rgba(180,0,0,${0.4 * t})`);
        g.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, 6.28);
        ctx.fill();
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 20;
        ctx.fillStyle = `rgba(255,30,30,${0.25 * t})`;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.15 + wobble * 0.5, 0, 6.28);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        for (let w = 0; w < 2; w++) {
            const rr = ((timeNow * 0.04) + (w * r) / 2) % r;
            ctx.strokeStyle = `rgba(255,50,50,${(1 - rr / r) * 0.4 * t})`;
            ctx.beginPath();
            ctx.arc(0, 0, rr, 0, 6.28);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawGhost(ctx, ghost, now) {
        if (!(ghost.fadeMs > 0)) return;
        const life = (ghost.expireAt - now) / ghost.fadeMs;
        if (!(life > 0)) return;
        const alpha = life * 0.48;
        const drawR = ghost.r * 0.92;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ghost.glow;
        ctx.fillStyle = ghost.fill;
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y, drawR, 0, 6.28);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = ghost.glow;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y, drawR + 2, 0, 6.28);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1.75;
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y, drawR, 0, 6.28);
        ctx.stroke();
        ctx.restore();
    }

    function drawMirrorAbilityFx(ctx, timeNow, layer) {
        if (!mirrorLive() || !ctx) return;
        const now = performance.now();
        if (layer === "rift") {
            for (let i = 0; i < remoteRifts.length; i++) drawRift(ctx, remoteRifts[i], timeNow, now);
            return;
        }
        if (layer === "ghost") {
            for (let i = 0; i < dashGhosts.length; i++) drawGhost(ctx, dashGhosts[i], now);
            return;
        }
        if (layer !== "shriek") return;
        const settings = abilitySettings();
        if (!settings) return;
        const ids = Object.keys(peerFx);
        for (let i = 0; i < ids.length; i++) {
            const fx = peerFx[ids[i]];
            const radius = shriekRadius(fx, now, settings);
            if (!(radius > 0)) continue;
            const rp = findRemote(ids[i]);
            if (!rp || rp.arenaOut) continue;
            const pt = remotePoint(rp);
            const maxR = Number(settings.WARP_PULSE_MAX) || 1;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, 6.28);
            ctx.strokeStyle = `rgba(138, 43, 226, ${1 - radius / maxR})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    global.configureMirrorAbilities = configureMirrorAbilities;
    global.notifyMirrorAbilityCast = notifyMirrorAbilityCast;
    global.onRemoteAbilityCast = onRemoteAbilityCast;
    global.onRemoteRiftAck = onRemoteRiftAck;
    global.tickMirrorAbilities = tickMirrorAbilities;
    global.clearMirrorPeerAbilities = clearMirrorPeerAbilities;
    global.clearLocalMirrorCasts = clearLocalMirrorCasts;
    global.resetMirrorAbilities = resetMirrorAbilities;
    global.mirrorPeerFrozen = mirrorPeerFrozen;
    global.mirrorLocalFrozen = mirrorLocalFrozen;
    global.drawMirrorAbilityFx = drawMirrorAbilityFx;
})(typeof window !== "undefined" ? window : globalThis);
