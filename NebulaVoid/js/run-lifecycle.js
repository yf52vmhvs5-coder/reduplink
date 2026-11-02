/**
 * NEBULA VOID — singleplayer run reset, start, death, and game-over navigation.
 * configureRunLifecycle() from entities.js after pools and player exist.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, unknown>} */
    let deps = null;

    function configureRunLifecycle(nextDeps) {
        if (!nextDeps || typeof nextDeps.getPlayer !== "function") {
            throw new Error("configureRunLifecycle requires getPlayer, pools, and run state accessors");
        }
        deps = nextDeps;
    }

    function settings() {
        return deps.getGameSettings();
    }

    function spawnInitialBots() {
        const GAME_SETTINGS = settings();
        const ENTITY_TYPES = deps.getEntityTypes();
        const INITIAL_BOT_TOTAL = deps.getInitialBotTotal();
        const poolBots = deps.getPoolBots();
        const getFromPool = deps.getFromPool;

        poolBots.forEach((b) => {
            b.active = false;
        });
        const keys = Object.keys(ENTITY_TYPES);
        const nTypes = keys.length;
        const budget = INITIAL_BOT_TOTAL;
        const base = Math.floor(budget / nTypes);
        const extra = budget % nTypes;
        for (let i = 0; i < nTypes; i++) {
            const type = keys[i];
            const spawnCount = base + (i < extra ? 1 : 0);
            for (let j = 0; j < spawnCount; j++) {
                const b = getFromPool(poolBots);
                if (b) b.spawn(type);
            }
        }
    }

    function resetRunState() {
        const GAME_SETTINGS = settings();
        const player = deps.getPlayer();
        const screenW = deps.getScreenW();
        const screenH = deps.getScreenH();

        deps.incrementRunId();
        player.radius = GAME_SETTINGS.START_RADIUS;
        player.score = 0;
        player.x = GAME_SETTINGS.WORLD_SIZE / 2;
        player.y = GAME_SETTINGS.WORLD_SIZE / 2 + 500;
        deps.setCameraPosition(player.x, player.y);
        deps.setCameraLookAhead(0, 0);
        deps.setInterpolatedZoom(Math.min(1.0, Math.min(screenW, screenH) / 700));
        deps.setRoundBotKills(0);
        deps.setRoundStartTime(performance.now());
        deps.resetScreenShake();
        deps.setScoreHudText("0");

        const pools = deps.getPools();
        pools.poolBots.forEach((b) => {
            b.active = false;
        });
        pools.poolParticles.forEach((p) => {
            p.active = false;
        });
        pools.poolBloodRifts.forEach((r) => {
            r.active = false;
            r.huntPrey = false;
            r.trackBot = null;
            r.isAfterglow = false;
            r.afterglowMaxLife = 0;
            if (typeof deps.clearRiftSiphons === "function") deps.clearRiftSiphons(r);
        });
        pools.poolSporeGhosts.forEach((g) => {
            g.active = false;
            g.phase = "fade";
            g.targetBot = null;
            g.latchLife = 0;
            g.toxicTier = 0;
            g.splitDispatched = false;
        });
        deps.setSporeDashBurstSerial(0);
        pools.poolBHSiphonParticles.forEach((p) => {
            p.active = false;
        });
        deps.setBhSiphonParticleCarry(0);
        pools.poolAuraParticles.forEach((p) => {
            p.active = false;
        });
        deps.setAuraSpawnCarry(0);
        pools.poolNutrients.forEach((n) => {
            n.active = false;
        });
        pools.poolJellyBubbles.forEach((j) => {
            j.active = false;
        });

        const bounty = deps.getBountySystem();
        bounty.multiplier = 1;
        bounty.timer = 0;
        bounty.comboCount = 0;
        bounty.lastKillTime = 0;
        const activeEffects = deps.getActiveEffects();
        activeEffects.shriekPulse = 0;
        activeEffects.dashTime = 0;
        player.cooldown = 0;
        if (typeof deps.clearPhaseCage === "function") deps.clearPhaseCage();
        if (typeof deps.clearPickupFloats === "function") deps.clearPickupFloats();
    }

    function startRunFromRetry() {
        const selectedAbility = deps.getSelectedAbility();
        const startMenu = deps.dom.startMenu;
        if (!selectedAbility) {
            deps.hideGameOverOverlay();
            if (startMenu) {
                startMenu.style.display = "flex";
                startMenu.style.opacity = "1";
                startMenu.style.pointerEvents = "";
            }
            document.body.classList.remove("game-running");
            return;
        }

        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        deps.hideGameOverOverlay();
        if (startMenu) {
            startMenu.style.opacity = "0";
            startMenu.style.display = "none";
            startMenu.style.pointerEvents = "none";
        }
        document.body.classList.add("game-running");
        resetRunState();
        deps.initJellyBubbles();
        spawnInitialBots();
        if (typeof deps.setAmbientLevel === "function") {
            deps.setAmbientLevel(deps.getAmbientArenaGain(), 2.4);
        }
        deps.setIsDying(false);
        deps.setGameActive(true);
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        deps.ensureDrawLoop();
    }

    function playerDeath() {
        if (deps.getIsDying()) return;
        if (global.NebulaGameMode && global.NebulaGameMode.getRunMode() === "mirror") {
            if (typeof global.mirrorPlayerDeath === "function") global.mirrorPlayerDeath();
            return;
        }

        const player = deps.getPlayer();
        const poolNutrients = deps.getPools().poolNutrients;
        const getFromPool = deps.getFromPool;
        const matterEarnedSnapshot = Math.floor(player.score);
        const survivedSecondsSnapshot = (performance.now() - deps.getRoundStartTime()) / 1000;

        deps.addScreenShake(4.5, 0.3);
        if (typeof deps.playDeathSound === "function") deps.playDeathSound();
        if (typeof deps.updateBlackHoleAudio === "function") deps.updateBlackHoleAudio(9999, 9999);

        deps.setIsDying(true);
        deps.setGameActive(false);
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();

        for (let i = 0; i < 10; i++) {
            const n = getFromPool(poolNutrients);
            if (n) {
                n.spawn(player.x, player.y, player.glow);
                n.vx = (Math.random() - 0.5) * 3200;
                n.vy = (Math.random() - 0.5) * 3200;
            }
        }

        setTimeout(() => {
            deps.setIsDying(false);
            document.body.classList.remove("game-running");
            resetRunState();
            deps.showGameOverOverlay(matterEarnedSnapshot, survivedSecondsSnapshot);
        }, 2500);
    }

    function onGameOverRetry() {
        if (typeof global.restoreTabletScreen === "function") global.restoreTabletScreen();
        if (typeof global.tryMirrorGameOverRetry === "function" && global.tryMirrorGameOverRetry()) {
            return;
        }
        startRunFromRetry();
    }

    function onGameOverChangeEntity() {
        if (
            typeof global.tryMirrorGameOverChangeEntity === "function" &&
            global.tryMirrorGameOverChangeEntity()
        ) {
            return;
        }
        deps.hideGameOverOverlay();
        deps.setHubSkippedForSession(true);
        deps.setEntitySelectActive(true);
        const introScreen = deps.dom.introScreen;
        const startMenu = deps.dom.startMenu;
        if (introScreen) introScreen.style.display = "none";
        if (startMenu) {
            startMenu.style.display = "flex";
            startMenu.style.opacity = "1";
            startMenu.style.pointerEvents = "";
            startMenu.classList.add("ready");
        }
        if (typeof deps.setAmbientLevel === "function") deps.setAmbientLevel(0.0001, 1.1);
        if (typeof deps.resetGameOverSessionMatter === "function") deps.resetGameOverSessionMatter();
        document.body.classList.remove("game-running");
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        if (typeof deps.renderSelectedSkin === "function") deps.renderSelectedSkin();
        deps.ensureDrawLoop();
    }

    function startGameWithSkin(skin) {
        if (!skin || !skin.unlocked) return;
        if (typeof global.restoreTabletScreen === "function") global.restoreTabletScreen();
        if (global.NebulaGameMode && typeof global.NebulaGameMode.setRunMode === "function") {
            global.NebulaGameMode.setRunMode("single");
        }
        const player = deps.getPlayer();
        const startMenu = deps.dom.startMenu;
        const uiContainer = deps.dom.uiContainer;

        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        document.body.classList.add("game-running");
        if (
            startMenu &&
            typeof deps.getControlScheme === "function" &&
            deps.getControlScheme() === "wasd"
        ) {
            startMenu.style.pointerEvents = "none";
        }
        if (typeof deps.dismissEvolutionLabForGameStart === "function") {
            deps.dismissEvolutionLabForGameStart();
        }
        deps.hideGameOverOverlay();
        deps.initAudio();
        if (typeof deps.setAmbientLevel === "function") {
            deps.setAmbientLevel(deps.getAmbientArenaGain(), 2.8);
        }
        player.glow = skin.color;
        if (typeof deps.applySkinCursor === "function") deps.applySkinCursor(skin.color);
        deps.setActiveRunSkinName(skin.name);
        deps.setSelectedAbility(skin.ability);
        resetRunState();
        deps.initJellyBubbles();
        if (uiContainer) {
            uiContainer.style.color = `color-mix(in srgb, ${skin.color} 82%, #252525)`;
            uiContainer.style.setProperty(
                "--score-glow",
                `color-mix(in srgb, ${skin.color} 42%, transparent)`
            );
        }
        deps.setGameActive(true);
        deps.setIsDying(false);
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        if (startMenu) {
            const wasdRun =
                typeof deps.getControlScheme === "function" && deps.getControlScheme() === "wasd";
            startMenu.style.opacity = "0";
            setTimeout(() => {
                if (!startMenu) return;
                startMenu.style.display = "none";
                if (wasdRun) startMenu.style.pointerEvents = "";
            }, 1000);
        }
        spawnInitialBots();
        deps.ensureDrawLoop();
    }

    function wireGameOverButtons() {
        const retryBtn = deps.dom.retryBtn;
        const backToMenuBtn = deps.dom.backToMenuBtn;
        if (retryBtn) retryBtn.addEventListener("click", () => onGameOverRetry());
        if (backToMenuBtn) backToMenuBtn.addEventListener("click", () => onGameOverChangeEntity());
    }

    global.configureRunLifecycle = configureRunLifecycle;
    global.resetRunState = resetRunState;
    global.spawnInitialBots = spawnInitialBots;
    global.startRunFromRetry = startRunFromRetry;
    global.playerDeath = playerDeath;
    global.onGameOverRetry = onGameOverRetry;
    global.onGameOverChangeEntity = onGameOverChangeEntity;
    global.startGameWithSkin = startGameWithSkin;
    global.wireRunLifecycleGameOverButtons = wireGameOverButtons;
})(typeof window !== "undefined" ? window : globalThis);
