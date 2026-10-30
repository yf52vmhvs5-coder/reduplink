/**
 * NEBULA VOID — simulation update (physics, collisions, pools).
 * configureSimUpdate() from entities.js after combat helpers exist.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, unknown>} */
    let deps = null;

    function configureSimUpdate(nextDeps) {
        if (!nextDeps || typeof nextDeps.getPlayer !== "function" || !nextDeps.cam) {
            throw new Error("configureSimUpdate requires getPlayer, cam, pools, and settings");
        }
        deps = nextDeps;
    }

    function mirrorBaseAbilities() {
        return !!(
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror"
        );
    }

    function deathFromEnvironment() {
        if (
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror" &&
            typeof global.markMirrorEnvironmentalDeath === "function"
        ) {
            global.markMirrorEnvironmentalDeath();
        }
        playerDeath();
    }

    function update(dt = 0.016) {
        if (!deps) return;

        const isDying = deps.getIsDying();
        const gameActive = deps.getGameActive();
        const player = deps.getPlayer();
        const mouse = deps.getMouse();
        const screenW = deps.getScreenW();
        const screenH = deps.getScreenH();
        const selectedAbility = deps.getSelectedAbility();
        const activeEffects = deps.getActiveEffects();
        const bountySystem = deps.getBountySystem();
        const scoreElement = deps.getScoreElement();
        const cam = deps.cam;
        const { GAME_SETTINGS, ABILITY_SETTINGS, ENEMY_BOT_SETTINGS } = deps.settings;
        const {
            poolNutrients,
            poolBloodRifts,
            poolBots,
            poolBHSiphonParticles,
            poolJellyBubbles,
            poolSporeGhosts,
            poolParticles,
        } = deps.pools;
        let bhSiphonParticleCarry = deps.getBhSiphonParticleCarry();
        const sporeDashBurstSerial = deps.getSporeDashBurstSerial();

        try {
    // Eliminat: window.frameCount (acum folosim exclusiv dt pentru timing perfect pe orice monitor)
    if(isDying){ poolNutrients.forEach(n=>{if(n.active)n.update(dt);}); if (typeof updatePickupFloats === "function") updatePickupFloats(dt); if(typeof updateBlackHoleAudio==='function') updateBlackHoleAudio(9999,9999); return; }
    if(!gameActive) return;
    if (typeof global.syncMpMatchUpgradeHud === "function") {
        global.syncMpMatchUpgradeHud(player.score);
    }

    updateBlackHoleAudio(player.x,player.y);
    updateAmbientAudio(player.x, player.y, player.radius, bountySystem.multiplier);

    // Bounty Timer
    if(bountySystem.timer>0){ bountySystem.timer-=dt; if(bountySystem.timer<=0){ bountySystem.timer=0; bountySystem.multiplier=1; if(typeof playBountyLostSound==='function') playBountyLostSound(); } }
	
    if(player.cooldown>0){ player.cooldown-=dt; if(player.cooldown<=0){ player.cooldown=0; if(typeof playReadySound==='function') playReadySound(); } }

    // Active Effects (In secunde)
    const _sporeDashBefore = activeEffects.dashTime;
    if (activeEffects.dashTime > 0) activeEffects.dashTime -= dt;
    if (
        selectedAbility === "speed" &&
        !mirrorBaseAbilities() &&
        playerHasToxicSporeLatchMod() &&
        _sporeDashBefore > 0 &&
        activeEffects.dashTime <= 0
    ) {
        const latchRange = Number(TOXIC_SPORE_X1_CFG.acquireRange) || 420;
        const prey = findNearestBotToPoint(player.x, player.y, latchRange);
        armSporeGhostsLatch(sporeDashBurstSerial, prey);
    }

    if (typeof updatePickupFloats === "function") updatePickupFloats(dt);

    // Pool Visual Cleanup
    poolBloodRifts.forEach((r) => {
        if (!r.active) return;
        if (r.huntPrey) updateHomingBloodRift(r, dt);
        if (!mirrorBaseAbilities()) updateBloodRiftSiphons(r, dt);
        r.life -= dt;
        if (r.life <= 0) {
            if (!mirrorBaseAbilities() && playerHasRavenousTwinAfterglowMod() && !r.isAfterglow) {
                beginRiftAfterglow(r);
            } else {
                r.active = false;
                r.huntPrey = false;
                r.trackBot = null;
                r.isAfterglow = false;
                r.afterglowMaxLife = 0;
                clearRiftSiphons(r);
            }
        }
    });
    updateSporeGhosts(dt);
    for (let i = 0; i < poolBots.length; i++) {
        const b = poolBots[i];
        if (b._sporeDrainGlow > 0) {
            b._sporeDrainGlow -= dt * 2.5;
            if (b._sporeDrainGlow < 0) b._sporeDrainGlow = 0;
        }
        if (b._sporeSplitGlow > 0) {
            b._sporeSplitGlow -= dt * 2.2;
            if (b._sporeSplitGlow < 0) b._sporeSplitGlow = 0;
        }
    }
    poolBHSiphonParticles.forEach(p => {
        if (!p.active) return;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; return; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.96, dt * 60);
        p.vy *= Math.pow(0.96, dt * 60);
    });

    // --- Setup Global Timers pentru a înlocui vechiul frameCount ---
    // Verificare la cel mult 80 Hz: la 60 Hz rulează în fiecare cadru, la 144 Hz cam la 2 cadre.
    window._botCollTimer = (window._botCollTimer || 0) + dt; let checkBotColl = false; if(window._botCollTimer >= 0.0125){ checkBotColl = true; window._botCollTimer = 0; }
    window._nutrCollTimer = (window._nutrCollTimer || 0) + dt; let checkNutr = false; if(window._nutrCollTimer >= 0.0125){ checkNutr = true; window._nutrCollTimer = 0; }
    window._dmgSoundTimer = (window._dmgSoundTimer || 0) + dt; // Folosit pentru debounce la sunetul de damage mai jos

    // Black Hole Physics (Forte convertite px/sec)
    const bhX=GAME_SETTINGS.WORLD_SIZE/2,bhY=GAME_SETTINGS.WORLD_SIZE/2,bhPullRange=GAME_SETTINGS.BH_PULL_RANGE,bhCoreRadius=GAME_SETTINGS.BH_CORE_RADIUS;
    let dxPlayerBH=bhX-player.x,dyPlayerBH=bhY-player.y,distPlayerBH=Math.hypot(dxPlayerBH,dyPlayerBH);
    if(distPlayerBH<bhPullRange && distPlayerBH>1){
        let pullForce=(1-(distPlayerBH/bhPullRange))*GAME_SETTINGS.BH_PULL_FORCE;
        player.x+=(dxPlayerBH/distPlayerBH)*pullForce*dt;
        player.y+=(dyPlayerBH/distPlayerBH)*pullForce*dt;

        // Efect "siphon" în raza de atracție (în afara miezului): micșorare fină + particule elegante
        const coreEdge = bhCoreRadius + player.radius * 0.5;
        if (distPlayerBH > coreEdge) {
            const siphonMinRadius = GAME_SETTINGS.START_RADIUS + 2;
            if (player.radius > siphonMinRadius) {
                player.radius -= GAME_SETTINGS.BH_SIPHON_SHRINK_RATE * dt;
                if (player.radius < siphonMinRadius) player.radius = siphonMinRadius;
                
            }

            bhSiphonParticleCarry += GAME_SETTINGS.BH_SIPHON_PARTICLE_RATE * dt;
            while (bhSiphonParticleCarry >= 1) {
                bhSiphonParticleCarry -= 1;
                const sp = getFromPool(poolBHSiphonParticles);
                if (!sp) break;
                const ang = Math.atan2(dyPlayerBH, dxPlayerBH) + (Math.random() - 0.5) * 0.9;
                const spawnR = Math.max(6, player.radius * (0.65 + Math.random() * 0.35));
                const speed = 140 + Math.random() * 210 + pullForce * 0.3;
                sp.active = true;
                sp.x = player.x + Math.cos(ang + Math.PI) * (Math.random() * 8) + Math.cos(ang) * spawnR;
                sp.y = player.y + Math.sin(ang + Math.PI) * (Math.random() * 8) + Math.sin(ang) * spawnR;
                sp.vx = Math.cos(ang) * speed;
                sp.vy = Math.sin(ang) * speed;
                sp.r = 1.8 + Math.random() * 2.8;
                sp.maxLife = 0.36 + Math.random() * 0.26;
                sp.life = sp.maxLife;
                sp.color = Math.random() > 0.5 ? "rgba(210,140,255,0.72)" : "rgba(130,220,255,0.66)";
            }
        } else {
            player.radius-=GAME_SETTINGS.BH_CORE_DAMAGE*dt; pulseDamageShake();  if(player.radius<5){ deathFromEnvironment(); return; }
        }
    } else {
        bhSiphonParticleCarry = Math.min(bhSiphonParticleCarry, 1);
    }
    const bhBotVisualRange = GAME_SETTINGS.BH_BOT_VISUAL_SIPHON_RANGE;
    poolBots.forEach(bot=>{
        if(!bot.active) return;
        let distBotBH=Math.hypot(bhX-bot.x,bhY-bot.y);
        if (distBotBH < bhBotVisualRange && distBotBH > 1) {
            const visualIntensity = Math.max(0, Math.min(1, 1 - (distBotBH - bhPullRange) / Math.max(1, (bhBotVisualRange - bhPullRange))));
            bot._bhSiphonCarry = (bot._bhSiphonCarry || 0) + GAME_SETTINGS.BH_BOT_SIPHON_PARTICLE_RATE * (0.35 + visualIntensity * 0.65) * dt;
            while (bot._bhSiphonCarry >= 1) {
                bot._bhSiphonCarry -= 1;
                const sp = getFromPool(poolBHSiphonParticles);
                if (!sp) break;
                const ang = Math.atan2(bhY - bot.y, bhX - bot.x) + (Math.random() - 0.5) * 1.0;
                const spawnR = Math.max(4, bot.radius * (0.55 + Math.random() * 0.45));
                const speed = 90 + Math.random() * 120 + visualIntensity * 120;
                sp.active = true;
                sp.x = bot.x + Math.cos(ang) * spawnR;
                sp.y = bot.y + Math.sin(ang) * spawnR;
                sp.vx = Math.cos(ang) * speed;
                sp.vy = Math.sin(ang) * speed;
                sp.r = 1.2 + Math.random() * 1.8 + visualIntensity * 0.9;
                sp.maxLife = 0.24 + Math.random() * 0.22;
                sp.life = sp.maxLife;
                sp.color = bot.color || "rgba(220,220,255,0.65)";
            }
        } else {
            bot._bhSiphonCarry = 0;
        }

        if(distBotBH<bhPullRange && distBotBH>1){
            let pullForce=(1-(distBotBH/bhPullRange))*GAME_SETTINGS.BH_PULL_FORCE;
            const dirX = (bhX-bot.x)/distBotBH;
            const dirY = (bhY-bot.y)/distBotBH;
            bot.x+=dirX*pullForce*dt;
            bot.y+=dirY*pullForce*dt;

            if(distBotBH<bhCoreRadius) bot.explode(poolNutrients);
        }
    });
    poolNutrients.forEach(n=>{ if(!n.active) return; let distNBH=Math.hypot(bhX-n.x,bhY-n.y); if(distNBH<bhPullRange && distNBH>1){ n.x+=((bhX-n.x)/distNBH)*((1-(distNBH/bhPullRange))*GAME_SETTINGS.BH_NUTRIENT_PULL_FORCE)*dt; n.y+=((bhY-n.y)/distNBH)*((1-(distNBH/bhPullRange))*GAME_SETTINGS.BH_NUTRIENT_PULL_FORCE)*dt; if(distNBH<bhCoreRadius) n.active=false; } });

    // Player Movement (px/sec)
    const controlScheme =
        typeof deps.getControlScheme === "function" ? deps.getControlScheme() : "mouse";
    let tX;
    let tY;
    if (controlScheme === "wasd" && typeof deps.getWasdInputSmoothed === "function") {
        const v = deps.getWasdInputSmoothed();
        const aimDist = 220;
        tX = v.x * aimDist;
        tY = v.y * aimDist;
    } else {
        tX = mouse.x - screenW / 2;
        tY = mouse.y - screenH / 2;
    }
    const ang = Math.atan2(tY, tX);
    // VELOCITY DRIVE: bonus permanent +3%/lv pe BASE_SPEED (nu și pe Dash, care e burst)
    let spdBase=(selectedAbility==="speed"&&activeEffects.dashTime>0)?GAME_SETTINGS.SPEED_BOOST_DASH:(GAME_SETTINGS.BASE_SPEED * getKineticSpeedMultiplier());
    const speed=Math.max(GAME_SETTINGS.MIN_SPEED,spdBase-(player.radius/GAME_SETTINGS.RADIUS_SPEED_DIVISOR));
    const mirrorFrozen =
        typeof player.mirrorFreezeUntil === "number" && performance.now() < player.mirrorFreezeUntil;
    if (!mirrorFrozen && tX * tX + tY * tY > 225) {
        player.x += Math.cos(ang) * speed * dt;
        player.y += Math.sin(ang) * speed * dt;
    }
    
    // Jeleul moale rămâne în singleplayer. În duel e înlocuit de camerele de sticlă.
    if (!(global.NebulaGlass && global.NebulaGlass.isActive() && global.NebulaGameMode && global.NebulaGameMode.getRunMode() === "mirror")) {
        poolJellyBubbles.forEach(jb => jb.update(player, poolBots, poolNutrients, dt));
    } 
	
    // Ghost trail for speed (REPARAT: Independent de FPS, apare la exact 0.075s, echivalentul a 160Hz)
    if(selectedAbility==="speed" && activeEffects.dashTime>0){
        window._ghostTimer = (window._ghostTimer || 0) + dt;
        if(window._ghostTimer >= 0.075){
            window._ghostTimer = 0;
            let ghost = getFromPool(poolSporeGhosts);
            if (ghost) {
                ghost.active = true;
                ghost.x = player.x;
                ghost.y = player.y;
                ghost.r = player.radius;
                ghost.life = 1.0;
                ghost.phase = !mirrorBaseAbilities() && playerHasToxicSporeLatchMod() ? "trail" : "fade";
                ghost.dashBurstId = sporeDashBurstSerial;
                ghost.latchSlot = 0;
                ghost.latchLife = 0;
                ghost.latchAngle = 0;
                ghost.targetBot = null;
                ghost.toxicTier = 0;
                ghost.splitDispatched = false;
            }
        }
    } else window._ghostTimer = 0;

    // Warp edges
    if(selectedAbility==="warp"){
    let didWarp = false;
    const _ws = GAME_SETTINGS.WORLD_SIZE;
    const crossedX = player.x < 0 || player.x > _ws;
    const crossedY = player.y < 0 || player.y > _ws;
    // O singură penalizare pe cadru: colțul nu trebuie să taie raza de două ori.
    // Reapare la o rază în interior, altfel o schimbare de direcție trece din nou granița.
    if (crossedX || crossedY) {
        player.radius = Math.max(10, player.radius - ABILITY_SETTINGS.WARP_BORDER_PENALTY);
        const inset = player.radius;
        if (player.x < 0) player.x = _ws - inset;
        else if (player.x > _ws) player.x = inset;
        if (player.y < 0) player.y = _ws - inset;
        else if (player.y > _ws) player.y = inset;
        didWarp = true;
    }
    if (didWarp) {
        cam.cameraX = player.x;
        cam.cameraY = player.y;
        cam.cameraLookAheadX = 0;
        cam.cameraLookAheadY = 0;
        if (typeof playWarpBarrierCrossSound === "function") playWarpBarrierCrossSound();
    } }
    else{ player.x=Math.max(player.radius,Math.min(GAME_SETTINGS.WORLD_SIZE-player.radius,player.x)); player.y=Math.max(player.radius,Math.min(GAME_SETTINGS.WORLD_SIZE-player.radius,player.y)); }

    if (typeof updatePhaseCage === "function") updatePhaseCage(dt);
    if(activeEffects.shriekPulse>0){ activeEffects.shriekPulse+=ABILITY_SETTINGS.WARP_PULSE_EXPANSION*dt; if(activeEffects.shriekPulse>ABILITY_SETTINGS.WARP_PULSE_MAX) activeEffects.shriekPulse=0; }
    if (typeof global.tickMirrorAbilities === "function" && global.tickMirrorAbilities(dt)) return;
    // Bots vs Player & Other Bots
    for(let i=0;i<poolBots.length;i++){
        const bot=poolBots[i]; if(!bot.active) continue; bot.update(player,poolParticles,dt);
        if (player.radius < 5) { playerDeath(); return; }
        if (typeof clampBotToPhaseCage === "function") clampBotToPhaseCage(bot);
        if (typeof applyPhaseCageWallBleed === "function") applyPhaseCageWallBleed(bot, dt);

        if(checkBotColl && bot.active){
            for(let j=i+1;j<poolBots.length;j++){
                const botB=poolBots[j]; if(!botB.active || !bot.active) continue;
                const bdx=bot.x-botB.x,bdy=bot.y-botB.y,bDistSq=bdx*bdx+bdy*bdy;
                if(bDistSq<(bot.radius+botB.radius)**2){
                    if(bot.radius>botB.radius*GAME_SETTINGS.BOT_EAT_THRESHOLD&&!botB.isInvulnerable){ if(bDistSq<(bot.radius*GAME_SETTINGS.BOT_KILL_DIST_FACTOR)**2 && !playerCanDevourBot(botB)){ const grow=botB.radius*GAME_SETTINGS.GROW_FROM_BOT; botB.explode(poolNutrients); bot.radius=clampBotRadius(bot.radius+grow, bot); } }
                    else if(botB.radius>bot.radius*GAME_SETTINGS.BOT_EAT_THRESHOLD&&!bot.isInvulnerable){ if(bDistSq<(botB.radius*GAME_SETTINGS.BOT_KILL_DIST_FACTOR)**2 && !playerCanDevourBot(bot)){ const grow=bot.radius*GAME_SETTINGS.GROW_FROM_BOT; bot.explode(poolNutrients); botB.radius=clampBotRadius(botB.radius+grow, botB); break; } }
                }
            }
            if(!bot.active) continue;
        }

        const dx=player.x-bot.x,dy=player.y-bot.y,distSq=dx*dx+dy*dy;

        // Vampire Rift Damage
        poolBloodRifts.forEach(rift=>{ if(!rift.active||!bot.active) return; if((rift.x-bot.x)**2+(rift.y-bot.y)**2<rift.r*rift.r&&!bot.isInvulnerable){ const riftDps=ABILITY_SETTINGS.VAMPIRE_DAMAGE_BOTS*getBloodRiftDamageMult(rift); bot.radius-=riftDps*dt; player.radius+=(riftDps*0.5)*dt; if(bot.radius<5){ onBotKilled(bot); bot.explode(poolNutrients); } } });
        if(!bot.active) continue;

        // Shriek Pulse
        if(activeEffects.shriekPulse>0&&distSq<activeEffects.shriekPulse**2) bot.frozen=ABILITY_SETTINGS.WARP_FREEZE_DURATION;

        // Bot-Player Collisions
        if(distSq<(player.radius+bot.radius)**2){
            if(player.radius>bot.radius*GAME_SETTINGS.BOT_EAT_THRESHOLD&&!bot.isInvulnerable){ if(distSq<(player.radius*GAME_SETTINGS.BOT_KILL_DIST_FACTOR)**2){ const eatenR=bot.radius; onBotKilled(bot); bot.explode(poolNutrients); player.radius+=eatenR*GAME_SETTINGS.GROW_FROM_BOT; } }
            else if(bot.radius>player.radius*GAME_SETTINGS.BOT_EAT_THRESHOLD){ if(distSq<(bot.radius*GAME_SETTINGS.PLAYER_DEATH_DIST_FACTOR)**2){ deathFromEnvironment(); return; } else { const drain=GAME_SETTINGS.BOT_CONTACT_DRAIN*dt; bot.radius=clampBotRadius(bot.radius+drain, bot); player.radius-=drain; pulseDamageShake(2.4); if(player.radius<5){ deathFromEnvironment(); return; } } }
        }
    }

    if (typeof applyPhaseCagePostMoveCapture === "function") applyPhaseCagePostMoveCapture();
    for (let i = 0; i < poolBots.length; i++) {
        const bot = poolBots[i];
        if (!bot.active) continue;
        if (typeof repelBotFromPhaseCage === "function") repelBotFromPhaseCage(bot);
        if (typeof clampBotToPhaseCage === "function") clampBotToPhaseCage(bot);
    }

    // --- NUTRIENT COLLECTION ---
    // Spatial hash: construim grila de boți O(boți) o singură dată per checkNutr
    const _NGRID_CELL = 80;
    if (!window._nutrBotGrid) window._nutrBotGrid = new Map();
    const _nutrBotGrid = window._nutrBotGrid;
    if (checkNutr) {
        _nutrBotGrid.clear();
        for (let bI = 0; bI < poolBots.length; bI++) {
            const bot = poolBots[bI];
            if (!bot.active) continue;
            const gcx = Math.floor(bot.x / _NGRID_CELL);
            const gcy = Math.floor(bot.y / _NGRID_CELL);
            // Inserăm botul în toate celulele pe care le acoperă cu raza sa
            const cr = Math.min(3, Math.ceil(bot.radius / _NGRID_CELL));
            for (let ox = -cr; ox <= cr; ox++) {
                for (let oy = -cr; oy <= cr; oy++) {
                    const k = (gcx + ox) + "," + (gcy + oy);
                    let c = _nutrBotGrid.get(k);
                    if (!c) { c = []; _nutrBotGrid.set(k, c); }
                    c.push(bot);
                }
            }
        }
    }
    for(let i=0;i<poolNutrients.length;i++){ const n=poolNutrients[i]; if(!n.active) continue; n.update(dt); if(checkNutr){ if((player.x-n.x)**2+(player.y-n.y)**2<player.radius*player.radius){ playEatParticleSound(); player.radius+=GAME_SETTINGS.GROW_FROM_NUTRIENT*getCoreGrowthMultiplier(); const nutrientScoreGain=Math.floor(GAME_SETTINGS.SCORE_NUTRIENT*bountySystem.multiplier); player.score+=nutrientScoreGain; scoreElement.innerText=Math.floor(player.score); if(typeof spawnPickupFloat==="function"&&!n.suppressPickupFloat)spawnPickupFloat(n.x,n.y,nutrientScoreGain,"nutrient"); n.active=false; continue; }
        // Căutăm boți în celula nutrientului (boții mari sunt inserați în celulele vecine la build time)
        const _nk = Math.floor(n.x / _NGRID_CELL) + "," + Math.floor(n.y / _NGRID_CELL);
        const _nearBots = _nutrBotGrid.get(_nk);
        if (_nearBots) { for(let bI=0;bI<_nearBots.length;bI++){ const bot=_nearBots[bI]; if(!bot.active) continue; if(n.botEatDelay>0) continue; if((bot.x-n.x)**2+(bot.y-n.y)**2<bot.radius*bot.radius){ n.active=false; const _bgr=bot.config&&bot.config.growthRate!=null?bot.config.growthRate:1; bot.radius=clampBotRadius(bot.radius+ENEMY_BOT_SETTINGS.GROW_FROM_NUTRIENT*_bgr, bot); break; } } }
    } }

    // --- PARTICLE COLLECTION ---
    const prSq=player.radius*player.radius; let activePartsCount=0;
    const dustField = global.NebulaDust;
    const dustOn = !!(dustField && dustField.isActive());
    if (dustOn) dustField.advance(performance.now());

    // Pre-calc Black Hole pull (drift gravitational lent + consum la core) — doar praful local
    const _bhX = GAME_SETTINGS.WORLD_SIZE * 0.5;
    const _bhY = GAME_SETTINGS.WORLD_SIZE * 0.5;
    const _bhPullRange = GAME_SETTINGS.BH_PARTICLE_PULL_RANGE;
    const _bhPullRangeSq = _bhPullRange * _bhPullRange;
    const _bhCoreRSq = GAME_SETTINGS.BH_CORE_RADIUS * GAME_SETTINGS.BH_CORE_RADIUS;
    const _bhBasePull = GAME_SETTINGS.BH_PARTICLE_PULL_SPEED;

    function grantStardust(p) {
        playEatParticleSound();
        player.radius += selectedAbility === "vampire" ? GAME_SETTINGS.GROW_BONUS_VAMPIRE : GAME_SETTINGS.GROW_FROM_PARTICLE;
        const particleScoreGain = Math.floor(GAME_SETTINGS.SCORE_PARTICLE * bountySystem.multiplier);
        player.score += particleScoreGain;
        scoreElement.innerText = Math.floor(player.score);
        if (typeof spawnPickupFloat === "function") spawnPickupFloat(p.x, p.y, particleScoreGain, "particle");
    }

    const eatenShared = [];
    for (let i = 0; i < poolParticles.length; i++) {
        const p = poolParticles[i];
        if (!p.active) continue;
        activePartsCount++;
        if (!p.dustLocked) {
            const bdx = _bhX - p.x, bdy = _bhY - p.y;
            const bdSq = bdx * bdx + bdy * bdy;
            if (bdSq < _bhPullRangeSq) {
                if (bdSq < _bhCoreRSq) { p.active = false; continue; }
                const bdist = Math.sqrt(bdSq);
                const fall = 1 - bdist / _bhPullRange;
                const bhPullSpeed = fall * fall * _bhBasePull;
                p.x += (bdx / bdist) * bhPullSpeed * dt;
                p.y += (bdy / bdist) * bhPullSpeed * dt;
            }
        }

        const pdx = player.x - p.x, pdy = player.y - p.y, pdSq = pdx * pdx + pdy * pdy;
        if (pdSq < prSq) {
            if (dustOn && p.dustId) eatenShared.push(p);
            else {
                p.active = false;
                grantStardust(p);
            }
        }
    }
    for (let ei = 0; ei < eatenShared.length; ei++) {
        const mote = eatenShared[ei];
        if (dustField.consumeLocal(mote.dustId)) grantStardust(mote);
    }

    const glass = global.NebulaGlass;
    if (glass && glass.isActive() && global.NebulaGameMode && global.NebulaGameMode.getRunMode() === "mirror") {
        if (typeof glass.takeRevokedGrants === "function") {
            const revokedGrants = glass.takeRevokedGrants();
            for (let ri = 0; ri < revokedGrants.length; ri++) {
                const undone = revokedGrants[ri];
                if (!undone || !Number.isFinite(undone.radius) || !Number.isFinite(undone.score)) continue;
                player.radius = Math.max(1, player.radius - undone.radius);
                player.score = Math.max(0, player.score - undone.score);
                scoreElement.innerText = Math.floor(player.score);
            }
            if (revokedGrants.length > 0 && player.radius < 5) {
                deathFromEnvironment();
                return;
            }
        }
        if (typeof glass.tick === "function") glass.tick(dt, player);
        const glassEaten = [];
        glass.visitAlive((egg) => {
            const gdx = player.x - egg.x;
            const gdy = player.y - egg.y;
            const reach = player.radius + egg.r;
            if (gdx * gdx + gdy * gdy < reach * reach) glassEaten.push(egg);
        });
        for (let gi = 0; gi < glassEaten.length; gi++) {
            const egg = glassEaten[gi];
            if (!glass.consumeLocal(egg.id)) continue;
            playEatParticleSound();
            const radiusBefore = player.radius;
            player.radius += GAME_SETTINGS.GROW_FROM_NUTRIENT * getCoreGrowthMultiplier();
            const radiusAdded = player.radius - radiusBefore;
            const eggScore = Math.floor(GAME_SETTINGS.SCORE_NUTRIENT * bountySystem.multiplier);
            player.score += eggScore;
            scoreElement.innerText = Math.floor(player.score);
            if (typeof glass.noteLocalGrant === "function") glass.noteLocalGrant(egg.id, radiusAdded, eggScore);
            if (typeof spawnPickupFloat === "function") spawnPickupFloat(egg.x, egg.y, eggScore, "nutrient");
        }
    }

    // GROWTH CORE: scade rata de micșorare a Vampirului (max -30%)
    if(selectedAbility==="vampire"&&player.radius>ABILITY_SETTINGS.VAMPIRE_MIN_RADIUS) player.radius-=GAME_SETTINGS.VAMPIRE_SHRINK_RATE*getCoreShrinkMultiplier()*dt;

    // Spawn Particles from Pool if under max — singleplayer only. Mirror refills by id.
    if (!dustOn && activePartsCount < GAME_SETTINGS.MAX_PARTICLES) {
        const nP = getFromPool(poolParticles);
        if (nP) nP.spawn();
    }

    // --- LIMITA DE CRESTERE PLAYER ---
    // Hard cap: jucatorul nu poate depasi GAME_SETTINGS.MAX_PLAYER_RADIUS.
    // Daca vrei alta limita, modifica doar constanta de sus.
    if (player.radius > GAME_SETTINGS.MAX_PLAYER_RADIUS) {
        player.radius = GAME_SETTINGS.MAX_PLAYER_RADIUS;
    }

    if (typeof deps.afterSimUpdate === "function") deps.afterSimUpdate(dt);
        } finally {
            deps.setBhSiphonParticleCarry(bhSiphonParticleCarry);
        }
    }

    global.configureSimUpdate = configureSimUpdate;
    global.update = update;
})(typeof window !== "undefined" ? window : globalThis);
