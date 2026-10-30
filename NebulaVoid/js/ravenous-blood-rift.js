/**
 * NEBULA VOID — Ravenous Blood Rift feature pack:
 * organic bolt visuals, homing rift (x1), siphon bolts (x2).
 * Load after config-loader.js. Wire via configureBloodRift / configureBloodRiftSiphons from entities.js.
 */
(function (global) {
    "use strict";

    // -------------------------------------------------------------------------
    // Organic siphon / tentacle bolts (shared visuals)
    // -------------------------------------------------------------------------

    const ORGANIC_BOLT_PRESETS = {
        phase: {
            shadowColor: "rgba(100, 180, 255, 0.85)",
            outerBlur: 12,
            midBlur: 5,
            outerWidth: 4.5,
            midWidth: 2,
            coreWidth: 0.85,
            outer: [120, 200, 255],
            mid: [61, 165, 255],
            core: [230, 248, 255],
            outerA: 0.32,
            midA: 0.7,
            coreA: 0.5,
        },
        blood: {
            shadowColor: "rgba(255, 40, 60, 0.9)",
            outerBlur: 14,
            midBlur: 6,
            outerWidth: 5,
            midWidth: 2.2,
            coreWidth: 0.9,
            outer: [255, 120, 130],
            mid: [255, 30, 45],
            core: [255, 220, 210],
            outerA: 0.35,
            midA: 0.75,
            coreA: 0.55,
        },
        toxic: {
            shadowColor: "rgba(80, 255, 90, 0.88)",
            outerBlur: 13,
            midBlur: 5,
            outerWidth: 4.2,
            midWidth: 1.9,
            coreWidth: 0.85,
            outer: [120, 255, 100],
            mid: [57, 255, 20],
            core: [230, 255, 210],
            outerA: 0.34,
            midA: 0.72,
            coreA: 0.52,
        },
    };

    function organicBoltJitter(seed, t, amp) {
        return (
            (Math.sin(t * 0.031 + seed * 1.7) + Math.sin(t * 0.053 + seed * 2.9) * 0.55) *
            amp
        );
    }

    function strokeRgb(ctx, rgb, alphaMul, presetAlpha, width, blur, shadow) {
        const a = presetAlpha * alphaMul;
        ctx.shadowColor = shadow;
        ctx.shadowBlur = blur;
        ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
    }

    function drawOrganicBolt(ctx, x1, y1, x2, y2, time, alpha, seed, presetKey) {
        const preset = ORGANIC_BOLT_PRESETS[presetKey] || ORGANIC_BOLT_PRESETS.blood;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        if (dist < 4) return;
        const nx = -dy / dist;
        const ny = dx / dist;
        const segments = Math.min(12, Math.max(6, Math.floor(dist / 28)));
        const amp = Math.min(22, dist * 0.07);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const px = x1 + dx * t;
            const py = y1 + dy * t;
            const falloff = 1 - Math.abs(t - 0.5) * 1.2;
            const j = organicBoltJitter(seed + i * 0.73, time, amp * falloff);
            ctx.lineTo(px + nx * j, py + ny * j);
        }
        ctx.lineTo(x2, y2);

        ctx.save();
        strokeRgb(
            ctx,
            preset.outer,
            alpha,
            preset.outerA,
            preset.outerWidth,
            preset.outerBlur,
            preset.shadowColor
        );
        strokeRgb(ctx, preset.mid, alpha, preset.midA, preset.midWidth, preset.midBlur, preset.shadowColor);
        ctx.shadowBlur = 0;
        strokeRgb(ctx, preset.core, alpha, preset.coreA, preset.coreWidth, 0, preset.shadowColor);
        ctx.restore();
    }

    global.drawOrganicBolt = drawOrganicBolt;

    // -------------------------------------------------------------------------
    // Homing Blood Rift (Ravenous x1)
    // -------------------------------------------------------------------------

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/ravenous-blood-rift.js");
    }

    const RAVENOUS_X1_CFG = boot.entityMods.ravenousX1;

    /** @type {null | (() => Array)} */
    let getPoolBotsFn = null;
    /** @type {null | (() => Array)} */
    let getPoolBloodRiftsFn = null;

    function configureBloodRift(deps) {
        if (!deps || typeof deps.getPoolBots !== "function") {
            throw new Error("configureBloodRift requires { getPoolBots: () => poolBots }");
        }
        getPoolBotsFn = deps.getPoolBots;
        getPoolBloodRiftsFn = deps.getPoolBloodRifts || null;
    }

    function poolBots() {
        if (!getPoolBotsFn) {
            throw new Error("NEBULA VOID: configureBloodRift() before homing rift updates");
        }
        return getPoolBotsFn();
    }

    function normalizeReserved(reserved) {
        if (!reserved) return [];
        if (Array.isArray(reserved)) return reserved.filter(Boolean);
        return [reserved];
    }

    function collectOtherRiftPrey(exceptRift) {
        const out = [];
        if (!getPoolBloodRiftsFn) return out;
        const rifts = getPoolBloodRiftsFn();
        for (let i = 0; i < rifts.length; i++) {
            const r = rifts[i];
            if (!r || !r.active || !r.huntPrey || r.isAfterglow || r === exceptRift) continue;
            const b = r.trackBot;
            if (b && b.active && !b.isInvulnerable) out.push(b);
        }
        return out;
    }

    function findBloodRiftPrey(fromX, fromY, maxRange, reserved) {
        const maxRangeSq = maxRange * maxRange;
        const reservedList = normalizeReserved(reserved);
        const reservedSet = new Set(reservedList);
        const inRange = [];
        const bots = poolBots();

        for (let i = 0; i < bots.length; i++) {
            const bot = bots[i];
            if (!bot.active || bot.isInvulnerable) continue;
            const dx = bot.x - fromX;
            const dy = bot.y - fromY;
            const distSq = dx * dx + dy * dy;
            if (distSq >= maxRangeSq) continue;
            inRange.push({ bot, distSq });
        }

        if (inRange.length === 1) return inRange[0].bot;

        let best = null;
        let bestDistSq = maxRangeSq;
        for (let j = 0; j < inRange.length; j++) {
            const entry = inRange[j];
            if (reservedSet.has(entry.bot)) continue;
            if (entry.distSq < bestDistSq) {
                bestDistSq = entry.distSq;
                best = entry.bot;
            }
        }
        return best;
    }

    function updateHomingBloodRift(rift, dt) {
        if (!rift || !rift.active || !rift.huntPrey || rift.isAfterglow) return;
        if (!rift.trackBot || !rift.trackBot.active || rift.trackBot.isInvulnerable) {
            const reserved = collectOtherRiftPrey(rift);
            rift.trackBot = findBloodRiftPrey(
                rift.x,
                rift.y,
                RAVENOUS_X1_CFG.retargetRange,
                reserved
            );
        }
        if (!rift.trackBot || !rift.trackBot.active) return;
        const dx = rift.trackBot.x - rift.x;
        const dy = rift.trackBot.y - rift.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0.5) return;
        const step = Math.min(dist, RAVENOUS_X1_CFG.trackSpeed * dt);
        rift.x += (dx / dist) * step;
        rift.y += (dy / dist) * step;
    }

    global.configureBloodRift = configureBloodRift;
    global.findBloodRiftPrey = findBloodRiftPrey;
    global.updateHomingBloodRift = updateHomingBloodRift;

    // -------------------------------------------------------------------------
    // Blood Rift x2: organic siphon bolts to extra prey
    // -------------------------------------------------------------------------

    const RAVENOUS_X2_CFG = boot.entityMods.ravenousX2 || {
        skinName: "THE RAVENOUS",
        maxSiphons: 3,
        siphonRange: 400,
        damageMult: 0.65,
        retargetInterval: 0.22,
    };

    /** @type {null | (() => boolean)} */
    let hasSiphonModFn = null;
    /** @type {null | (() => object)} */
    let getPlayerFn = null;
    /** @type {null | (() => object)} */
    let getAbilitySettingsFn = null;
    /** @type {null | ((bot: object) => void)} */
    let onBotKilledFn = null;
    /** @type {null | ((object) => object)} */
    let getNutrientPoolFn = null;

    function configureBloodRiftSiphons(deps) {
        if (!deps || typeof deps.getPoolBots !== "function") {
            throw new Error("configureBloodRiftSiphons requires getPoolBots");
        }
        getPoolBotsFn = deps.getPoolBots;
        hasSiphonModFn = deps.hasSiphonMod || (() => false);
        getPlayerFn = deps.getPlayer || (() => null);
        getAbilitySettingsFn = deps.getAbilitySettings || (() => ({}));
        onBotKilledFn = deps.onBotKilled || (() => {});
        getNutrientPoolFn = deps.getNutrientPool || (() => []);
    }

    function clearRiftSiphons(rift) {
        if (!rift) return;
        rift.siphonBots = [];
        rift.siphonRetargetTimer = 0;
        rift._siphonSfxAcc = 0;
    }

    function countActiveSiphonLinks(targets) {
        if (!targets || !targets.length) return 0;
        let n = 0;
        for (let i = 0; i < targets.length; i++) {
            const b = targets[i];
            if (b && b.active && !b.isInvulnerable) n++;
        }
        return n;
    }

    function tickSiphonSfx(rift, dt) {
        const links = countActiveSiphonLinks(rift.siphonBots);
        if (links <= 0) {
            rift._siphonSfxAcc = 0;
            return;
        }
        const interval = Math.max(
            0.16,
            Number(RAVENOUS_X2_CFG.retargetInterval) || 0.22
        );
        rift._siphonSfxAcc = (rift._siphonSfxAcc || 0) + dt;
        if (rift._siphonSfxAcc < interval) return;
        rift._siphonSfxAcc = 0;
        if (typeof global.playBloodRiftSiphonPulse === "function") {
            global.playBloodRiftSiphonPulse(links);
        }
    }

    function botInsideRift(rift, bot) {
        if (!rift || !bot || !bot.active) return false;
        const dx = bot.x - rift.x;
        const dy = bot.y - rift.y;
        return dx * dx + dy * dy < rift.r * rift.r;
    }

    function riftIsFeeding(rift) {
        if (!rift || !rift.active) return false;
        if (rift.trackBot && rift.trackBot.active && !rift.trackBot.isInvulnerable) {
            if (botInsideRift(rift, rift.trackBot)) return true;
        }
        const bots = poolBots();
        for (let i = 0; i < bots.length; i++) {
            const b = bots[i];
            if (!b.active || b.isInvulnerable) continue;
            if (botInsideRift(rift, b)) return true;
        }
        return false;
    }

    function pickSiphonTargets(rift) {
        const maxN = Math.max(1, Math.min(8, Number(RAVENOUS_X2_CFG.maxSiphons) || 3));
        const range = Number(RAVENOUS_X2_CFG.siphonRange) || 400;
        const rangeSq = range * range;
        const ignore = rift.trackBot;
        const candidates = [];
        const bots = poolBots();
        for (let i = 0; i < bots.length; i++) {
            const bot = bots[i];
            if (!bot.active || bot.isInvulnerable) continue;
            if (ignore && bot === ignore) continue;
            if (botInsideRift(rift, bot)) continue;
            const dx = bot.x - rift.x;
            const dy = bot.y - rift.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > rangeSq) continue;
            candidates.push({ bot, distSq });
        }
        candidates.sort((a, b) => a.distSq - b.distSq);
        const out = [];
        for (let i = 0; i < candidates.length && out.length < maxN; i++) {
            out.push(candidates[i].bot);
        }
        return out;
    }

    function applySiphonDamage(rift, dt) {
        const ability = getAbilitySettingsFn ? getAbilitySettingsFn() : {};
        const player = getPlayerFn ? getPlayerFn() : null;
        const baseDps = Number(ability.VAMPIRE_DAMAGE_BOTS) || 6.4;
        const mult = Number(RAVENOUS_X2_CFG.damageMult);
        const dps = baseDps * (Number.isFinite(mult) ? mult : 0.65);
        const nutrientPool = getNutrientPoolFn ? getNutrientPoolFn() : null;
        const targets = rift.siphonBots || [];
        for (let i = 0; i < targets.length; i++) {
            const bot = targets[i];
            if (!bot || !bot.active || bot.isInvulnerable || botInsideRift(rift, bot)) continue;
            bot.radius -= dps * dt;
            if (player) player.radius += dps * 0.5 * dt;
            if (bot.radius < 5) {
                if (onBotKilledFn) onBotKilledFn(bot);
                if (nutrientPool && typeof bot.explode === "function") {
                    bot.explode(nutrientPool);
                }
            }
        }
    }

    function updateBloodRiftSiphons(rift, dt) {
        if (!rift || !rift.active || rift.isAfterglow) {
            if (rift) clearRiftSiphons(rift);
            return;
        }
        if (!hasSiphonModFn || !hasSiphonModFn()) {
            clearRiftSiphons(rift);
            return;
        }
        if (!riftIsFeeding(rift)) {
            rift.siphonBots = [];
            rift.siphonRetargetTimer = 0;
            rift._siphonSfxAcc = 0;
            return;
        }
        rift.siphonRetargetTimer = (rift.siphonRetargetTimer || 0) - dt;
        const interval = Number(RAVENOUS_X2_CFG.retargetInterval) || 0.22;
        if (rift.siphonRetargetTimer <= 0) {
            rift.siphonRetargetTimer = interval;
            rift.siphonBots = pickSiphonTargets(rift);
        } else {
            const next = [];
            const prev = rift.siphonBots || [];
            for (let i = 0; i < prev.length; i++) {
                const b = prev[i];
                if (b && b.active && !b.isInvulnerable && !botInsideRift(rift, b)) next.push(b);
            }
            rift.siphonBots = next;
            if (next.length === 0) {
                rift.siphonBots = pickSiphonTargets(rift);
            }
        }
        applySiphonDamage(rift, dt);
        tickSiphonSfx(rift, dt);
    }

    function drawBloodRiftSiphons(ctx, rift, timeNow) {
        if (!rift || !rift.active || !hasSiphonModFn || !hasSiphonModFn()) return;
        const targets = rift.siphonBots;
        if (!targets || !targets.length) return;
        const lifeT =
            rift.life && global.__GAME_BOOT
                ? Math.max(0, Math.min(1, rift.life / (global.__GAME_BOOT.abilitySettings.VAMPIRE_RIFT_LIFE || 3.75)))
                : 1;
        const pulse = 0.72 + Math.sin(timeNow * 0.012) * 0.18;
        const alpha = lifeT * pulse;
        const seed = (rift.x * 0.01 + rift.y * 0.013) % 100;

        for (let i = 0; i < targets.length; i++) {
            const bot = targets[i];
            if (!bot || !bot.active) continue;
            const tx = bot.x;
            const ty = bot.y;
            const spread = (i - (targets.length - 1) * 0.5) * 6;
            drawOrganicBolt(
                ctx,
                rift.x + spread * 0.3,
                rift.y - spread * 0.2,
                tx,
                ty,
                timeNow + i * 120,
                alpha,
                seed + i * 4.1,
                "blood"
            );
            ctx.beginPath();
            ctx.arc(tx, ty, Math.max(3, bot.radius * 0.12), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 60, 70, ${0.45 * alpha})`;
            ctx.fill();
        }
    }

    global.configureBloodRiftSiphons = configureBloodRiftSiphons;
    global.updateBloodRiftSiphons = updateBloodRiftSiphons;
    global.drawBloodRiftSiphons = drawBloodRiftSiphons;
    global.clearRiftSiphons = clearRiftSiphons;
})(typeof window !== "undefined" ? window : globalThis);
