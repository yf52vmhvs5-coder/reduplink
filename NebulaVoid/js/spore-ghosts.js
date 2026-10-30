/**
 * NEBULA VOID — Toxic Spore dash ghosts (trail, latch, drain).
 * configureSporeGhosts() from entities.js after pools exist.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, unknown>} */
    let deps = null;

    function configureSporeGhosts(nextDeps) {
        if (!nextDeps || typeof nextDeps.getPoolSporeGhosts !== "function") {
            throw new Error("configureSporeGhosts requires getPoolSporeGhosts and related deps");
        }
        deps = nextDeps;
    }

    function findNearestBotToPoint(px, py, rangePx) {
        return findNearestBotExcluding(px, py, rangePx, null);
    }

    function findNearestBotExcluding(px, py, rangePx, excludeBot) {
        const poolBots = deps.getPoolBots();
        const rangeSq = rangePx * rangePx;
        let best = null;
        let bestD = rangeSq;
        for (let i = 0; i < poolBots.length; i++) {
            const b = poolBots[i];
            if (!b.active || b.isInvulnerable) continue;
            if (excludeBot && b === excludeBot) continue;
            const d = (b.x - px) ** 2 + (b.y - py) ** 2;
            if (d < bestD) {
                bestD = d;
                best = b;
            }
        }
        return best;
    }

    function getSporeGhostStyle(g, toxicMod) {
        const isLatch = g.phase === "homing" || g.phase === "latched";
        const isAbsorb = g.phase === "absorb";
        const toxicVisual = toxicMod && (g.phase === "trail" || isLatch || isAbsorb);
        if (!toxicVisual) {
            const player = deps.getPlayer();
            return { fill: player.color, glow: player.glow, stroke: player.glow };
        }
        if (g.toxicTier >= 2 || g.phase === "absorb") {
            const x3 = global.TOXIC_SPORE_X3_CFG || {};
            const pal = x3.returnColors || {};
            return {
                fill: pal.fill || "#7ec8e8",
                glow: pal.glow || "#d4f0ff",
                stroke: pal.stroke || "rgba(170, 220, 255, 0.55)",
            };
        }
        if (g.toxicTier >= 1) {
            const x2 = global.TOXIC_SPORE_X2_CFG || {};
            const pal = x2.splitColors || {};
            return {
                fill: pal.fill || "#6e7cff",
                glow: pal.glow || "#b8c4ff",
                stroke: pal.stroke || "rgba(160, 178, 255, 0.52)",
            };
        }
        const x1 = global.TOXIC_SPORE_X1_CFG || {};
        const pal = x1.latchColors || {};
        return {
            fill: pal.fill || "#9b6bff",
            glow: pal.glow || "#cbb8ff",
            stroke: pal.stroke || "rgba(186, 160, 255, 0.48)",
        };
    }

    function getSporeAcquireRange() {
        const x1 = global.TOXIC_SPORE_X1_CFG || {};
        const x2 = global.TOXIC_SPORE_X2_CFG || {};
        return Number(x2.splitAcquireRange) || Number(x1.acquireRange) || 420;
    }

    /** Bot pentru split x2: altul în rază, sau același dacă e singurul. */
    function resolveSplitTargetBot(primaryBot) {
        const player = deps.getPlayer();
        const range = getSporeAcquireRange();
        if (primaryBot && primaryBot.active && !primaryBot.isInvulnerable) {
            const alt = findNearestBotExcluding(primaryBot.x, primaryBot.y, range, primaryBot);
            if (alt) return alt;
            return primaryBot;
        }
        return findNearestBotToPoint(player.x, player.y, range);
    }

    function allocSporeGhostFromPool() {
        const getFromPool = global.getFromPool;
        if (typeof getFromPool !== "function") return null;
        return getFromPool(deps.getPoolSporeGhosts());
    }

    function spawnImmediateSplitFromTrail(parentGhost, splitBot, primaryBot) {
        if (!global.playerHasToxicSporeSplitMod() || !parentGhost || !splitBot) return;
        if (parentGhost.splitDispatched) return;
        parentGhost.splitDispatched = true;

        const x2 = global.TOXIC_SPORE_X2_CFG || {};
        const x1 = global.TOXIC_SPORE_X1_CFG || {};
        const child = allocSporeGhostFromPool();
        if (!child) return;

        const sameTarget = primaryBot && splitBot === primaryBot;
        const arcExtra = Number(x2.sameTargetArcSpread);
        const sameArc = Number.isFinite(arcExtra) ? arcExtra : 0.78;

        const scale = Number(x2.splitGhostScale) || 0.68;
        const pop = Number(x2.splitPopPx) || 12;
        const slot = parentGhost.latchSlot;
        const spread = (slot - 1.5) * 0.24;
        let ang = Math.atan2(parentGhost.y - splitBot.y, parentGhost.x - splitBot.x);
        if (!Number.isFinite(ang)) ang = slot * (Math.PI / 2);
        if (sameTarget) {
            ang += spread + Math.PI * 0.42 + (slot - 1.5) * 0.35;
        } else {
            ang += spread + Math.PI * 0.08;
        }

        child.active = true;
        child.x = parentGhost.x + Math.cos(ang) * pop;
        child.y = parentGhost.y + Math.sin(ang) * pop;
        child.r = Math.max(3.5, parentGhost.r * scale);
        child.life = 1;
        child.phase = "homing";
        child.targetBot = splitBot;
        child.latchSlot = slot;
        let latchAng = Math.atan2(child.y - splitBot.y, child.x - splitBot.x);
        if (!Number.isFinite(latchAng)) latchAng = ang;
        if (sameTarget) {
            child.latchAngle = latchAng + (slot - 1.5) * sameArc + Math.PI * 0.18;
        } else {
            child.latchAngle = latchAng + spread * 0.5;
        }
        child.latchLife =
            Number(x2.splitLatchLifeSec) ||
            Number(x1.latchLifeSec) * 0.88 ||
            1.45;
        child.dashBurstId = parentGhost.dashBurstId;
        child.toxicTier = 1;
        child.splitDispatched = false;
    }

    function spawnImmediateReturnFromTrail(parentGhost) {
        if (!global.playerHasToxicSporeVisionMod() || !parentGhost) return;

        const x3 = global.TOXIC_SPORE_X3_CFG || {};
        const child = allocSporeGhostFromPool();
        if (!child) return;

        const scale = Number(x3.returnGhostScale) || 0.58;
        const x2 = global.TOXIC_SPORE_X2_CFG || {};
        const popPx = Number(x2.splitPopPx) || 12;
        const spread = (parentGhost.latchSlot - 1.5) * 0.31;
        const player = deps.getPlayer();
        let ang = Math.atan2(parentGhost.y - player.y, parentGhost.x - player.x);
        if (!Number.isFinite(ang)) ang = parentGhost.latchSlot * (Math.PI / 2);
        ang -= spread + Math.PI * 0.12;

        child.active = true;
        child.x = parentGhost.x + Math.cos(ang) * popPx;
        child.y = parentGhost.y + Math.sin(ang) * popPx;
        child.r = Math.max(3.2, parentGhost.r * scale);
        child.life = 1;
        child.phase = "absorb";
        child.targetBot = null;
        child.latchSlot = parentGhost.latchSlot;
        child.latchAngle = 0;
        child.latchLife = Number(x3.returnLatchLifeSec) || 2.1;
        child.dashBurstId = parentGhost.dashBurstId;
        child.toxicTier = 2;
        child.splitDispatched = false;
    }

    function applySporeMassAbsorb() {
        const x3 = global.TOXIC_SPORE_X3_CFG || {};
        const player = deps.getPlayer();
        if (!player) return;
        let gain = Number(x3.absorbMassRadius);
        if (!Number.isFinite(gain) || gain <= 0) gain = 0.2;
        if (typeof global.getCoreGrowthMultiplier === "function") {
            gain *= global.getCoreGrowthMultiplier();
        }
        const boot = global.__GAME_BOOT;
        const maxR =
            boot && boot.gameSettings && Number(boot.gameSettings.MAX_PLAYER_RADIUS);
        player.radius += gain;
        if (Number.isFinite(maxR) && maxR > 0 && player.radius > maxR) {
            player.radius = maxR;
        }
        if (typeof global.playEatParticleSound === "function") {
            global.playEatParticleSound();
        }
        if (typeof global.pulseSporeAbsorbShake === "function") {
            global.pulseSporeAbsorbShake();
        }
    }

    function armSporeGhostsLatch(burstId, targetBot) {
        const cfg = global.TOXIC_SPORE_X1_CFG;
        const poolSporeGhosts = deps.getPoolSporeGhosts();
        const maxG = Math.max(1, Math.floor(Number(cfg.maxGhostsPerLatch) || 4));
        const latchSec = Number(cfg.latchLifeSec) || 2.35;
        const splitBot =
            global.playerHasToxicSporeSplitMod() ? resolveSplitTargetBot(targetBot) : null;
        let slot = 0;
        for (let i = 0; i < poolSporeGhosts.length; i++) {
            const g = poolSporeGhosts[i];
            if (!g.active || g.phase !== "trail" || g.dashBurstId !== burstId) continue;
            if (targetBot && targetBot.active && !targetBot.isInvulnerable && slot < maxG) {
                const spread = (slot - 1.5) * 0.28;
                let ang = Math.atan2(g.y - targetBot.y, g.x - targetBot.x);
                if (!Number.isFinite(ang)) ang = slot * (Math.PI / 2);
                g.phase = "homing";
                g.targetBot = targetBot;
                g.latchSlot = slot;
                g.latchAngle = ang + spread;
                g.latchLife = latchSec;
                g.life = 1;
                g.toxicTier = 0;
                g.splitDispatched = false;
                if (splitBot) spawnImmediateSplitFromTrail(g, splitBot, targetBot);
                if (global.playerHasToxicSporeVisionMod()) spawnImmediateReturnFromTrail(g);
                slot++;
            } else {
                g.phase = "fade";
            }
        }
    }

    function sporeGhostEdgePoint(bot, angle, ghostR, edgeInsetMult) {
        const gr = Math.max(3, ghostR);
        const inset = Number(edgeInsetMult);
        const mult = Number.isFinite(inset) ? inset : 0.35;
        const distFromCenter = Math.max(4, bot.radius - gr * mult);
        return {
            x: bot.x + Math.cos(angle) * distFromCenter,
            y: bot.y + Math.sin(angle) * distFromCenter,
        };
    }

    function updateSporeGhosts(dt) {
        const ABILITY_SETTINGS = deps.getAbilitySettings();
        const fadeDur = Number(ABILITY_SETTINGS.SPEED_DASH_DURATION) || 0.31;
        const cfg = global.TOXIC_SPORE_X1_CFG;
        const x2cfg = global.TOXIC_SPORE_X2_CFG || {};
        const x3cfg = global.TOXIC_SPORE_X3_CFG || {};
        const homingSpdBase = Number(cfg.ghostHomingSpeed) || 280;
        const homingSpdSplit = Number(x2cfg.splitGhostHomingSpeed) || homingSpdBase + 20;
        const homingSpdReturn = Number(x3cfg.returnHomingSpeed) || homingSpdSplit + 40;
        const drainBase = Number(cfg.drainPerGhostPerSec) || 2;
        const drainSplitMult = Number(x2cfg.splitDrainMult) || 0.9;
        const edgeInset = Number(cfg.latchEdgeInset);
        const latchSecBase = Number(cfg.latchLifeSec) || 1.65;
        const latchSecSplit = Number(x2cfg.splitLatchLifeSec) || latchSecBase * 0.88;
        const poolSporeGhosts = deps.getPoolSporeGhosts();
        const activeEffects = deps.getActiveEffects();
        const selectedAbility = deps.getSelectedAbility();

        for (let i = 0; i < poolSporeGhosts.length; i++) {
            const g = poolSporeGhosts[i];
            if (!g.active) continue;

            if (g.phase === "trail") {
                if (
                    global.playerHasToxicSporeLatchMod() &&
                    selectedAbility === "speed" &&
                    activeEffects.dashTime > 0 &&
                    g.dashBurstId === deps.getSporeDashBurstSerial()
                ) {
                    g.life = 1;
                } else {
                    g.life -= dt / fadeDur;
                    if (g.life <= 0) g.active = false;
                }
                continue;
            }
            if (g.phase === "fade") {
                g.life -= dt / fadeDur;
                if (g.life <= 0) g.active = false;
                continue;
            }

            if (g.phase === "absorb") {
                const player = deps.getPlayer();
                if (!player) {
                    g.active = false;
                    continue;
                }
                if (g.latchLife <= 0) {
                    g.active = false;
                    continue;
                }
                const tx = player.x;
                const ty = player.y;
                const dx = tx - g.x;
                const dy = ty - g.y;
                const dist = Math.hypot(dx, dy) || 0.001;
                const reach = Math.max(6, player.radius * 0.55 + g.r * 0.4);
                const step = homingSpdReturn * dt;
                if (dist <= reach) {
                    applySporeMassAbsorb();
                    g.active = false;
                    continue;
                }
                g.x += (dx / dist) * step;
                g.y += (dy / dist) * step;
                g.latchLife -= dt;
                g.life = Math.max(0.35, g.latchLife / (Number(x3cfg.returnLatchLifeSec) || 2.1));
                continue;
            }

            if (g.latchLife <= 0) {
                g.active = false;
                continue;
            }

            const bot = g.targetBot;
            if (!bot || !bot.active || bot.isInvulnerable) {
                g.active = false;
                continue;
            }

            const gr = Math.max(4, g.r * 0.55);
            const edge = sporeGhostEdgePoint(bot, g.latchAngle, gr, edgeInset);
            const tx = edge.x;
            const ty = edge.y;
            const homingSpd = g.toxicTier >= 1 ? homingSpdSplit : homingSpdBase;
            const drain = g.toxicTier >= 1 ? drainBase * drainSplitMult : drainBase;
            const latchSec = g.toxicTier >= 1 ? latchSecSplit : latchSecBase;

            if (g.phase === "homing") {
                const dx = tx - g.x;
                const dy = ty - g.y;
                const dist = Math.hypot(dx, dy) || 0.001;
                const step = homingSpd * dt;
                if (dist <= step + 5) {
                    g.phase = "latched";
                    g.x = tx;
                    g.y = ty;
                } else {
                    g.x += (dx / dist) * step;
                    g.y += (dy / dist) * step;
                }
                continue;
            }

            if (g.phase === "latched") {
                g.x = tx;
                g.y = ty;
                g.r = Math.max(4, Math.min(g.r, bot.radius * 0.2));
                bot.radius -= drain * dt;
                const glowRate = g.toxicTier >= 1 ? 1.65 : 1.4;
                const glowCap = g.toxicTier >= 1 ? 0.72 : 0.65;
                bot._sporeDrainGlow = Math.min(glowCap, (bot._sporeDrainGlow || 0) + dt * glowRate);
                if (g.toxicTier >= 1) bot._sporeSplitGlow = Math.min(0.5, (bot._sporeSplitGlow || 0) + dt * 1.1);
                g.latchLife -= dt;
                g.life = Math.max(0, g.latchLife / latchSec);
                if (g.latchLife <= 0) {
                    g.active = false;
                    continue;
                }
                if (bot.radius < 5) {
                    deps.onBotKilled(bot);
                    bot.explode(deps.getNutrientPool());
                    g.active = false;
                }
            }
        }
    }

    function drawSporeGhostsWorld(ctx, timeNow) {
        const poolSporeGhosts = deps.getPoolSporeGhosts();
        const toxicMod = global.playerHasToxicSporeLatchMod();
        const pulse = 0.82 + Math.sin(timeNow * 0.006) * 0.12;
        const splitPulse = 0.88 + Math.sin(timeNow * 0.009 + 0.4) * 0.1;

        for (let i = 0; i < poolSporeGhosts.length; i++) {
            const g = poolSporeGhosts[i];
            if (!g.active) continue;

            const isLatch = g.phase === "homing" || g.phase === "latched";
            const isAbsorb = g.phase === "absorb";
            const style = getSporeGhostStyle(g, toxicMod);
            const fill = style.fill;
            const glow = style.glow;
            const isSplit = g.toxicTier === 1;
            const isReturn = g.toxicTier >= 2 || isAbsorb;
            const fade =
                g.phase === "trail" || g.phase === "fade" ? 0.48 : isReturn ? 0.54 : isSplit ? 0.52 : 0.5;
            const alpha = g.life * (isLatch || isAbsorb ? 0.5 + (isReturn ? splitPulse : isSplit ? splitPulse : pulse) * 0.32 : fade);
            const drawR =
                isLatch || isAbsorb
                    ? Math.max(3, g.r * (isReturn ? 0.48 : isSplit ? 0.52 : 0.5))
                    : g.r * 0.92;
            const blur = isAbsorb ? 11 : isLatch ? (isSplit || isReturn ? 10 : 9) : 10;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = blur;
            ctx.shadowColor = glow;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(g.x, g.y, drawR, 0, 6.28);
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = style.stroke;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.arc(g.x, g.y, drawR + 2, 0, 6.28);
            ctx.stroke();

            ctx.globalAlpha = alpha;
            ctx.strokeStyle = isLatch || isAbsorb ? style.stroke : glow;
            ctx.lineWidth = isLatch || isAbsorb ? 1.35 : 1.75;
            ctx.beginPath();
            ctx.arc(g.x, g.y, drawR, 0, 6.28);
            ctx.stroke();
            ctx.restore();
        }
    }

    global.configureSporeGhosts = configureSporeGhosts;
    global.findNearestBotToPoint = findNearestBotToPoint;
    global.armSporeGhostsLatch = armSporeGhostsLatch;
    global.updateSporeGhosts = updateSporeGhosts;
    global.drawSporeGhostsWorld = drawSporeGhostsWorld;
})(typeof window !== "undefined" ? window : globalThis);
