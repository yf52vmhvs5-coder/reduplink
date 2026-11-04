/**
 * NEBULA VOID — enemy bot AI, abilities, rendering.
 * Load after config-loader.js and js/pool.js. Call configureEnemyBot() from entities.js once at boot.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/enemy-bot.js");
    }

    const GAME_SETTINGS = boot.gameSettings;
    const ENEMY_BOT_SETTINGS = boot.enemyBotSettings;
    const ENTITY_TYPES = boot.entityTypes;
    const WORLD_CFG = boot.world;

    /** @type {null | (() => object)} */
    let getBotWorld = null;

    function configureEnemyBot(deps) {
        if (!deps || typeof deps.getWorld !== "function") {
            throw new Error("configureEnemyBot requires { getWorld: () => ({ ... }) }");
        }
        getBotWorld = deps.getWorld;
    }

    function botWorld() {
        if (!getBotWorld) {
            throw new Error("NEBULA VOID: configureEnemyBot() must run before the game loop");
        }
        return getBotWorld();
    }

    function clampBotRadius(radius, bot) {
        let r = Math.max(5, radius);
        const maxR = ENEMY_BOT_SETTINGS.MAX_BOT_RADIUS;
        if (typeof maxR === "number" && maxR > 0 && r > maxR) {
            // Plafonul mănâncă mai întâi bonusul temporar de Pulsar, ca la expirare să nu se scadă de două ori.
            if (bot && bot._pulsarApplied > 0) {
                bot._pulsarApplied = Math.max(0, bot._pulsarApplied - (r - maxR));
            }
            r = maxR;
        }
        return r;
    }

    function applyBotPassiveShrink(bot, dt) {
        const cfg = ENEMY_BOT_SETTINGS;
        let r = bot.radius;
        if (r > cfg.BOT_SHRINK_HEAVY_RADIUS) r -= cfg.BOT_SHRINK_HEAVY_RATE * dt;
        else if (r > cfg.BOT_SHRINK_START_RADIUS) r -= cfg.BOT_SHRINK_RATE * dt;
        bot.radius = clampBotRadius(r, bot);
    }

    function botGrowthMultiplier(bot) {
        return bot.config && bot.config.growthRate != null ? bot.config.growthRate : 1;
    }

    /**
     * Ochiul boților: iris în culoarea celulei, pupilă, clipit, privirea spre (lookX, lookY).
     * `host` păstrează blinkTimer / isBlinking / blinkDuration și cache-ul de iris.
     */
    function drawReactiveEye(ctx, x, y, radius, color, lookX, lookY, host, dt) {
        if (!host) return;
        const step = typeof dt === "number" && dt > 0 ? dt : 0;
        if (typeof host.blinkTimer !== "number") host.blinkTimer = 0.31 + Math.random() * 0.93;
        host.blinkTimer -= step;
        if (host.blinkTimer <= 0) {
            host.isBlinking = true;
            host.blinkDuration = 0.05;
            host.blinkTimer = 0.31 + Math.random() * 0.93;
        }
        ctx.save();
        const ang = Math.atan2(lookY - y, lookX - x);
        const eyeR = radius * 0.45;
        const pupilR = eyeR * 0.4;
        const lookO = radius * 0.25;
        ctx.translate(x + Math.cos(ang) * lookO, y + Math.sin(ang) * lookO);
        if (host.isBlinking && host.blinkDuration > 0) {
            host.blinkDuration -= step;
            ctx.beginPath();
            ctx.moveTo(-eyeR, 0);
            ctx.lineTo(eyeR, 0);
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#050505";
            ctx.stroke();
        } else {
            host.isBlinking = false;
            ctx.beginPath();
            ctx.arc(0, 0, eyeR, 0, 6.28);
            ctx.fillStyle = "#111";
            ctx.fill();
            ctx.save();
            const curR = Math.round(radius);
            if (!host.cachedIrisGrad || host.lastR !== curR || host.lastCol !== color) {
                host.cachedIrisGrad = ctx.createRadialGradient(0, 0, pupilR, 0, 0, eyeR);
                host.cachedIrisGrad.addColorStop(0, color);
                host.cachedIrisGrad.addColorStop(1, "#000");
                host.lastR = curR;
                host.lastCol = color;
            }
            ctx.beginPath();
            ctx.arc(0, 0, eyeR * 0.9, 0, 6.28);
            ctx.fillStyle = host.cachedIrisGrad;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#fff";
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            const _ft = window._drawFrameTime || 0;
            for (let i = 0; i < 30; i++) {
                ctx.rotate((Math.PI * 2) / 30);
                ctx.moveTo(pupilR, 0);
                ctx.lineTo(eyeR * (0.75 + Math.sin(_ft * 0.0022 + i * 0.628) * 0.15), 0);
            }
            ctx.stroke();
            ctx.restore();
            ctx.beginPath();
            ctx.arc(0, 0, pupilR, 0, 6.28);
            ctx.fillStyle = "#000";
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(-pupilR * 0.4, -pupilR * 0.4, pupilR * 0.3, 0, 6.28);
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.fill();
        }
        ctx.restore();
    }

    class EnemyBot {
        constructor() {
            this.active = false;
        }

        spawn(typeKey) {
            this.active = true;
            this.typeKey = typeKey;
            this.config = ENTITY_TYPES[typeKey] || {
                color: "#fff",
                speed: 80,
                growthRate: 1,
                vision: 500,
                aggression: 0.5,
            };
            this.abilityTimer =
                this.frozen =
                this.invulnTimer =
                this.pulsarEffectTimer =
                this.nebulaTimer =
                this.mimicTimer =
                    0;
            this.isInvulnerable = false;
            this._pulsarApplied = 0;
            this._killCredited = false;
            this.wanderAngle = Math.random() * 6.28;
            let safe = false;
            let attempts = 0;
            const bhX = GAME_SETTINGS.WORLD_SIZE / 2;
            const bhY = GAME_SETTINGS.WORLD_SIZE / 2;
            let bestX = bhX;
            let bestY = Math.min(GAME_SETTINGS.WORLD_SIZE - 20, bhY + 500);
            let bestScore = -1;
            const spawnPlayer = getBotWorld ? botWorld().player : null;
            while (!safe && attempts < 80) {
                attempts++;
                const x = Math.random() * GAME_SETTINGS.WORLD_SIZE;
                const y = Math.random() * GAME_SETTINGS.WORLD_SIZE;
                const dist = Math.hypot(x - bhX, y - bhY);
                const distPlayer = spawnPlayer
                    ? Math.hypot(x - spawnPlayer.x, y - spawnPlayer.y)
                    : Infinity;
                const farFromPlayer = distPlayer > 700;
                const score = Math.min(dist, distPlayer);
                if (score > bestScore) {
                    bestScore = score;
                    bestX = x;
                    bestY = y;
                }
                if (dist > 1000 && farFromPlayer) {
                    this.x = x;
                    this.y = y;
                    safe = true;
                }
            }
            if (!safe) {
                this.x = bestX;
                this.y = bestY;
            }
            this.radius = 15 + Math.random() * 10;
            this.color = this.config.color;
            this.speed = this.config.speed;
            this.blinkTimer = 0.31 + Math.random() * 0.93;
            this.isBlinking = false;
            this.blinkDuration = 0;
            this.scanTimer = 0.09;
            this.closestFood = null;
        }

        explode(poolNutrients) {
            if (!this.active) return;
            this.active = false;
            const c = Math.floor(this.radius * 0.8);
            // Bot mare → multe bucăți: fără +5 per crumb (la mâncare directă ai float de kill).
            // Resturi puține (ex. siphon Ravenous / rift sub rază 5) → +5 ca la nutrienți normali.
            const suppressDebrisFloat = c > 6;
            for (let i = 0; i < c; i++) {
                let n = global.getFromPool(poolNutrients);
                if (n) {
                    n.spawn(this.x, this.y, this.color);
                    n.suppressPickupFloat = suppressDebrisFloat;
                }
            }
            const self = this;
            const typeKey = this.typeKey;
            const spawnRunId = botWorld().runId;
            setTimeout(() => {
                const w = botWorld();
                if (!w.gameActive || w.runId !== spawnRunId) return;
                self.spawn(typeKey);
            }, WORLD_CFG.botRespawnDelayMs);
        }

        useAbility(player, dist, dt = 0.016) {
            if (this.abilityTimer > 0 || this.frozen > 0) return;
            const cfg = ENEMY_BOT_SETTINGS;
            const poolNutrients = botWorld().poolNutrients;
            switch (this.typeKey) {
                case "GLITCH":
                    if (dist < cfg.GLITCH.triggerDist) {
                        this.x += (Math.random() - 0.5) * cfg.GLITCH.teleportDist;
                        this.y += (Math.random() - 0.5) * cfg.GLITCH.teleportDist;
                        this.abilityTimer = cfg.GLITCH.cooldown;
                    }
                    break;
                case "WORMHOLE":
                    if (dist < cfg.WORMHOLE.triggerDist) {
                        let a = Math.atan2(player.y - this.y, player.x - this.x);
                        // Mai mic decât jucătorul → saltul devine evadare, nu sinucidere.
                        const dir =
                            this.radius > player.radius * GAME_SETTINGS.BOT_EAT_THRESHOLD ? 1 : -1;
                        this.x += Math.cos(a) * cfg.WORMHOLE.jumpForce * dir;
                        this.y += Math.sin(a) * cfg.WORMHOLE.jumpForce * dir;
                        this.abilityTimer = cfg.WORMHOLE.cooldown;
                    }
                    break;
                case "PULSAR": {
                    const before = this.radius;
                    this.radius += cfg.PULSAR.sizeBoost;
                    this._pulsarApplied = (this._pulsarApplied || 0) + (this.radius - before);
                    this.pulsarEffectTimer = cfg.PULSAR.duration;
                    this.abilityTimer = cfg.PULSAR.cooldown;
                    break;
                }
                case "GRAVITY_WELL": {
                    const g = cfg.GRAVITY_WELL;
                    if (dist < g.range && dist > 1) {
                        // pullForce = px/sec la centru; trebuie să rămână sub MIN_SPEED ca să se poată scăpa.
                        const step = g.pullForce * (1 - dist / g.range) * dt;
                        player.x += ((this.x - player.x) / dist) * step;
                        player.y += ((this.y - player.y) / dist) * step;
                    }
                    break;
                }
                case "TITAN":
                    this.isInvulnerable = true;
                    this.invulnTimer = cfg.TITAN.invulnerableDuration;
                    this.oldColor = this.color;
                    this.color = "#FFFFFF";
                    // Cooldown-ul curge după ce scutul expiră, nu în paralel cu el.
                    this.abilityTimer = cfg.TITAN.invulnerableDuration + cfg.TITAN.cooldown;
                    break;
                case "CHRONOS":
                    if (dist < cfg.CHRONOS.range && player.radius > 5) {
                        // Puterea e cea de la 60fps. Fiecare tick de 0.06s folosea dt-ul cadrului,
                        // deci la 120fps Chronos era mai slab, iar la un cadru lung mult mai tare.
                        const tickDt = 1 / 60;
                        player.radius *= Math.pow(cfg.CHRONOS.shrinkPower, tickDt * 160);
                        // += păstrează restul de timp, ca rata de tick să nu depindă de FPS.
                        this.abilityTimer += 0.06;
                    }
                    break;
                case "ARCHITECT":
                    // dropChance e procent (0–100) — nutrienți ca la jeleu / explode bot, nu stardust.
                    if (Math.random() * 100 < cfg.ARCHITECT.dropChance) {
                        const trailAng =
                            this.wanderAngle + Math.PI + (Math.random() - 0.5) * 0.45;
                        const crumbOff = this.radius + 9 + Math.random() * 4;
                        const cx = this.x + Math.cos(trailAng) * crumbOff;
                        const cy = this.y + Math.sin(trailAng) * crumbOff;
                        let n = global.getFromPool(poolNutrients);
                        if (n) {
                            n.spawn(cx, cy, this.color);
                            const spit = 380 + Math.random() * 220;
                            n.vx = Math.cos(trailAng) * spit + (Math.random() - 0.5) * 90;
                            n.vy = Math.sin(trailAng) * spit + (Math.random() - 0.5) * 90;
                            n.radius = 2.2 + Math.random() * 1.3;
                            n.life = 6.5 + Math.random() * 2.5;
                            n.botEatDelay = 0.45;
                        }
                    }
                    this.abilityTimer = cfg.ARCHITECT.cooldown;
                    break;
                case "NECROMANCER": {
                    const nec = cfg.NECROMANCER;
                    const range = nec.pullFoodRange;
                    const rSq = range * range;
                    const maxPullSec = nec.pullFoodForce;
                    const applyNecroPull = (item) => {
                        const dnx = item.x - this.x;
                        const dny = item.y - this.y;
                        const dSq = dnx * dnx + dny * dny;
                        if (dSq >= rSq || dSq <= 0.25) return;
                        const dist = Math.sqrt(dSq);
                        const falloff = 1 - dist / range;
                        const step = maxPullSec * falloff * dt;
                        item.x -= (dnx / dist) * step;
                        item.y -= (dny / dist) * step;
                    };
                    poolNutrients.forEach((n) => {
                        if (n.active) applyNecroPull(n);
                    });
                    const poolParticles = botWorld().poolParticles;
                    if (poolParticles) {
                        for (let pi = 0; pi < poolParticles.length; pi++) {
                            const p = poolParticles[pi];
                            if (p.active) applyNecroPull(p);
                        }
                    }
                    break;
                }
                case "NEBULA":
                    if (
                        dist < (cfg.NEBULA.triggerDist ?? 400) &&
                        player.radius > this.radius * GAME_SETTINGS.BOT_EAT_THRESHOLD
                    ) {
                        this.nebulaTimer = cfg.NEBULA.duration;
                        this.abilityTimer = cfg.NEBULA.cooldown;
                    }
                    break;
                case "MIMIC":
                    if (dist < cfg.MIMIC.triggerDist) {
                        this.mimicTimer = cfg.MIMIC.copyDuration;
                        this.mimicColor = player.glow;
                        this.abilityTimer = cfg.MIMIC.cooldown;
                    }
                    break;
            }
        }

        update(player, allParticles, dt = 0.016) {
            if (!this.active) return;
            const w = botWorld();
            const poolJellyBubbles = w.poolJellyBubbles;

            this.invulnTimer > 0 &&
                ((this.invulnTimer -= dt),
                this.invulnTimer <= 0 &&
                    ((this.isInvulnerable = false), (this.color = this.config.color)));
            if (this.pulsarEffectTimer > 0) {
                this.pulsarEffectTimer -= dt;
                if (this.pulsarEffectTimer <= 0) {
                    const bonus = this._pulsarApplied || 0;
                    this._pulsarApplied = 0;
                    this.radius = clampBotRadius(this.radius - bonus, this);
                }
            }
            this.nebulaTimer > 0 && (this.nebulaTimer -= dt);
            this.mimicTimer > 0 &&
                ((this.mimicTimer -= dt), this.mimicTimer <= 0 && (this.mimicColor = null));
            if (this.phaseCageBleedGlow > 0) {
                this.phaseCageBleedGlow -= dt * 2.8;
                if (this.phaseCageBleedGlow < 0) this.phaseCageBleedGlow = 0;
            }
            if (this.frozen > 0) {
                this.frozen -= dt;
                return;
            }
            this.abilityTimer > 0 && (this.abilityTimer -= dt);
            if (this.scanTimer === undefined) {
                this.scanTimer = 0.09;
                this.closestFood = null;
            }
            let targetX = null;
            let targetY = null;
            let moveMode = "WANDER";
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq);
            const bhX = GAME_SETTINGS.WORLD_SIZE / 2;
            const bhY = GAME_SETTINGS.WORLD_SIZE / 2;
            const bhCoreRadius = GAME_SETTINGS.BH_CORE_RADIUS;
            const distBHSq = (this.x - bhX) ** 2 + (this.y - bhY) ** 2;
            this.useAbility(player, dist, dt);

            // Fuga începe la marginea razei de atracție: mai înăuntru, BH_PULL_FORCE depășește viteza boților lenți.
            const bhHardAvoidDist = Math.max(
                bhCoreRadius + 170,
                GAME_SETTINGS.BH_PULL_RANGE + this.radius
            );
            const bhHardAvoidSq = bhHardAvoidDist * bhHardAvoidDist;
            if (distBHSq < bhHardAvoidSq) {
                moveMode = "FLEE_BH";
                targetX = bhX;
                targetY = bhY;
            } else if (distSq < 90000 && player.radius > this.radius * GAME_SETTINGS.BOT_EAT_THRESHOLD) {
                moveMode = "FLEE";
                targetX = player.x;
                targetY = player.y;
            } else if (
                distSq < (300 * (this.config.aggression ?? 0.5)) ** 2 &&
                this.radius > player.radius * GAME_SETTINGS.BOT_EAT_THRESHOLD
            ) {
                moveMode = "ATTACK";
                targetX = player.x;
                targetY = player.y;
            } else {
                this.scanTimer -= dt;
                if (this.scanTimer <= 0) {
                    this.scanTimer = 0.09;
                    let minD = (this.config.vision || 500) ** 2;
                    this.closestFood = null;
                    for (let i = 0; i < allParticles.length; i++) {
                        let p = allParticles[i];
                        if (!p.active) continue;
                        if ((p.x - bhX) ** 2 + (p.y - bhY) ** 2 < bhHardAvoidSq) continue;
                        let d = (p.x - this.x) ** 2 + (p.y - this.y) ** 2;
                        if (d < minD) {
                            minD = d;
                            this.closestFood = p;
                            this.closestFoodId = p.spawnId;
                        }
                    }
                }
                if (
                    this.closestFood &&
                    (!this.closestFood.active || this.closestFood.spawnId !== this.closestFoodId)
                ) {
                    this.closestFood = null;
                }
                if (this.closestFood && this.closestFood.active) {
                    moveMode = "EAT";
                    targetX = this.closestFood.x;
                    targetY = this.closestFood.y;
                    let d =
                        (this.closestFood.x - this.x) ** 2 + (this.closestFood.y - this.y) ** 2;
                    if (d < (this.radius + 15) ** 2) {
                        this.closestFood.active = false;
                        this.radius = clampBotRadius(
                            this.radius +
                                ENEMY_BOT_SETTINGS.GROW_FROM_PARTICLE * botGrowthMultiplier(this),
                            this
                        );
                        this.closestFood = null;
                    }
                }
            }

            let angle =
                moveMode === "WANDER"
                    ? (this.wanderAngle += (Math.random() - 0.5) * 24.0 * dt)
                    : Math.atan2(targetY - this.y, targetX - this.x);
            if (moveMode === "FLEE" || moveMode === "FLEE_BH") angle += Math.PI;
            const nebulaCfg = ENEMY_BOT_SETTINGS.NEBULA;
            const nebulaBoost =
                nebulaCfg && typeof nebulaCfg.speedBoost === "number" ? nebulaCfg.speedBoost : 2;
            let speed = this.nebulaTimer > 0 ? this.speed * nebulaBoost : this.speed;

            this.x += Math.cos(angle) * speed * dt;
            this.y += Math.sin(angle) * speed * dt;

            const edgeLo = this.radius;
            const edgeHi = GAME_SETTINGS.WORLD_SIZE - this.radius;
            this.x = Math.max(edgeLo, Math.min(edgeHi, this.x));
            this.y = Math.max(edgeLo, Math.min(edgeHi, this.y));
            if (moveMode === "WANDER") {
                if ((this.x <= edgeLo && Math.cos(this.wanderAngle) < 0) || (this.x >= edgeHi && Math.cos(this.wanderAngle) > 0)) {
                    this.wanderAngle = Math.PI - this.wanderAngle;
                }
                if ((this.y <= edgeLo && Math.sin(this.wanderAngle) < 0) || (this.y >= edgeHi && Math.sin(this.wanderAngle) > 0)) {
                    this.wanderAngle = -this.wanderAngle;
                }
            }

            for (let i = 0; i < poolJellyBubbles.length; i++) {
                let jb = poolJellyBubbles[i];
                if (!jb.active) continue;
                let dxJB = this.x - jb.x;
                let dyJB = this.y - jb.y;
                let distSqJB = dxJB * dxJB + dyJB * dyJB;
                let minAllowedDist = this.radius + jb.radius;
                if (distSqJB < minAllowedDist * minAllowedDist) {
                    let distJB = Math.sqrt(distSqJB) || 0.1;
                    let overlap = minAllowedDist - distJB;
                    this.x += (dxJB / distJB) * overlap;
                    this.y += (dyJB / distJB) * overlap;
                }
            }

            applyBotPassiveShrink(this, dt);
        }

        draw(ctx, pX, pY, scrW, scrH, dt = 0.016, zoom = 1) {
            if (!this.active) return;
            const _hw = scrW / 2 / zoom + 150;
            const _hh = scrH / 2 / zoom + 150;
            if (Math.abs(this.x - pX) > _hw || Math.abs(this.y - pY) > _hh) return;
            ctx.save();
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, 6.28);
            const drawCol = this.mimicTimer > 0 ? this.mimicColor || this.color : this.color;
            if (this.frozen > 0) {
                ctx.fillStyle = "#ffffff";
                ctx.shadowBlur = 20;
                ctx.shadowColor = "#8a2be2";
            } else if (this.isInvulnerable) {
                ctx.fillStyle = "#ffffff";
                ctx.shadowBlur = 40;
                ctx.shadowColor = "#ffffff";
            } else if (this.phaseCageBleedGlow > 0) {
                ctx.fillStyle = drawCol;
                ctx.shadowBlur = 14 + this.phaseCageBleedGlow * 22;
                ctx.shadowColor = "#3da5ff";
            } else if (this._sporeSplitGlow > 0) {
                ctx.fillStyle = drawCol;
                ctx.shadowBlur = 11 + this._sporeSplitGlow * 28;
                ctx.shadowColor = "#a8b8ff";
            } else if (this._sporeDrainGlow > 0) {
                ctx.fillStyle = drawCol;
                ctx.shadowBlur = 12 + this._sporeDrainGlow * 24;
                ctx.shadowColor = "#a66bff";
            } else {
                ctx.fillStyle = drawCol;
                ctx.shadowBlur = 15;
                ctx.shadowColor = drawCol;
            }
            ctx.fill();
            ctx.restore();
            drawReactiveEye(ctx, this.x, this.y, this.radius, drawCol, pX, pY, this, dt);
        }
    }

    global.EnemyBot = EnemyBot;
    global.configureEnemyBot = configureEnemyBot;
    global.clampBotRadius = clampBotRadius;
    global.drawReactiveEye = drawReactiveEye;
})(typeof window !== "undefined" ? window : globalThis);
