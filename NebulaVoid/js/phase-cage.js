/**
 * NEBULA VOID — Phase Shifter x1: fixed world geometry cages (trap after warp).
 * x2 (RESONANCE): trapped prey takes damage in the inner wall band — cages unchanged.
 * x3 (VOID ASCEND): mobile cage hunts up to 3 bots; trapped are dragged until expiry.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/phase-cage.js");
    }

    const DEFAULT_CFG = {
        skinName: "THE PHASE SHIFTER",
        acquireRange: 350,
        paddingPx: 82,
        minHalfSize: 96,
        extraPadPerBot: 32,
        cageLifeSec: 3.85,
        fadeSec: 0.55,
        maxSimultaneous: 3,
        cageSeparationPx: 52,
        cageAccentColors: ["#3da5ff", "#39ff14", "#ffdd22"],
    };

    const DEFAULT_X2_CFG = {
        skinName: "THE PHASE SHIFTER",
        bleedBandPx: 14,
        damageMult: 0.58,
        bleedDelaySec: 0.75,
        minKillRadius: 5,
        sfxCooldownSec: 0.62,
    };

    const DEFAULT_X3_CFG = {
        skinName: "THE PHASE SHIFTER",
        maxTrappedPerCage: 3,
        huntRange: 350,
        trackSpeed: 300,
        huntSprintMult: 1.75,
        huntSprintRangePx: 140,
        captureCenterSlack: 48,
        huntDelaySec: 0.75,
    };

    let cfg = boot.entityMods.phaseShifterX1 || DEFAULT_CFG;
    let x2Cfg = boot.entityMods.phaseShifterX2 || DEFAULT_X2_CFG;
    let x3Cfg = boot.entityMods.phaseShifterX3 || DEFAULT_X3_CFG;
    /** @type {Array<object>} */
    let cages = [];
    let cageSpawnSerial = 0;
    /** @type {() => boolean} */
    let hasResonanceModFn = () => false;
    /** @type {() => boolean} */
    let hasAscendModFn = () => false;
    /** @type {null | (() => Array)} */
    let getPoolBotsFn = null;
    /** @type {null | ((bot: object) => void)} */
    let onBotKilledFn = null;
    /** @type {null | (() => object)} */
    let getAbilitySettingsFn = null;
    /** @type {null | (() => Array)} */
    let getNutrientPoolFn = null;

    function configurePhaseCage(options) {
        if (!options) return;
        if (options.phaseShifterX1Cfg) cfg = options.phaseShifterX1Cfg;
        if (options.phaseShifterX2Cfg) x2Cfg = options.phaseShifterX2Cfg;
        if (options.phaseShifterX3Cfg) x3Cfg = options.phaseShifterX3Cfg;
        if (typeof options.hasResonanceMod === "function") hasResonanceModFn = options.hasResonanceMod;
        if (typeof options.hasAscendMod === "function") hasAscendModFn = options.hasAscendMod;
        if (typeof options.getPoolBots === "function") getPoolBotsFn = options.getPoolBots;
        if (typeof options.onBotKilled === "function") onBotKilledFn = options.onBotKilled;
        if (typeof options.getAbilitySettings === "function") getAbilitySettingsFn = options.getAbilitySettings;
        if (typeof options.getNutrientPool === "function") getNutrientPoolFn = options.getNutrientPool;
    }

    function clearPhaseCage() {
        if (typeof global.releasePhaseCageHuntDrone === "function") {
            for (let i = 0; i < cages.length; i++) {
                global.releasePhaseCageHuntDrone(cages[i].serial);
            }
        }
        cages = [];
        cageSpawnSerial = 0;
    }

    function worldSize() {
        const ws = boot.gameSettings && boot.gameSettings.WORLD_SIZE;
        return Number.isFinite(ws) && ws > 0 ? ws : 8000;
    }

    function separationGap() {
        const g = Number(cfg.cageSeparationPx);
        return Number.isFinite(g) && g >= 0 ? g : DEFAULT_CFG.cageSeparationPx;
    }

    function cageWorldAABB(cx, cy, halfW, halfH, rot) {
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const corners = [
            [-halfW, -halfH],
            [halfW, -halfH],
            [halfW, halfH],
            [-halfW, halfH],
        ];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < corners.length; i++) {
            const lx = corners[i][0];
            const ly = corners[i][1];
            const wx = cx + lx * cos - ly * sin;
            const wy = cy + lx * sin + ly * cos;
            minX = Math.min(minX, wx);
            maxX = Math.max(maxX, wx);
            minY = Math.min(minY, wy);
            maxY = Math.max(maxY, wy);
        }
        return { minX, maxX, minY, maxY };
    }

    function aabbOverlap(a, b, gap) {
        return !(
            a.maxX + gap < b.minX ||
            b.maxX + gap < a.minX ||
            a.maxY + gap < b.minY ||
            b.maxY + gap < a.minY
        );
    }

    function overlapsAnyActiveCage(cx, cy, halfW, halfH, rot, gap) {
        if (!cages.length) return false;
        const self = cageWorldAABB(cx, cy, halfW, halfH, rot);
        for (let i = 0; i < cages.length; i++) {
            const c = cages[i];
            const other = cageWorldAABB(c.cx, c.cy, c.halfW, c.halfH, c.rot);
            if (aabbOverlap(self, other, gap)) return true;
        }
        return false;
    }

    function clampCageCenterToWorld(cx, cy, halfW, halfH, rot) {
        const ws = worldSize();
        let box = cageWorldAABB(cx, cy, halfW, halfH, rot);
        if (box.minX < 0) cx += -box.minX;
        if (box.maxX > ws) cx -= box.maxX - ws;
        if (box.minY < 0) cy += -box.minY;
        if (box.maxY > ws) cy -= box.maxY - ws;
        return { cx, cy };
    }

    function botInsideRotatedCage(bot, cx, cy, halfW, halfH, rot) {
        const r = Math.max(4, bot.radius);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const lx = (bot.x - cx) * cos + (bot.y - cy) * sin;
        const ly = -(bot.x - cx) * sin + (bot.y - cy) * cos;
        const maxX = Math.max(6, halfW - r);
        const maxY = Math.max(6, halfH - r);
        return Math.abs(lx) <= maxX && Math.abs(ly) <= maxY;
    }

    function allAnchorBotsInside(anchorBots, cx, cy, halfW, halfH, rot) {
        if (!anchorBots || !anchorBots.length) return true;
        for (let i = 0; i < anchorBots.length; i++) {
            const bot = anchorBots[i];
            if (!botEligible(bot)) return false;
            if (!botInsideRotatedCage(bot, cx, cy, halfW, halfH, rot)) return false;
        }
        return true;
    }

    function tryCagePlacement(cx, cy, halfW, halfH, rot, gap, anchorBots) {
        if (!allAnchorBotsInside(anchorBots, cx, cy, halfW, halfH, rot)) return null;
        const clamped = clampCageCenterToWorld(cx, cy, halfW, halfH, rot);
        cx = clamped.cx;
        cy = clamped.cy;
        if (!allAnchorBotsInside(anchorBots, cx, cy, halfW, halfH, rot)) return null;
        if (overlapsAnyActiveCage(cx, cy, halfW, halfH, rot, gap)) return null;
        return { cx, cy, ok: true };
    }

    /** Keep cage centered on anchor bot(s); only small nudges for separation (never jump to player). */
    function resolveCagePosition(cx, cy, halfW, halfH, rot, _player, anchorBots) {
        const gap = separationGap();
        const maxAttempts = 56;
        const anchorCx = cx;
        const anchorCy = cy;

        let placed = tryCagePlacement(cx, cy, halfW, halfH, rot, gap, anchorBots);
        if (placed) return placed;

        for (let attempts = 0; attempts < maxAttempts; attempts++) {
            const self = cageWorldAABB(cx, cy, halfW, halfH, rot);
            let pushX = 0;
            let pushY = 0;
            let hadOverlap = false;

            for (let i = 0; i < cages.length; i++) {
                const c = cages[i];
                const other = cageWorldAABB(c.cx, c.cy, c.halfW, c.halfH, c.rot);
                if (!aabbOverlap(self, other, gap)) continue;
                hadOverlap = true;
                const dx = cx - c.cx;
                const dy = cy - c.cy;
                const len = Math.hypot(dx, dy) || 1;
                const overlapX = Math.min(self.maxX + gap - other.minX, other.maxX + gap - self.minX);
                const overlapY = Math.min(self.maxY + gap - other.minY, other.maxY + gap - self.minY);
                const useX = overlapX > 0 && overlapX <= overlapY;
                const mag = (useX ? overlapX : overlapY) + 6;
                pushX += (dx / len) * mag;
                pushY += (dy / len) * mag;
            }

            if (!hadOverlap) break;

            const step = 0.28 + (attempts % 5) * 0.11;
            cx += pushX * step;
            cy += pushY * step;

            placed = tryCagePlacement(cx, cy, halfW, halfH, rot, gap, anchorBots);
            if (placed) return placed;
        }

        // Ring search around bot-centered anchor (still requires bot inside + no overlap)
        const ringSteps = 16;
        for (let ring = 1; ring <= 4; ring++) {
            const dist = ring * (gap + 14);
            for (let s = 0; s < ringSteps; s++) {
                const ang = (s / ringSteps) * Math.PI * 2;
                const tx = anchorCx + Math.cos(ang) * dist;
                const ty = anchorCy + Math.sin(ang) * dist;
                placed = tryCagePlacement(tx, ty, halfW, halfH, rot, gap, anchorBots);
                if (placed) return placed;
            }
        }

        return { cx: anchorCx, cy: anchorCy, ok: false };
    }

    function getActivePhaseCages() {
        return cages;
    }

    function getLastSpawnedPhaseCage() {
        return cages.length ? cages[cages.length - 1] : null;
    }

    function getActivePhaseCage() {
        return getLastSpawnedPhaseCage();
    }

    function maxCages() {
        const n = Number(cfg.maxSimultaneous);
        return Number.isFinite(n) && n > 0 ? Math.min(3, Math.floor(n)) : DEFAULT_CFG.maxSimultaneous;
    }

    function paletteForSpawn() {
        const fromCfg = cfg.cageAccentColors;
        if (Array.isArray(fromCfg) && fromCfg.length >= 3) {
            return fromCfg.slice(0, 3);
        }
        return DEFAULT_CFG.cageAccentColors.slice();
    }

    function botEligible(bot) {
        return bot && bot.active && !bot.isInvulnerable && bot.radius > 5;
    }

    /** Invulnerabilitatea (TITAN) blochează capturile noi, dar nu eliberează prada deja prinsă. */
    function botStillTrapped(bot) {
        return !!(bot && bot.active && bot.radius > 5);
    }

    function isBotTrappedInAnyCage(bot) {
        for (let i = 0; i < cages.length; i++) {
            const trapped = cages[i].trapped;
            if (trapped && trapped.indexOf(bot) !== -1) return true;
        }
        return false;
    }

    function gatherBotsInWarpRange(player, poolBots) {
        const range = Number(cfg.acquireRange) || DEFAULT_CFG.acquireRange;
        const rangeSq = range * range;
        const list = [];
        for (let i = 0; i < poolBots.length; i++) {
            const bot = poolBots[i];
            if (!botEligible(bot)) continue;
            const dx = bot.x - player.x;
            const dy = bot.y - player.y;
            if (dx * dx + dy * dy <= rangeSq) list.push(bot);
        }
        return list;
    }

    function buildCageFromBots(candidates) {
        const pad = Number(cfg.paddingPx) || DEFAULT_CFG.paddingPx;
        const minHalf = Number(cfg.minHalfSize) || DEFAULT_CFG.minHalfSize;
        const extraPer = Number(cfg.extraPadPerBot) || DEFAULT_CFG.extraPadPerBot;
        const bonus = Math.max(0, candidates.length - 1) * extraPer;

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < candidates.length; i++) {
            const bot = candidates[i];
            const r = bot.radius;
            minX = Math.min(minX, bot.x - r);
            maxX = Math.max(maxX, bot.x + r);
            minY = Math.min(minY, bot.y - r);
            maxY = Math.max(maxY, bot.y + r);
        }

        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        const spanX = (maxX - minX) * 0.5;
        const spanY = (maxY - minY) * 0.5;
        const halfW = Math.max(minHalf, spanX + pad + bonus);
        const halfH = Math.max(minHalf * 0.92, spanY + pad + bonus * 0.88);

        return { cx, cy, halfW, halfH };
    }

    function pickNearestFreeBotToPlayer(player, freeBots) {
        let best = null;
        let bestSq = Infinity;
        for (let i = 0; i < freeBots.length; i++) {
            const bot = freeBots[i];
            const dx = bot.x - player.x;
            const dy = bot.y - player.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestSq) {
                bestSq = dSq;
                best = bot;
            }
        }
        return best;
    }

    function collectTrappedAtSpawn(candidates, cx, cy, halfW, halfH, rot) {
        const trapped = [];
        for (let i = 0; i < candidates.length; i++) {
            const bot = candidates[i];
            if (!botEligible(bot) || isBotTrappedInAnyCage(bot)) continue;
            if (botInsideRotatedCage(bot, cx, cy, halfW, halfH, rot)) trapped.push(bot);
        }
        return trapped;
    }

    function botToCageLocal(bot, cage) {
        const cos = Math.cos(cage.rot);
        const sin = Math.sin(cage.rot);
        const lx = (bot.x - cage.cx) * cos + (bot.y - cage.cy) * sin;
        const ly = -(bot.x - cage.cx) * sin + (bot.y - cage.cy) * cos;
        return { lx, ly, cos, sin };
    }

    function setBotFromCageLocal(bot, cage, lx, ly, cos, sin) {
        bot.x = cage.cx + lx * cos - ly * sin;
        bot.y = cage.cy + lx * sin + ly * cos;
    }

    function isBotTrappedInCage(bot, cage) {
        return !!(cage && cage.trapped && cage.trapped.indexOf(bot) !== -1);
    }

    function filterBotsForNewCage(player, poolBots) {
        const inRange = gatherBotsInWarpRange(player, poolBots);
        const free = [];
        for (let i = 0; i < inRange.length; i++) {
            const bot = inRange[i];
            if (!isBotTrappedInAnyCage(bot)) free.push(bot);
        }
        return free;
    }

    /**
     * @param {string} [_primaryGlow] — ignorat; culori fixe din cageAccentColors (albastru, verde, galben)
     */
    function spawnPhaseCageFromWarp(player, poolBots, _primaryGlow) {
        if (!player || !poolBots) return false;
        if (cages.length >= maxCages()) return false;

        const candidates = filterBotsForNewCage(player, poolBots);
        if (!candidates.length) return false;

        const primary = pickNearestFreeBotToPlayer(player, candidates);
        if (!primary) return false;

        const geom = buildCageFromBots([primary]);
        const rot = (Math.random() - 0.5) * 0.22;
        const resolved = resolveCagePosition(
            geom.cx,
            geom.cy,
            geom.halfW,
            geom.halfH,
            rot,
            player,
            [primary]
        );
        if (!resolved.ok) return false;

        const life = Math.max(0.5, Number(cfg.cageLifeSec) || DEFAULT_CFG.cageLifeSec);
        const fadeSec = Math.max(0.12, Number(cfg.fadeSec) || DEFAULT_CFG.fadeSec);
        const palette = paletteForSpawn();
        const colorIndex = cageSpawnSerial % palette.length;
        const accentColor = palette[colorIndex] || palette[0];
        cageSpawnSerial += 1;

        const trapped = collectTrappedAtSpawn(
            candidates,
            resolved.cx,
            resolved.cy,
            geom.halfW,
            geom.halfH,
            rot
        );

        if (!trapped.length || trapped.indexOf(primary) === -1) return false;

        const maxTrap = maxTrappedPerCage();
        const capped =
            hasAscendModFn() && trapped.length > maxTrap ? trapped.slice(0, maxTrap) : trapped;
        for (let ti = 0; ti < capped.length; ti++) resetPhaseCageWallBleedSfxForBot(capped[ti]);

        cages.push({
            serial: cageSpawnSerial,
            cx: resolved.cx,
            cy: resolved.cy,
            halfW: geom.halfW,
            halfH: geom.halfH,
            rot,
            life,
            maxLife: life,
            fadeSec,
            colorIndex,
            accentColor,
            trapped: capped,
            huntTarget: null,
            age: 0,
            wallBleedIntensity: 0,
            huntPulse: 0,
        });
        return true;
    }

    function maxTrappedPerCage() {
        const n = Number(x3Cfg.maxTrappedPerCage);
        return Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : DEFAULT_X3_CFG.maxTrappedPerCage;
    }

    function huntRangePx() {
        const r = Number(x3Cfg.huntRange);
        return Number.isFinite(r) && r > 0 ? r : Number(cfg.acquireRange) || DEFAULT_X3_CFG.huntRange;
    }

    function huntTrackSpeed() {
        const s = Number(x3Cfg.trackSpeed);
        return Number.isFinite(s) && s > 0 ? s : DEFAULT_X3_CFG.trackSpeed;
    }

    function huntSprintMult() {
        const m = Number(x3Cfg.huntSprintMult);
        return Number.isFinite(m) && m > 0 ? m : DEFAULT_X3_CFG.huntSprintMult;
    }

    function huntSprintRangePx() {
        const r = Number(x3Cfg.huntSprintRangePx);
        return Number.isFinite(r) && r > 0 ? r : DEFAULT_X3_CFG.huntSprintRangePx;
    }

    function captureCenterSlack() {
        const s = Number(x3Cfg.captureCenterSlack);
        return Number.isFinite(s) && s >= 0 ? s : DEFAULT_X3_CFG.captureCenterSlack;
    }

    function poolBots() {
        return getPoolBotsFn ? getPoolBotsFn() : [];
    }

    function overlapsOtherCages(selfCage, cx, cy) {
        const gap = separationGap();
        const selfBox = cageWorldAABB(cx, cy, selfCage.halfW, selfCage.halfH, selfCage.rot);
        for (let i = 0; i < cages.length; i++) {
            const other = cages[i];
            if (other === selfCage) continue;
            const ob = cageWorldAABB(other.cx, other.cy, other.halfW, other.halfH, other.rot);
            if (aabbOverlap(selfBox, ob, gap)) return true;
        }
        return false;
    }

    function snapshotTrappedLocals(cage) {
        const trapped = cage.trapped || [];
        const out = [];
        for (let i = 0; i < trapped.length; i++) {
            const bot = trapped[i];
            if (!botStillTrapped(bot)) continue;
            const local = botToCageLocal(bot, cage);
            out.push({ bot, lx: local.lx, ly: local.ly, cos: local.cos, sin: local.sin });
        }
        return out;
    }

    function restoreTrappedLocals(cage, locals) {
        for (let i = 0; i < locals.length; i++) {
            const row = locals[i];
            if (!row.bot || !botStillTrapped(row.bot)) continue;
            if (!isBotTrappedInCage(row.bot, cage)) continue;
            setBotFromCageLocal(row.bot, cage, row.lx, row.ly, row.cos, row.sin);
        }
    }

    function growCageGeometryFromTrapped(cage) {
        const trapped = cage.trapped;
        if (!trapped || !trapped.length) return;
        const geom = buildCageFromBots(trapped);
        cage.halfW = Math.max(cage.halfW, geom.halfW);
        cage.halfH = Math.max(cage.halfH, geom.halfH);
    }

    function trappedCount(cage) {
        return cage.trapped ? cage.trapped.filter((b) => botStillTrapped(b)).length : 0;
    }

    function pickHuntTarget(cage, poolBotsList) {
        const maxTrap = maxTrappedPerCage();
        if (trappedCount(cage) >= maxTrap) return null;
        const range = huntRangePx();
        const rangeSq = range * range;
        let best = null;
        let bestSq = Infinity;
        for (let i = 0; i < poolBotsList.length; i++) {
            const bot = poolBotsList[i];
            if (!botEligible(bot) || isBotTrappedInAnyCage(bot)) continue;
            const dx = bot.x - cage.cx;
            const dy = bot.y - cage.cy;
            const dSq = dx * dx + dy * dy;
            if (dSq > rangeSq || dSq >= bestSq) continue;
            bestSq = dSq;
            best = bot;
        }
        return best;
    }

    function resetPhaseCageWallBleedSfxForBot(bot) {
        if (bot) bot._phaseCageWallBleedSfxPlayed = false;
    }

    function trapBotInCage(cage, bot) {
        if (!cage.trapped) cage.trapped = [];
        if (isBotTrappedInCage(bot, cage) || isBotTrappedInAnyCage(bot)) return false;
        if (trappedCount(cage) >= maxTrappedPerCage()) return false;
        if (!botEligible(bot)) return false;
        resetPhaseCageWallBleedSfxForBot(bot);
        cage.trapped.push(bot);
        growCageGeometryFromTrapped(cage);
        if (cage.huntTarget === bot) cage.huntTarget = null;
        if (typeof global.playPhaseCageCaptureSound === "function") {
            global.playPhaseCageCaptureSound(cage.serial);
        }
        return true;
    }

    function botInsideCageForCapture(bot, cage) {
        if (
            botInsideRotatedCage(
                bot,
                cage.cx,
                cage.cy,
                cage.halfW,
                cage.halfH,
                cage.rot
            )
        ) {
            return true;
        }
        if (!hasAscendModFn()) return false;
        const dist = Math.hypot(bot.x - cage.cx, bot.y - cage.cy);
        const grab =
            Math.min(cage.halfW, cage.halfH) * 0.78 +
            Math.max(4, bot.radius) * 0.55 +
            captureCenterSlack() * 0.35;
        return dist <= grab;
    }

    function tryCaptureBotsInCage(cage, poolBotsList) {
        const maxTrap = maxTrappedPerCage();
        for (let i = 0; i < poolBotsList.length; i++) {
            if (trappedCount(cage) >= maxTrap) break;
            const bot = poolBotsList[i];
            if (!botEligible(bot) || isBotTrappedInCage(bot, cage)) continue;
            if (isBotTrappedInAnyCage(bot)) continue;
            if (!botInsideCageForCapture(bot, cage)) continue;
            trapBotInCage(cage, bot);
        }
    }

    function ascendAllowsOverlapWithBot(cage, bot) {
        if (!hasAscendModFn() || !cage || !botEligible(bot)) return false;
        if (isBotTrappedInCage(bot, cage)) return true;
        if (trappedCount(cage) >= maxTrappedPerCage()) return false;
        if (cage.huntTarget === bot) return true;
        return botInsideCageForCapture(bot, cage);
    }

    function huntDelaySec() {
        const d = Number(x3Cfg.huntDelaySec);
        return Number.isFinite(d) && d >= 0 ? d : DEFAULT_X3_CFG.huntDelaySec;
    }

    function updateCageAscendHunt(cage, dt) {
        if (!hasAscendModFn() || !getPoolBotsFn) return;
        if ((Number(cage.age) || 0) < huntDelaySec()) {
            cage.huntPulse = Math.max(0, (cage.huntPulse || 0) - dt * 2);
            if (typeof global.updatePhaseCageHuntDrone === "function") {
                global.updatePhaseCageHuntDrone(cage.serial, cage.huntPulse || 0, false);
            }
            return;
        }
        const bots = poolBots();
        const maxTrap = maxTrappedPerCage();
        const locals = snapshotTrappedLocals(cage);
        const huntTargetBefore = cage.huntTarget;
        let huntMoved = false;

        if (
            cage.huntTarget &&
            (!botEligible(cage.huntTarget) || isBotTrappedInAnyCage(cage.huntTarget))
        ) {
            cage.huntTarget = null;
        }

        if (trappedCount(cage) < maxTrap) {
            if (!cage.huntTarget || !botEligible(cage.huntTarget) || isBotTrappedInAnyCage(cage.huntTarget)) {
                cage.huntTarget = pickHuntTarget(cage, bots);
            }
        } else {
            cage.huntTarget = null;
        }

        if (cage.huntTarget && cage.huntTarget !== huntTargetBefore) {
            if (typeof global.playPhaseCageHuntLockSound === "function") {
                global.playPhaseCageHuntLockSound();
            }
        }

        const target = cage.huntTarget;
        if (target && botEligible(target) && !isBotTrappedInAnyCage(target)) {
            const dx = target.x - cage.cx;
            const dy = target.y - cage.cy;
            const dist = Math.hypot(dx, dy) || 0.001;
            let speed = huntTrackSpeed();
            if (dist <= huntSprintRangePx()) {
                speed *= huntSprintMult();
            }
            const step = Math.min(dist, speed * dt);
            const nx = cage.cx + (dx / dist) * step;
            const ny = cage.cy + (dy / dist) * step;
            if (tryMoveCageCenterWithSlide(cage, nx, ny, step)) {
                cage.huntPulse = Math.min(1, (cage.huntPulse || 0) + dt * 3.5);
                huntMoved = true;
            }
            const slack = captureCenterSlack() + target.radius * 0.5;
            if (dist <= slack || botInsideCageForCapture(target, cage)) {
                trapBotInCage(cage, target);
                tryCaptureBotsInCage(cage, bots);
            }
        } else {
            cage.huntPulse = Math.max(0, (cage.huntPulse || 0) - dt * 2);
        }

        restoreTrappedLocals(cage, locals);
        tryCaptureBotsInCage(cage, bots);

        if (typeof global.updatePhaseCageHuntDrone === "function") {
            global.updatePhaseCageHuntDrone(cage.serial, cage.huntPulse || 0, huntMoved);
        }
    }

    function tryMoveCageCenter(cage, nx, ny) {
        const clamped = clampCageCenterToWorld(nx, ny, cage.halfW, cage.halfH, cage.rot);
        nx = clamped.cx;
        ny = clamped.cy;
        if (!overlapsOtherCages(cage, nx, ny)) {
            cage.cx = nx;
            cage.cy = ny;
            return true;
        }
        const mx = (cage.cx + nx) * 0.5;
        const my = (cage.cy + ny) * 0.5;
        const clampedMid = clampCageCenterToWorld(mx, my, cage.halfW, cage.halfH, cage.rot);
        if (!overlapsOtherCages(cage, clampedMid.cx, clampedMid.cy)) {
            cage.cx = clampedMid.cx;
            cage.cy = clampedMid.cy;
            return true;
        }
        return false;
    }

    function tryMoveCageCenterWithSlide(cage, nx, ny, slideDist) {
        if (tryMoveCageCenter(cage, nx, ny)) return true;
        const dx = nx - cage.cx;
        const dy = ny - cage.cy;
        const len = Math.hypot(dx, dy) || 1;
        const slide = Math.max(4, slideDist * 0.65);
        const perpX = -dy / len;
        const perpY = dx / len;
        for (let s = -1; s <= 1; s += 2) {
            const sx = cage.cx + perpX * slide * s;
            const sy = cage.cy + perpY * slide * s;
            if (tryMoveCageCenter(cage, sx, sy)) return true;
        }
        return false;
    }

    function applyPhaseCagePostMoveCapture() {
        if (!hasAscendModFn() || !getPoolBotsFn || !cages.length) return;
        const bots = poolBots();
        for (let i = 0; i < cages.length; i++) {
            tryCaptureBotsInCage(cages[i], bots);
        }
    }

    function bleedBandPx() {
        const v = Number(x2Cfg.bleedBandPx);
        return Number.isFinite(v) && v > 0 ? v : DEFAULT_X2_CFG.bleedBandPx;
    }

    function botInWallBleedBand(bot, cage) {
        const band = bleedBandPx();
        const r = Math.max(4, bot.radius);
        const maxX = Math.max(6, cage.halfW - r);
        const maxY = Math.max(6, cage.halfH - r);
        const local = botToCageLocal(bot, cage);
        const distToWallX = maxX - Math.abs(local.lx);
        const distToWallY = maxY - Math.abs(local.ly);
        return Math.min(distToWallX, distToWallY) <= band;
    }

    function removeBotFromCageTrapped(cage, bot) {
        if (!cage || !cage.trapped || !bot) return;
        const idx = cage.trapped.indexOf(bot);
        if (idx !== -1) cage.trapped.splice(idx, 1);
    }

    function killTrappedBotFromResonance(cage, bot) {
        removeBotFromCageTrapped(cage, bot);
        if (onBotKilledFn) onBotKilledFn(bot);
        const pool = getNutrientPoolFn ? getNutrientPoolFn() : null;
        if (pool && typeof bot.explode === "function") bot.explode(pool);
    }

    function resonanceDps() {
        const ability = getAbilitySettingsFn ? getAbilitySettingsFn() : {};
        const baseDps = Number(ability.VAMPIRE_DAMAGE_BOTS) || 6.4;
        const mult = Number(x2Cfg.damageMult);
        return baseDps * (Number.isFinite(mult) ? mult : DEFAULT_X2_CFG.damageMult);
    }

    function applyPhaseCageWallBleed(bot, dt) {
        if (!hasResonanceModFn() || !cages.length || !botEligible(bot)) return;
        if (bot.frozen > 0) return;

        const bleedDelay = Number(x2Cfg.bleedDelaySec);
        const delay = Number.isFinite(bleedDelay) ? bleedDelay : DEFAULT_X2_CFG.bleedDelaySec;
        const minKill = Number(x2Cfg.minKillRadius) || DEFAULT_X2_CFG.minKillRadius;
        const dps = resonanceDps();
        const sfxCd = Number(x2Cfg.sfxCooldownSec) || DEFAULT_X2_CFG.sfxCooldownSec;

        for (let i = 0; i < cages.length; i++) {
            const cage = cages[i];
            if (!isBotTrappedInCage(bot, cage)) continue;
            const age = Number(cage.age) || 0;
            if (age < delay) continue;
            if (!botInWallBleedBand(bot, cage)) continue;

            const band = bleedBandPx();
            const local = botToCageLocal(bot, cage);
            const maxX = Math.max(6, cage.halfW - Math.max(4, bot.radius));
            const maxY = Math.max(6, cage.halfH - Math.max(4, bot.radius));
            const proximity = Math.min(maxX - Math.abs(local.lx), maxY - Math.abs(local.ly));
            const stress = 1 - Math.max(0, Math.min(1, proximity / band));
            cage.wallBleedIntensity = Math.max(cage.wallBleedIntensity || 0, 0.35 + stress * 0.65);

            bot.radius -= dps * dt;
            bot.phaseCageBleedGlow = Math.max(bot.phaseCageBleedGlow || 0, 0.22 + stress * 0.5);

            if (!bot._phaseCageWallBleedSfxPlayed) {
                if (typeof global.playPhaseCageWallBleedSound === "function") {
                    global.playPhaseCageWallBleedSound(stress, bot.radius);
                }
                bot._phaseCageWallBleedSfxPlayed = true;
            }
            if (!cage._bleedSfxCd || cage._bleedSfxCd <= 0) {
                if (typeof global.pulsePhaseCageResonanceShake === "function") {
                    global.pulsePhaseCageResonanceShake(stress);
                }
                cage.resonanceShakeT = 0.11 + stress * 0.07;
                cage.resonanceShakeAmp = 1.8 + stress * 3.2;
                cage._bleedSfxCd = sfxCd;
            } else {
                cage._bleedSfxCd -= dt;
            }

            if (bot.radius < minKill) killTrappedBotFromResonance(cage, bot);
            return;
        }
    }

    function updatePhaseCage(dt) {
        if (!cages.length) return;
        for (let i = cages.length - 1; i >= 0; i--) {
            const cage = cages[i];
            cage.age = (Number(cage.age) || 0) + dt;
            cage.wallBleedIntensity = 0;
            if (cage.resonanceShakeT > 0) {
                cage.resonanceShakeT -= dt;
                if (cage.resonanceShakeT < 0) cage.resonanceShakeT = 0;
            }
            cage.life -= dt;
            if (cage.life <= 0) {
                if (typeof global.releasePhaseCageHuntDrone === "function") {
                    global.releasePhaseCageHuntDrone(cage.serial);
                }
                cages.splice(i, 1);
                continue;
            }
            if (cage.trapped) {
                cage.trapped = cage.trapped.filter((b) => botStillTrapped(b));
            }
            if (hasAscendModFn()) {
                updateCageAscendHunt(cage, dt);
            } else if (cage.huntPulse > 0) {
                cage.huntPulse = Math.max(0, cage.huntPulse - dt * 2);
            }
        }
    }

    function isBotInPhaseCage(bot) {
        return isBotTrappedInAnyCage(bot);
    }

    function clampBotToPhaseCage(bot) {
        if (!cages.length || bot.frozen > 0) return;
        for (let i = 0; i < cages.length; i++) {
            const cage = cages[i];
            if (!isBotTrappedInCage(bot, cage)) continue;

            const r = Math.max(4, bot.radius);
            const maxX = Math.max(6, cage.halfW - r);
            const maxY = Math.max(6, cage.halfH - r);
            const local = botToCageLocal(bot, cage);
            let lx = local.lx;
            let ly = local.ly;
            lx = Math.max(-maxX, Math.min(maxX, lx));
            ly = Math.max(-maxY, Math.min(maxY, ly));
            setBotFromCageLocal(bot, cage, lx, ly, local.cos, local.sin);
        }
    }

    function repelBotFromPhaseCageForCage(bot, cage) {
        if (!botEligible(bot) || isBotTrappedInCage(bot, cage)) return;
        if (ascendAllowsOverlapWithBot(cage, bot)) return;

        const r = Math.max(4, bot.radius);
        const hw = cage.halfW;
        const hh = cage.halfH;
        const local = botToCageLocal(bot, cage);
        let lx = local.lx;
        let ly = local.ly;
        const cos = local.cos;
        const sin = local.sin;

        const closestX = Math.max(-hw, Math.min(hw, lx));
        const closestY = Math.max(-hh, Math.min(hh, ly));
        let nx = lx - closestX;
        let ny = ly - closestY;
        const distSq = nx * nx + ny * ny;

        if (lx > -hw && lx < hw && ly > -hh && ly < hh) {
            const dL = lx + hw;
            const dR = hw - lx;
            const dT = ly + hh;
            const dB = hh - ly;
            const m = Math.min(dL, dR, dT, dB);
            const pad = 2 + r * 0.15;
            if (m === dL) lx = -hw - pad;
            else if (m === dR) lx = hw + pad;
            else if (m === dT) ly = -hh - pad;
            else ly = hh + pad;
        } else if (distSq < r * r) {
            const dist = Math.sqrt(distSq) || 0.001;
            const push = r - dist + 2;
            lx += (nx / dist) * push;
            ly += (ny / dist) * push;
        } else {
            return;
        }

        setBotFromCageLocal(bot, cage, lx, ly, cos, sin);
    }

    function repelBotFromPhaseCage(bot) {
        if (!cages.length || !botEligible(bot)) return;
        for (let i = 0; i < cages.length; i++) {
            repelBotFromPhaseCageForCage(bot, cages[i]);
        }
    }

    function drawResonanceInnerFade(ctx, cage, hw, hh, bleed, lifeAlpha, glow, timeNow) {
        if (bleed <= 0.02 || !hasResonanceModFn()) return;
        const band = bleedBandPx();
        const steps = 6;
        const breathe = 0.92 + Math.sin(timeNow * 0.004 + cage.colorIndex * 1.3) * 0.08;
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.shadowBlur = 0;
        for (let s = 0; s < steps; s++) {
            const t = (s + 1) / steps;
            const insetDist = 1.5 + t * band * 0.92;
            const innerW = hw - insetDist;
            const innerH = hh - insetDist;
            if (innerW < 10 || innerH < 10) break;
            const fade = (1 - t) * (1 - t);
            ctx.globalAlpha = lifeAlpha * bleed * fade * 0.2 * breathe;
            ctx.lineWidth = 1;
            ctx.strokeStyle = glow;
            ctx.strokeRect(-innerW, -innerH, innerW * 2, innerH * 2);
        }
    }

    function drawOneCage(ctx, cage, timeNow) {
        const glow = cage.accentColor || DEFAULT_CFG.cageAccentColors[0];
        const fadeSec = cage.fadeSec;
        let lifeAlpha = 1;
        if (cage.life < fadeSec) lifeAlpha = Math.max(0, cage.life / fadeSec);

        const huntPulse = cage.huntPulse || 0;
        const pulseGlow =
            15 +
            Math.sin(timeNow * 0.005) * 10 +
            huntPulse * (8 + Math.sin(timeNow * 0.018) * 6);
        const hw = cage.halfW;
        const hh = cage.halfH;
        const inset = Math.min(10, Math.min(hw, hh) * 0.08);

        let shakeX = 0;
        let shakeY = 0;
        if (cage.resonanceShakeT > 0 && cage.resonanceShakeAmp > 0) {
            const amp = cage.resonanceShakeAmp * (cage.resonanceShakeT / 0.18);
            shakeX = (Math.random() * 2 - 1) * amp;
            shakeY = (Math.random() * 2 - 1) * amp;
        }

        ctx.save();
        ctx.translate(cage.cx + shakeX, cage.cy + shakeY);
        ctx.rotate(cage.rot);
        ctx.globalAlpha = lifeAlpha;

        ctx.strokeStyle = glow;
        ctx.shadowColor = glow;
        ctx.lineJoin = "miter";
        ctx.lineWidth = 12 + huntPulse * 2;
        ctx.shadowBlur = pulseGlow;
        ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);

        if (huntPulse > 0.05 && hasAscendModFn()) {
            ctx.globalAlpha = lifeAlpha * huntPulse * 0.35;
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 6 + huntPulse * 10;
            ctx.strokeStyle = "#e8f7ff";
            ctx.strokeRect(-hw + 4, -hh + 4, hw * 2 - 8, hh * 2 - 8);
            ctx.globalAlpha = lifeAlpha * 0.6;
            ctx.strokeStyle = glow;
            ctx.shadowBlur = 0;
        }

        ctx.lineWidth = 2;
        ctx.globalAlpha = lifeAlpha * 0.6;
        ctx.shadowBlur = 0;
        ctx.strokeStyle = glow;
        ctx.strokeRect(-hw + inset, -hh + inset, hw * 2 - inset * 2, hh * 2 - inset * 2);

        const bleed = cage.wallBleedIntensity || 0;
        drawResonanceInnerFade(ctx, cage, hw, hh, bleed, lifeAlpha, glow, timeNow);

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawPhaseCage(ctx, timeNow) {
        if (!cages.length || !ctx) return;
        for (let i = 0; i < cages.length; i++) {
            drawOneCage(ctx, cages[i], timeNow);
        }
    }

    global.configurePhaseCage = configurePhaseCage;
    global.spawnPhaseCageFromWarp = spawnPhaseCageFromWarp;
    global.updatePhaseCage = updatePhaseCage;
    global.clampBotToPhaseCage = clampBotToPhaseCage;
    global.repelBotFromPhaseCage = repelBotFromPhaseCage;
    global.drawPhaseCage = drawPhaseCage;
    global.clearPhaseCage = clearPhaseCage;
    global.getActivePhaseCage = getActivePhaseCage;
    global.getLastSpawnedPhaseCage = getLastSpawnedPhaseCage;
    global.getActivePhaseCages = getActivePhaseCages;
    global.isBotInPhaseCage = isBotInPhaseCage;
    global.applyPhaseCageWallBleed = applyPhaseCageWallBleed;
    global.applyPhaseCagePostMoveCapture = applyPhaseCagePostMoveCapture;
})(typeof window !== "undefined" ? window : globalThis);
