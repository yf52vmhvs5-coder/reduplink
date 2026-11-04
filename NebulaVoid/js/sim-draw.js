/**
 * NEBULA VOID — requestAnimationFrame draw loop (camera, world render, HUD overlay).
 * Call configureSimDraw() from entities.js after simulation state exists.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, unknown>} */
    let deps = null;
    let drawLoopActive = false;
    let drawLastTime = performance.now();

    const localEyeHost = {
        blinkTimer: 0.5,
        isBlinking: false,
        blinkDuration: 0,
        cachedIrisGrad: null,
        lastR: -1,
        lastCol: "",
        aimX: null,
        aimY: null,
    };
    const remoteEyeHosts = new WeakMap();

    function eyeHostForRemote(rp) {
        let host = remoteEyeHosts.get(rp);
        if (!host) {
            host = {
                blinkTimer: 0.31 + Math.random() * 0.93,
                isBlinking: false,
                blinkDuration: 0,
                cachedIrisGrad: null,
                lastR: -1,
                lastCol: "",
            };
            remoteEyeHosts.set(rp, host);
        }
        return host;
    }

    /** Disc plin, ca boții: fără contur, glow discret. Freeze-ul rămâne alb cu umbră mov. */
    function drawPlayerSkin(ctx, x, y, radius, fillColor, lookX, lookY, eyeHost, dt, frozen) {
        const r = Math.max(1, radius);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 6.28);
        if (frozen) {
            ctx.fillStyle = "#ffffff";
            ctx.shadowBlur = 20;
            ctx.shadowColor = "#8a2be2";
        } else {
            ctx.fillStyle = fillColor;
            ctx.shadowBlur = 15;
            ctx.shadowColor = fillColor;
        }
        ctx.fill();
        ctx.restore();
        if (typeof global.drawReactiveEye === "function") {
            global.drawReactiveEye(ctx, x, y, r, fillColor, lookX, lookY, eyeHost, dt);
        }
    }

    /** X-ul de cooldown. cdProgress 0 = tocmai folosit, 1 = gata. Conturul ia culoarea skinului. */
    function drawAbilityCross(ctx, x, y, radius, cdProgress, outlineColor) {
        const progress = Math.max(0, Math.min(1, cdProgress));
        const xSize = Math.max(5, radius * 0.35);
        const outlineW = Math.max(2.2, Math.min(4.2, xSize * 0.5));
        const fillW = Math.max(1.05, outlineW * 0.42);
        const tipInset = (outlineW - fillW) * 0.65;
        const reach = Math.max(0, xSize - tipInset);
        const inner = reach * (1 - progress);
        ctx.save();
        ctx.translate(x, y);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = outlineColor || ENTITY_TYPES.GRAVITY_WELL.color;
        ctx.lineWidth = outlineW;
        ctx.beginPath();
        ctx.moveTo(-xSize, -xSize);
        ctx.lineTo(xSize, xSize);
        ctx.moveTo(xSize, -xSize);
        ctx.lineTo(-xSize, xSize);
        ctx.stroke();
        if (progress > 0 && reach > inner) {
            ctx.strokeStyle = GAME_SETTINGS.BOUNTY_TIERS[0].color;
            ctx.lineWidth = fillW;
            ctx.beginPath();
            ctx.moveTo(-reach, -reach);
            ctx.lineTo(-inner, -inner);
            ctx.moveTo(reach, reach);
            ctx.lineTo(inner, inner);
            ctx.moveTo(reach, -reach);
            ctx.lineTo(inner, -inner);
            ctx.moveTo(-reach, reach);
            ctx.lineTo(-inner, inner);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** Colț dreapta-jos, în pixeli de ecran. Taunt-ul stă la stânga; X-ul urcă doar peste butonul de abilitate de pe tabletă. */
    function cooldownHudPoint(screenW, screenH) {
        const crossRadius = 20;
        const xSize = Math.max(5, crossRadius * 0.35);
        const pad = 20;
        let cx = screenW - pad - xSize;
        let cy = screenH - pad - xSize;
        const blockers = ["tabletPad"];
        for (let i = 0; i < blockers.length; i++) {
            const el = document.getElementById(blockers[i]);
            if (!el || el.hidden) continue;
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            const half = xSize + 8;
            const overlaps =
                cx + half > rect.left &&
                cx - half < rect.right &&
                cy + half > rect.top &&
                cy - half < rect.bottom;
            if (overlaps) cy = rect.top - 12 - xSize;
        }
        return { cx, cy, crossRadius };
    }

    function configureSimDraw(nextDeps) {
        if (!nextDeps || typeof nextDeps.getCtx !== "function" || !nextDeps.cam) {
            throw new Error("configureSimDraw requires getCtx, cam, and full draw dependencies");
        }
        if (typeof nextDeps.update !== "function") {
            throw new Error("configureSimDraw requires update(dt)");
        }
        deps = nextDeps;
    }

    function ensureDrawLoop() {
        if (drawLoopActive) return;
        drawLoopActive = true;
        drawLastTime = performance.now();
        requestAnimationFrame(draw);
    }

    /** Force a fresh rAF chain (e.g. MP re-enter after elimination overlay stopped the loop). */
    function restartDrawLoop() {
        drawLoopActive = false;
        ensureDrawLoop();
    }

    function mirrorPlayerOutOfArena() {
        return !!(
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror" &&
            typeof global.isMirrorPlayerOutOfArena === "function" &&
            global.isMirrorPlayerOutOfArena()
        );
    }

    function draw() {
        if (!deps) return;

        const ctx = deps.getCtx();
        const screenW = deps.getScreenW();
        const screenH = deps.getScreenH();
        const introScreen = deps.dom.introScreen;
        const startMenu = deps.dom.startMenu;
        const optionsScreen = deps.dom.optionsScreen;
        const aboutScreen = deps.dom.aboutScreen;
        const multiplayerLobbyScreen = deps.dom.multiplayerLobbyScreen;
        const uiContainer = deps.dom.uiContainer;

        const gameActive = deps.getGameActive();
        const isDying = deps.getIsDying();
        const mouse = deps.getMouse();
        const player = deps.getPlayer();
        const activeEffects = deps.getActiveEffects();
        const bountySystem = deps.getBountySystem();
        const selectedAbility = deps.getSelectedAbility();

        const { GAME_SETTINGS, ABILITY_SETTINGS, ENTITY_TYPES } = deps.settings;
        const {
            poolJellyBubbles,
            poolBHSiphonParticles,
            poolBloodRifts,
            poolParticles,
            poolNutrients,
            poolBots,
            poolAuraParticles,
        } = deps.pools;
        const nutrientHsl = deps.nutrientHsl;
        const RAVENOUS_X3_CFG = deps.ravenousX3Cfg;
        const cam = deps.cam;

        const currentTime = performance.now();
        window._drawFrameTime = currentTime;
        const dt = Math.min((currentTime - drawLastTime) / 1000, 0.1);
        drawLastTime = currentTime;

        const skipMirrorArena = mirrorPlayerOutOfArena();
        const paintArena = (gameActive || isDying) && !skipMirrorArena;
        if (
            paintArena &&
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror" &&
            typeof global.tickRemoteDisplayInterpolation === "function"
        ) {
            global.tickRemoteDisplayInterpolation(dt);
        }

        if (typeof global.tickMpTaunts === "function") global.tickMpTaunts(dt);
        if (typeof global.tickTabletPad === "function") global.tickTabletPad();

        ctx.fillStyle = "#020202";
        ctx.fillRect(0, 0, screenW, screenH);

        if (!paintArena) {
            const hubUp = introScreen && introScreen.style.display !== "none";
            const menuUp = startMenu.style.display !== "none";
            const overlayUp =
                (optionsScreen && !optionsScreen.hidden) ||
                (aboutScreen && !aboutScreen.hidden) ||
                (multiplayerLobbyScreen && !multiplayerLobbyScreen.hidden);
            if (hubUp || menuUp || overlayUp) requestAnimationFrame(draw);
            else drawLoopActive = false;
            return;
        }

        deps.updateScreenShake(dt);

        if (typeof deps.tickWasdInputSmoothing === "function") {
            deps.tickWasdInputSmoothing(dt);
        }

        const centerX = screenW / 2;
        const centerY = screenH / 2;
        const controlScheme =
            typeof deps.getControlScheme === "function" ? deps.getControlScheme() : "mouse";
        const useVectorAim =
            (typeof global.usesVectorAim === "function" && global.usesVectorAim()) ||
            controlScheme === "wasd";
        let desiredLookAheadX;
        let desiredLookAheadY;
        if (useVectorAim && typeof deps.getWasdInputSmoothed === "function") {
            const v = deps.getWasdInputSmoothed();
            const len = Math.hypot(v.x, v.y);
            const lookAheadMax = 110;
            if (len < 0.01) {
                desiredLookAheadX = 0;
                desiredLookAheadY = 0;
            } else {
                const lookAheadDist = lookAheadMax * Math.min(1, len);
                desiredLookAheadX = (v.x / len) * lookAheadDist;
                desiredLookAheadY = (v.y / len) * lookAheadDist;
            }
        } else {
            const mouseOffsetX = mouse.x - centerX;
            const mouseOffsetY = mouse.y - centerY;
            const mouseOffsetLen = Math.hypot(mouseOffsetX, mouseOffsetY) || 1;
            const mouseDeadzone = 18;
            const lookAheadDist =
                mouseOffsetLen <= mouseDeadzone
                    ? 0
                    : Math.min(140, (mouseOffsetLen - mouseDeadzone) * 0.2);
            desiredLookAheadX = (mouseOffsetX / mouseOffsetLen) * lookAheadDist;
            desiredLookAheadY = (mouseOffsetY / mouseOffsetLen) * lookAheadDist;
        }
        const lookAheadLerp =
            typeof global.isTabletStickEngaged === "function" && global.isTabletStickEngaged()
                ? 1
                : Math.min(1, dt * 7.5);
        cam.cameraLookAheadX += (desiredLookAheadX - cam.cameraLookAheadX) * lookAheadLerp;
        cam.cameraLookAheadY += (desiredLookAheadY - cam.cameraLookAheadY) * lookAheadLerp;
        const targetCameraX = player.x + cam.cameraLookAheadX;
        const targetCameraY = player.y + cam.cameraLookAheadY;
        const cameraFollowLerp = Math.min(1, dt * 5.5);
        cam.cameraX += (targetCameraX - cam.cameraX) * cameraFollowLerp;
        cam.cameraY += (targetCameraY - cam.cameraY) * cameraFollowLerp;

        const timeNow = Date.now();
        const _screenFactor = Math.min(1.0, Math.min(screenW, screenH) / 700);
        const targetZoom = Math.max(
            0.3,
            _screenFactor * (1.0 - (player.radius - GAME_SETTINGS.START_RADIUS) * 0.0025)
        );
        cam.interpolatedZoom += (targetZoom - cam.interpolatedZoom) * (dt * 3.0);
        const interpolatedZoom = cam.interpolatedZoom;
        const cameraX = cam.cameraX;
        const cameraY = cam.cameraY;
        const viewDist = ((screenW > screenH ? screenW : screenH) * 0.8) / interpolatedZoom;
        const viewDistSq = viewDist * viewDist;
        const screenShake = deps.getScreenShakeOffset();

        ctx.save();
        ctx.translate(Math.round(centerX + screenShake.x), Math.round(centerY + screenShake.y));
        ctx.scale(interpolatedZoom, interpolatedZoom);
        ctx.translate(-cameraX, -cameraY);

        ctx.save();
        const pulseGlow = 15 + Math.sin(timeNow * 0.005) * 10;
        const margin = 10;
        ctx.strokeStyle = player.glow;
        ctx.lineWidth = 12;
        ctx.shadowBlur = pulseGlow;
        ctx.shadowColor = player.glow;
        ctx.strokeRect(0, 0, GAME_SETTINGS.WORLD_SIZE, GAME_SETTINGS.WORLD_SIZE);
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = player.glow;
        ctx.shadowBlur = 0;
        ctx.strokeRect(margin, margin, GAME_SETTINGS.WORLD_SIZE - margin * 2, GAME_SETTINGS.WORLD_SIZE - margin * 2);
        ctx.restore();

        deps.drawCosmicDust(ctx, cameraX, cameraY, screenW, screenH, interpolatedZoom);

        if (global.NebulaGlass && global.NebulaGlass.isActive() && global.NebulaGameMode && global.NebulaGameMode.getRunMode() === "mirror") {
            global.NebulaGlass.draw(ctx, cameraX, cameraY, viewDist, timeNow);
        } else {
            poolJellyBubbles.forEach((jb) => jb.draw(ctx));
        }

        const bhX = GAME_SETTINGS.WORLD_SIZE / 2;
        const bhY = GAME_SETTINGS.WORLD_SIZE / 2;
        const bhCoreRadius = GAME_SETTINGS.BH_CORE_RADIUS;
        const bhEventHorizon = GAME_SETTINGS.BH_PULL_RANGE;
        if ((bhX - cameraX) ** 2 + (bhY - cameraY) ** 2 < (viewDist + bhEventHorizon) ** 2) {
            ctx.save();
            ctx.translate(bhX, bhY);

            const playerBhDist = Math.hypot(player.x - bhX, player.y - bhY);
            const bhIntensity = Math.max(0, Math.min(1, 1 - playerBhDist / 1000));
            const pulse = 0.85 + Math.sin(timeNow * 0.003) * 0.15;
            const ringAlpha = (0.7 + bhIntensity * 0.3) * pulse;

            const halo = ctx.createRadialGradient(0, 0, bhCoreRadius, 0, 0, bhEventHorizon);
            halo.addColorStop(0, `rgba(180, 220, 255, ${0.2 + bhIntensity * 0.15})`);
            halo.addColorStop(0.25, `rgba(80,  140, 220, ${0.12 + bhIntensity * 0.08})`);
            halo.addColorStop(0.6, "rgba(30, 0, 60, 0.06)");
            halo.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, 0, bhEventHorizon, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(120, 200, 255, ${0.32 * pulse + bhIntensity * 0.12})`;
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.arc(0, 0, bhCoreRadius + 4, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.arc(0, 0, bhCoreRadius + 2, 0, Math.PI * 2);
            ctx.stroke();

            const shimmerAng = (timeNow * 0.0015) % (Math.PI * 2);
            ctx.strokeStyle = `rgba(220, 240, 255, ${Math.min(1, ringAlpha * 1.3)})`;
            ctx.lineWidth = 3.4;
            ctx.beginPath();
            ctx.arc(0, 0, bhCoreRadius + 2, shimmerAng, shimmerAng + 0.55);
            ctx.stroke();

            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.arc(0, 0, bhCoreRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        for (let i = 0; i < poolBHSiphonParticles.length; i++) {
            const p = poolBHSiphonParticles[i];
            if (!p.active) continue;
            const dx = p.x - cameraX;
            const dy = p.y - cameraY;
            if (dx * dx + dy * dy > (viewDist + 140) * (viewDist + 140)) continue;
            ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.28);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        const afterglowAccent =
            (RAVENOUS_X3_CFG && typeof RAVENOUS_X3_CFG.afterglowAccent === "string" && RAVENOUS_X3_CFG.afterglowAccent) ||
            "#c86bff";

        poolBloodRifts.forEach((rift) => {
            if (!rift.active) return;
            const lifeMax = rift.isAfterglow
                ? rift.afterglowMaxLife || Number(RAVENOUS_X3_CFG.afterglowLifeSec) || 1.5
                : ABILITY_SETTINGS.VAMPIRE_RIFT_LIFE;
            const t = Math.max(0, Math.min(1, rift.life / lifeMax));
            const p = (Math.sin(timeNow * 0.005) + Math.sin(timeNow * 0.01) * 0.5) * (rift.isAfterglow ? 3.5 : 6);
            const r = rift.r + p;
            ctx.save();
            ctx.translate(rift.x, rift.y);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
            const fade = rift.isAfterglow ? 0.84 : 1;
            if (rift.isAfterglow) {
                g.addColorStop(0, `rgba(8, 0, 22, ${0.9 * t * fade})`);
                g.addColorStop(0.38, `rgba(52, 10, 105, ${0.74 * t * fade})`);
                g.addColorStop(0.72, `rgba(130, 48, 210, ${0.45 * t * fade})`);
                g.addColorStop(1, `rgba(200, 107, 255, 0)`);
            } else {
                g.addColorStop(0, `rgba(5,0,0,${0.9 * t * fade})`);
                g.addColorStop(0.4, `rgba(70,0,0,${0.7 * t * fade})`);
                g.addColorStop(0.8, `rgba(180,0,0,${0.4 * t * fade})`);
                g.addColorStop(1, "rgba(255,0,0,0)");
            }
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, 6.28);
            ctx.fill();
            ctx.shadowColor = rift.isAfterglow ? afterglowAccent : "#ff0000";
            ctx.shadowBlur = rift.isAfterglow ? 16 : 20;
            if (rift.isAfterglow) {
                ctx.fillStyle = `rgba(210, 160, 255, ${0.28 * t * fade})`;
            } else {
                ctx.fillStyle = `rgba(255,30,30,${0.25 * t * fade})`;
            }
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.15 + p * 0.5, 0, 6.28);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1;
            const ringCount = rift.isAfterglow ? 1 : 2;
            for (let w = 0; w < ringCount; w++) {
                const rr = ((timeNow * 0.04) + (w * r) / 2) % r;
                const a = (1 - rr / r) * 0.4 * t * fade;
                ctx.strokeStyle = rift.isAfterglow
                    ? `rgba(192, 120, 255, ${a})`
                    : `rgba(255,50,50,${a})`;
                ctx.beginPath();
                ctx.arc(0, 0, rr, 0, 6.28);
                ctx.stroke();
            }
            ctx.restore();
            const mirrorBaseFx =
                global.NebulaGameMode &&
                typeof global.NebulaGameMode.getRunMode === "function" &&
                global.NebulaGameMode.getRunMode() === "mirror";
            if (!mirrorBaseFx && deps.playerHasRavenousSiphonMod() && !rift.isAfterglow) {
                deps.drawBloodRiftSiphons(ctx, rift, timeNow);
            }
        });
        if (typeof global.drawMirrorAbilityFx === "function") {
            global.drawMirrorAbilityFx(ctx, timeNow, "rift");
        }

        for (let i = 0; i < poolParticles.length; i++) {
            const p = poolParticles[i];
            if (!p.active) continue;
            const dx = p.x - cameraX;
            const dy = p.y - cameraY;
            if (dx * dx > viewDistSq || dy * dy > viewDistSq) continue;
            p.draw(ctx, cameraX, cameraY, screenW, screenH, dt, interpolatedZoom);
        }

        for (let i = 0; i < poolNutrients.length; i++) {
            const n = poolNutrients[i];
            if (!n.active || (n.x - cameraX) ** 2 > viewDistSq || (n.y - cameraY) ** 2 > viewDistSq) continue;

            ctx.save();
            ctx.translate(n.x, n.y);
            ctx.rotate(timeNow * 0.001 * (i % 3));

            const _nhsl = nutrientHsl[i % 1000];
            ctx.strokeStyle = _nhsl.stroke;
            ctx.lineWidth = 0.8;
            ctx.shadowBlur = 6;
            ctx.shadowColor = _nhsl.shadow;
            ctx.globalAlpha = 0.85;

            const s = i % 8;
            const r = n.radius * 2.5;

            ctx.beginPath();
            if (s === 0) {
                ctx.moveTo(0, -r);
                ctx.lineTo(0, r);
                ctx.moveTo(-r, 0);
                ctx.lineTo(r, 0);
            } else if (s === 1) {
                ctx.moveTo(-r, -r);
                ctx.lineTo(r, r);
                ctx.moveTo(-r, r);
                ctx.lineTo(r, -r);
            } else if (s === 2) {
                ctx.moveTo(0, -r);
                ctx.lineTo(r, r);
                ctx.lineTo(-r, r);
                ctx.closePath();
            } else if (s === 3) {
                ctx.arc(0, 0, r * 0.7, 0, 6.28);
                ctx.moveTo(-r * 0.4, 0);
                ctx.lineTo(r * 0.4, 0);
            } else if (s === 4) {
                ctx.bezierCurveTo(r, -r, -r, r, 0, r * 1.2);
            } else if (s === 5) {
                ctx.moveTo(-r, 0);
                ctx.lineTo(-r * 0.5, 0);
                ctx.lineTo(0, r);
                ctx.lineTo(r, -r);
            } else if (s === 6) {
                ctx.arc(0, 0, r * 0.5, 0, 6.28);
            } else {
                ctx.moveTo(-r, r);
                ctx.lineTo(-r, -r);
                ctx.lineTo(r, -r);
                ctx.moveTo(r, -r);
                ctx.lineTo(r, r);
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.globalAlpha = 1.0;

        // Match EnemyBot.draw() frustum (player-centered) — skip draw() call only; pixels unchanged.
        const botDrawHalfW = screenW / 2 / interpolatedZoom + 150;
        const botDrawHalfH = screenH / 2 / interpolatedZoom + 150;
        const botCullPx = player.x;
        const botCullPy = player.y;
        for (let bi = 0; bi < poolBots.length; bi++) {
            const b = poolBots[bi];
            if (!b.active) continue;
            if (
                Math.abs(b.x - botCullPx) > botDrawHalfW ||
                Math.abs(b.y - botCullPy) > botDrawHalfH
            ) {
                continue;
            }
            b.draw(ctx, botCullPx, botCullPy, screenW, screenH, dt, interpolatedZoom);
        }

        if (typeof global.drawMirrorAbilityFx === "function") {
            global.drawMirrorAbilityFx(ctx, timeNow, "ghost");
        }

        if (typeof deps.getRemotePlayer === "function") {
            const mirrorRun =
                global.NebulaGameMode &&
                typeof global.NebulaGameMode.getRunMode === "function" &&
                global.NebulaGameMode.getRunMode() === "mirror";
            const remoteList =
                mirrorRun && typeof deps.getRemotePlayers === "function"
                    ? deps.getRemotePlayers()
                    : [];
            const drawList = mirrorRun
                ? remoteList.length > 0
                    ? remoteList
                    : (() => {
                          const one = deps.getRemotePlayer();
                          return one ? [one] : [];
                      })()
                : [];
            for (let ri = 0; ri < drawList.length; ri++) {
                const rp = drawList[ri];
                if (!rp || !rp.active || rp.arenaOut) continue;
                const drawX =
                    typeof rp.displayX === "number" && Number.isFinite(rp.displayX) ? rp.displayX : rp.x;
                const drawY =
                    typeof rp.displayY === "number" && Number.isFinite(rp.displayY) ? rp.displayY : rp.y;
                const drawR =
                    typeof rp.displayRadius === "number" && Number.isFinite(rp.displayRadius)
                        ? rp.displayRadius
                        : rp.radius;
                const rpFill = rp.glow || rp.color || "#888888";
                const rpFrozen =
                    typeof global.mirrorPeerFrozen === "function" && global.mirrorPeerFrozen(rp.peerId);
                drawPlayerSkin(
                    ctx,
                    drawX,
                    drawY,
                    drawR,
                    rpFill,
                    player.x,
                    player.y,
                    eyeHostForRemote(rp),
                    dt,
                    rpFrozen
                );
            }
        }

        if (typeof global.drawPhaseCage === "function") global.drawPhaseCage(ctx, timeNow);

        if (activeEffects.shriekPulse > 0) {
            ctx.beginPath();
            ctx.arc(player.x, player.y, activeEffects.shriekPulse, 0, 6.28);
            ctx.strokeStyle = `rgba(138, 43, 226, ${1 - activeEffects.shriekPulse / ABILITY_SETTINGS.WARP_PULSE_MAX})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        if (typeof global.drawMirrorAbilityFx === "function") {
            global.drawMirrorAbilityFx(ctx, timeNow, "shriek");
        }

        if (!isDying) {
            const isAtMaxRadius = player.radius >= GAME_SETTINGS.MAX_PLAYER_RADIUS - 0.01;
            const tremorStrength = isAtMaxRadius ? Math.max(0.8, player.radius * 0.035) : 0;
            const tremorX = isAtMaxRadius ? Math.sin(timeNow * 0.08) * tremorStrength : 0;
            const tremorY = isAtMaxRadius ? Math.cos(timeNow * 0.11) * tremorStrength : 0;
            const renderPlayerX = player.x + tremorX;
            const renderPlayerY = player.y + tremorY;

            deps.drawSporeGhostsWorld(ctx, timeNow);

            if (gameActive) {
                cam.auraSpawnCarry += 26 * dt;
                while (cam.auraSpawnCarry >= 1) {
                    cam.auraSpawnCarry -= 1;
                    const ap = deps.getFromPool(poolAuraParticles);
                    if (!ap) break;
                    const ang = Math.random() * Math.PI * 2;
                    const edge = player.radius * (0.82 + Math.random() * 0.18);
                    const spd = 10 + Math.random() * 20;
                    ap.active = true;
                    ap.x = renderPlayerX + Math.cos(ang) * edge;
                    ap.y = renderPlayerY + Math.sin(ang) * edge;
                    ap.vx = Math.cos(ang) * spd;
                    ap.vy = Math.sin(ang) * spd;
                    ap.maxLife = 0.55 + Math.random() * 0.75;
                    ap.life = ap.maxLife;
                    ap.r = 1 + Math.random() * 2 + player.radius * 0.012;
                }
            }
            ctx.save();
            ctx.fillStyle = player.glow;
            ctx.shadowColor = player.glow;
            ctx.shadowBlur = 6;
            for (let i = 0; i < poolAuraParticles.length; i++) {
                const ap = poolAuraParticles[i];
                if (!ap.active) continue;
                ap.life -= dt;
                if (ap.life <= 0) {
                    ap.active = false;
                    continue;
                }
                ap.x += ap.vx * dt;
                ap.y += ap.vy * dt;
                ap.vx *= 0.95;
                ap.vy *= 0.95;
                const tLife = ap.life / ap.maxLife;
                ctx.globalAlpha = 0.32 * tLife;
                ctx.beginPath();
                ctx.arc(ap.x, ap.y, ap.r * tLife + 0.4, 0, 6.28);
                ctx.fill();
            }
            ctx.restore();

            let lookX = localEyeHost.aimX;
            let lookY = localEyeHost.aimY;
            if (useVectorAim && typeof deps.getWasdInputSmoothed === "function") {
                const aim = deps.getWasdInputSmoothed();
                const aimLen = Math.hypot(aim.x, aim.y);
                if (aimLen > 0.12) {
                    lookX = player.x + (aim.x / aimLen) * 480;
                    lookY = player.y + (aim.y / aimLen) * 480;
                }
            } else {
                lookX = cameraX + (mouse.x - centerX - screenShake.x) / interpolatedZoom;
                lookY = cameraY + (mouse.y - centerY - screenShake.y) / interpolatedZoom;
            }
            if (!Number.isFinite(lookX) || !Number.isFinite(lookY)) {
                lookX = player.x + 200;
                lookY = player.y;
            }
            localEyeHost.aimX = lookX;
            localEyeHost.aimY = lookY;
            const localFrozen =
                typeof global.mirrorLocalFrozen === "function" && global.mirrorLocalFrozen();
            drawPlayerSkin(
                ctx,
                renderPlayerX,
                renderPlayerY,
                player.radius,
                player.glow || player.color,
                lookX,
                lookY,
                localEyeHost,
                dt,
                localFrozen
            );
        }
        ctx.restore();

        if (!isDying && gameActive) {
            const innerR = Math.max(1, GAME_SETTINGS.VISION_OVERLAY_INNER_RADIUS_PX);
            const visionMult = selectedAbility === "speed" ? ABILITY_SETTINGS.SPORE_VISION_ZOOM : 28;
            const outerR = innerR * visionMult;
            const visionCenterX =
                centerX + screenShake.x + (player.x - cameraX) * interpolatedZoom;
            const visionCenterY =
                centerY + screenShake.y + (player.y - cameraY) * interpolatedZoom;
            const g = ctx.createRadialGradient(
                visionCenterX,
                visionCenterY,
                innerR,
                visionCenterX,
                visionCenterY,
                outerR
            );
            g.addColorStop(0.0, "rgba(0,0,0,0)");
            g.addColorStop(0.5, "rgba(0,0,0,0.16)");
            g.addColorStop(1.0, "rgba(0,0,0,0.9)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, screenW, screenH);

            const mirrorRun =
                global.NebulaGameMode &&
                typeof global.NebulaGameMode.getRunMode === "function" &&
                global.NebulaGameMode.getRunMode() === "mirror";
            if (mirrorRun && typeof global.drawMpOffscreenIndicators === "function") {
                const remoteList =
                    typeof deps.getRemotePlayers === "function" ? deps.getRemotePlayers() : [];
                global.drawMpOffscreenIndicators(ctx, {
                    peers: remoteList,
                    cameraX: cameraX,
                    cameraY: cameraY,
                    zoom: interpolatedZoom,
                    centerX: centerX,
                    centerY: centerY,
                    shakeX: screenShake.x,
                    shakeY: screenShake.y,
                    screenW: screenW,
                    screenH: screenH,
                    timeNow: timeNow,
                });
            }

            if (bountySystem.multiplier > 1 && bountySystem.timer > 0) {
                ctx.save();
                const hudScoreFont = deps.getEntityScoreHudFontStyle();
                const bFontSize = hudScoreFont.fontSize;
                const bX = uiContainer ? uiContainer.offsetLeft : Math.max(20, screenW * 0.05);
                const bY = uiContainer
                    ? uiContainer.offsetTop + uiContainer.offsetHeight + bFontSize + 6
                    : Math.round(screenH * 0.22);
                const bBarW = Math.round(Math.min(150, screenW * 0.35));
                const progress = bountySystem.timer / GAME_SETTINGS.BOUNTY_DURATION;

                const tierAccent = deps.getBountyTierAccentColor(bountySystem.multiplier);
                const { fill: bColor, glow: bGlow } = deps.hudColorsFromAccent(tierAccent);

                ctx.globalAlpha = 0.75;
                ctx.font = `${hudScoreFont.fontWeight} ${bFontSize}px ${hudScoreFont.fontFamily}`;
                ctx.textAlign = "left";
                ctx.textBaseline = "alphabetic";
                if ("letterSpacing" in ctx) ctx.letterSpacing = hudScoreFont.letterSpacing;
                ctx.shadowBlur = 10;
                ctx.shadowColor = bGlow;
                ctx.fillStyle = bColor;
                ctx.fillText(`BOUNTY X${bountySystem.multiplier}`, bX, bY);

                ctx.shadowBlur = 0;
                ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
                ctx.fillRect(bX, bY + 6, bBarW, 4);
                ctx.globalAlpha = 0.75 * 0.72;
                ctx.fillStyle = bColor;
                ctx.fillRect(bX, bY + 6, bBarW * progress, 4);
                ctx.restore();
            }

            const maxCd =
                (GAME_SETTINGS[`CD_${selectedAbility.toUpperCase()}`] || 5.0) * deps.getSignalCooldownMultiplier();
            const cdProgress = Math.max(0, Math.min(1, 1 - player.cooldown / maxCd));
            const hudCross = cooldownHudPoint(screenW, screenH);
            drawAbilityCross(
                ctx,
                hudCross.cx,
                hudCross.cy,
                hudCross.crossRadius,
                cdProgress,
                player.glow || player.color
            );
        }

        if ((gameActive || isDying) && typeof global.drawPickupFloats === "function") {
            global.drawPickupFloats(ctx, {
                cameraX,
                cameraY,
                zoom: interpolatedZoom,
                centerX,
                centerY,
                shakeX: screenShake.x,
                shakeY: screenShake.y,
                screenW,
                screenH,
            });
        }

        if ((gameActive || isDying) && typeof global.drawMpTauntBubbles === "function") {
            const tauntMirror =
                global.NebulaGameMode &&
                typeof global.NebulaGameMode.getRunMode === "function" &&
                global.NebulaGameMode.getRunMode() === "mirror";
            if (tauntMirror) {
                global.drawMpTauntBubbles(ctx, {
                    cameraX,
                    cameraY,
                    zoom: interpolatedZoom,
                    centerX,
                    centerY,
                    shakeX: screenShake.x,
                    shakeY: screenShake.y,
                    screenW,
                    screenH,
                });
            }
        }

        if (paintArena) {
            deps.update(dt);
        }
        requestAnimationFrame(draw);
    }

    global.configureSimDraw = configureSimDraw;
    global.ensureDrawLoop = ensureDrawLoop;
    global.restartDrawLoop = restartDrawLoop;
})(typeof window !== "undefined" ? window : globalThis);
