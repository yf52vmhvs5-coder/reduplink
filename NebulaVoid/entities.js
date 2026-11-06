// === Config din js/game-data.js (js/config-loader.js) ===
const __GAME_BOOT = window.__GAME_BOOT;
if (!__GAME_BOOT) {
    throw new Error("NEBULA VOID: game config missing. Load js/config-loader.js and await loadGameConfig() before entities.js.");
}

const GAME_SETTINGS = __GAME_BOOT.gameSettings;
const ABILITY_SETTINGS = __GAME_BOOT.abilitySettings;
const ENEMY_BOT_SETTINGS = __GAME_BOOT.enemyBotSettings;
const ENTITY_TYPES = __GAME_BOOT.entityTypes;
const __WORLD_CFG = __GAME_BOOT.world;
const __META_CFG = __GAME_BOOT.meta;

if (typeof getFromPool !== "function") {
    throw new Error("NEBULA VOID: load js/pool.js before entities.js");
}
if (typeof Nutrient !== "function" || typeof Particle !== "function" || typeof getNutrientHslCache !== "function") {
    throw new Error("NEBULA VOID: load js/nutrient.js and js/particle.js before entities.js");
}
if (typeof configureEntityMods !== "function" || typeof playerHasRavenousHuntMod !== "function") {
    throw new Error("NEBULA VOID: load js/entity-mods.js before entities.js");
}
if (typeof configureSporeGhosts !== "function" || typeof updateSporeGhosts !== "function") {
    throw new Error("NEBULA VOID: load js/spore-ghosts.js before entities.js");
}
if (typeof EnemyBot !== "function" || typeof configureEnemyBot !== "function") {
    throw new Error("NEBULA VOID: load js/enemy-bot.js before entities.js");
}
if (typeof JellyBubble !== "function" || typeof configureJellyBubble !== "function") {
    throw new Error("NEBULA VOID: load js/jelly-bubble.js before entities.js");
}
if (typeof pulseDamageShake !== "function" || typeof getScreenShakeOffset !== "function") {
    throw new Error("NEBULA VOID: load js/fx-presentation.js before entities.js");
}
if (typeof drawCosmicDust !== "function") {
    throw new Error("NEBULA VOID: load js/fx-presentation.js before entities.js");
}
if (typeof configureEvolution !== "function" || typeof getEvolutionLevel !== "function") {
    throw new Error("NEBULA VOID: load js/evolution-rules.js before entities.js");
}
if (typeof configureBloodRift !== "function" || typeof updateHomingBloodRift !== "function") {
    throw new Error("NEBULA VOID: load js/ravenous-blood-rift.js before entities.js");
}
if (typeof drawOrganicBolt !== "function") {
    throw new Error("NEBULA VOID: load js/ravenous-blood-rift.js before entities.js");
}
if (typeof spawnPhaseCageFromWarp !== "function" || typeof clampBotToPhaseCage !== "function") {
    throw new Error("NEBULA VOID: load js/phase-cage.js before entities.js");
}
if (
    typeof configureBloodRiftSiphons !== "function" ||
    typeof updateBloodRiftSiphons !== "function" ||
    typeof drawBloodRiftSiphons !== "function"
) {
    throw new Error("NEBULA VOID: load js/ravenous-blood-rift.js before entities.js");
}
if (typeof readBestScore !== "function" || typeof spendVoidMatter !== "function") {
    throw new Error("NEBULA VOID: load js/save.js before entities.js");
}
var evolutionUpgrades = window.evolutionUpgrades;
var entityModsOwned = window.entityModsOwned;
if (typeof configureAudio !== "function") {
    throw new Error("NEBULA VOID: load js/audio.js before entities.js");
}
if (!window.NebulaDom) {
    throw new Error("NEBULA VOID: load js/ui-shell.js before entities.js");
}
if (typeof configureSimUpdate !== "function" || typeof update !== "function") {
    throw new Error("NEBULA VOID: load js/sim-update.js before entities.js");
}
if (typeof configureSimDraw !== "function" || typeof ensureDrawLoop !== "function") {
    throw new Error("NEBULA VOID: load js/sim-draw.js before entities.js");
}
if (typeof readHubTitleColor !== "function" || typeof initHubTitleColorSwatches !== "function") {
    throw new Error("NEBULA VOID: load js/ui-shell.js before entities.js");
}
if (typeof getEntityScoreHudFontStyle !== "function" || typeof hudColorsFromAccent !== "function") {
    throw new Error("NEBULA VOID: load js/ui-shell.js before entities.js");
}
if (typeof configureGameOverUi !== "function" || typeof showGameOverOverlay !== "function") {
    throw new Error("NEBULA VOID: load js/ui-shell.js before entities.js");
}
if (typeof configureEntitySelectUi !== "function" || typeof renderSelectedSkin !== "function") {
    throw new Error("NEBULA VOID: load js/entity-select-ui.js before entities.js");
}
if (typeof globalThis.NebulaMpMirror === "undefined") {
    throw new Error("NEBULA VOID: load js/mp-mirror.js before entities.js");
}
if (typeof globalThis.NebulaMpRemotes === "undefined") {
    throw new Error("NEBULA VOID: load js/mp-remotes.js before entities.js");
}
if (typeof configureMpLobby !== "function") {
    throw new Error("NEBULA VOID: load js/mp-lobby.js before entities.js");
}
if (typeof configureMpSession !== "function") {
    throw new Error("NEBULA VOID: load js/mp-session.js before entities.js");
}
if (typeof configureMpTaunts !== "function") {
    throw new Error("NEBULA VOID: load js/mp-taunts.js before entities.js");
}
if (typeof configureMirrorMatch !== "function") {
    throw new Error("NEBULA VOID: load js/mirror-match.js before entities.js");
}
if (typeof configureMirrorAbilities !== "function") {
    throw new Error("NEBULA VOID: load js/mp-abilities.js before entities.js");
}
if (typeof configureRunLifecycle !== "function") {
    throw new Error("NEBULA VOID: load js/run-lifecycle.js before entities.js");
}
if (typeof configureAboutArchiveUi !== "function") {
    throw new Error("NEBULA VOID: load js/about-archive-ui.js before entities.js");
}
if (typeof configureHubFlow !== "function") {
    throw new Error("NEBULA VOID: load js/hub-flow.js before entities.js");
}

const __MP_CFG = __GAME_BOOT.multiplayer || {};
if (globalThis.NebulaMpMirror && typeof globalThis.NebulaMpMirror.configureMpMirror === "function") {
    const mirror = globalThis.NebulaMpMirror;
    const picked =
        typeof mirror.resolveRelayUrl === "function"
            ? mirror.resolveRelayUrl(__MP_CFG)
            : typeof __MP_CFG.relayWsUrl === "string"
              ? __MP_CFG.relayWsUrl
              : undefined;
    mirror.configureMpMirror({
        relayWsUrl: picked,
    });
}

// === Simulation modules: pool, nutrient, particle, jelly, bots → js/ ===

// =============================================================================
// 🖥️ PARTEA 3: INIȚIALIZARE, UI ȘI STARE JOC (STATE)
// =============================================================================

// --- CANVAS, CONTEXT & ELEMENTE UI → js/ui-shell.js ---
const {
    canvas,
    ctx,
    uiContainer,
    scoreElement,
    introScreen,
    menuTitle,
    hubPlayBtn,
    hubMultiplayerBtn,
    hubOptionsBtn,
    hubAboutBtn,
    hubActions,
    optionsScreen,
    aboutScreen,
    multiplayerLobbyScreen,
    multiplayerLobbyBackBtn,
    mpLobbyCancelHubBtn,
    mpLobbyEntityLabel,
    mpLobbyPlayerCount,
    mpLobbyPanelIdle,
    mpLobbyPanelWaiting,
    mpCreateRoomBtn,
    mpRoomLockBtn,
    mpPublicRooms,
    mpPublicRoomList,
    mpFindSignalBtn,
    mpJoinRoomBtn,
    mpLobbyJoinStack,
    mpRoomCodeInput,
    mpLobbyError,
    mpRoomCodeDisplay,
    mpLobbyStatusText,
    mpStartMatchBtn,
    mpLobbyChatToggleBtn,
    mpLobbyChatCompose,
    mpChatLogPeer,
    mpChatLogSelf,
    mpChatInput,
    mpChatSendBtn,
    optionsBackBtn,
    aboutBackBtn,
    menuFullscreenBtn,
    menuSoundBtn,
    startMenu,
    abilityDesc,
    evolutionLabBtn,
    skinSelector,
    entitySelectBackBtn,
    skinPriceBadge,
    matterDisplay,
    skinActionBtn,
    gameOverOverlay,
    runMatterEarnedElement,
    totalVoidMatterElement,
    timeIntrudedElement,
    retryBtn,
    backToMenuBtn,
} = window.NebulaDom;

// --- Hub title tint → js/ui-shell.js ---

// --- DIMENSIUNI ECRAN ---
let screenW, screenH;
function resizeCanvas() {
    screenW = window.innerWidth;
    screenH = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = screenW * dpr;
    canvas.height = screenH * dpr;
    canvas.style.width = screenW + "px";
    canvas.style.height = screenH + "px";
    // Setarea canvas.width resetează contextul la identity; re-aplicăm DPR scale.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Re-sincronizăm UI skin (try-catch: UI-ul poate să nu fie init. încă).
    try { renderSelectedSkin(); } catch(e) {}
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// --- Praful cosmic (static) → js/fx-presentation.js ---

// --- Cache culori nutrienți → js/nutrient.js (getNutrientHslCache) ---
const _NUTRIENT_HSL = getNutrientHslCache();

// --- GENERARE POOLS (PRE-ALOCARE MEMORIE) ---
// Boți: plafon rundă ~INITIAL_BOT_TOTAL + mic buffer (fără spawn dinamic de boți noi).
const INITIAL_BOT_TOTAL = __WORLD_CFG.initialBotTotal;
const MAX_POOL_BOTS = INITIAL_BOT_TOTAL + __WORLD_CFG.poolBotBuffer;
const MAX_POOL_NUTRIENTS = __WORLD_CFG.maxPoolNutrients;
const MAX_POOL_PARTICLES = GAME_SETTINGS.MAX_PARTICLES + GAME_SETTINGS.PARTICLE_POOL_EXTRA;

let poolBots = Array.from({ length: MAX_POOL_BOTS }, () => new EnemyBot());
let poolNutrients = Array.from({ length: MAX_POOL_NUTRIENTS }, () => new Nutrient());
let poolParticles = Array.from({ length: MAX_POOL_PARTICLES }, () => new Particle());
if (typeof NebulaDust !== "undefined") NebulaDust.bind(() => poolParticles);

// --- EFECTE SPECIALE SIMPLE ---
let poolBloodRifts = Array.from({ length: 20 }, () => ({
    active: false,
    x: 0,
    y: 0,
    r: 0,
    life: 0,
    huntPrey: false,
    trackBot: null,
    isAfterglow: false,
    afterglowMaxLife: 0,
    siphonBots: [],
    siphonRetargetTimer: 0,
}));
let poolSporeGhosts = Array.from({ length: 72 }, () => ({
    active: false,
    x: 0,
    y: 0,
    r: 0,
    life: 0,
    phase: "fade",
    dashBurstId: 0,
    latchSlot: 0,
    latchLife: 0,
    latchAngle: 0,
    targetBot: null,
    toxicTier: 0,
    splitDispatched: false,
}));
let sporeDashBurstSerial = 0;
let poolBHSiphonParticles = Array.from({ length: 140 }, () => ({ active: false, x:0, y:0, vx:0, vy:0, r:0, life:0, maxLife:1, color:"rgba(180,120,255,0.6)" }));
let bhSiphonParticleCarry = 0;

// Aura subtilă: particule în culoarea skinului care ies continuu din player.
const MAX_AURA_PARTICLES = __WORLD_CFG.maxAuraParticles;
let poolAuraParticles = Array.from({ length: MAX_AURA_PARTICLES }, () => ({ active: false, x:0, y:0, vx:0, vy:0, r:0, life:0, maxLife:1 }));
let auraSpawnCarry = 0;

// --- STARE JOC ---
let gameActive = false;
let isDying = false;
let selectedAbility = "";
let activeRunSkinName = "";
// Incrementat la fiecare reset; timer-ele întârziate (ex. respawn boți) îl compară ca să nu treacă în runda următoare.
let runId = 0;

configureAudio({
    getState: () => ({
        isDying,
        worldSize: GAME_SETTINGS.WORLD_SIZE,
        startRadius: GAME_SETTINGS.START_RADIUS,
        maxPlayerRadius: GAME_SETTINGS.MAX_PLAYER_RADIUS,
    }),
});

if (typeof configurePickupFloat === "function") {
    configurePickupFloat({
        colors: GAME_SETTINGS.PICKUP_FLOAT_COLORS,
    });
}

// Adaugă sub celelalte pool-uri
const MAX_JELLY_BUBBLES = __WORLD_CFG.maxJellyBubbles;
let poolJellyBubbles = Array.from({ length: MAX_JELLY_BUBBLES }, () => new JellyBubble());

// Jucătorul
let player = {
    x: GAME_SETTINGS.WORLD_SIZE / 2,
    y: GAME_SETTINGS.WORLD_SIZE / 2 + 500,
    radius: GAME_SETTINGS.START_RADIUS,
    color: "#0a0a0a",
    glow: "#ff0000",
    score: 0,
    cooldown: 0
};

function getRemotePlayer(peerId) {
    return globalThis.NebulaMpRemotes.getRemotePlayer(peerId);
}
function getRemotePlayers() {
    return globalThis.NebulaMpRemotes.getRemotePlayers();
}
function getLocalPeerId() {
    return globalThis.NebulaMpRemotes.getLocalPeerId();
}

configureJellyBubble({
    getSpawnContext: () => ({ poolJellyBubbles, player }),
});
configureBloodRift({
    getPoolBots: () => poolBots,
    getPoolBloodRifts: () => poolBloodRifts,
});
configureBloodRiftSiphons({
    getPoolBots: () => poolBots,
    getPlayer: () => player,
    getAbilitySettings: () => ABILITY_SETTINGS,
    getNutrientPool: () => poolNutrients,
    onBotKilled: (bot) => onBotKilled(bot),
    hasSiphonMod: () => playerHasRavenousSiphonMod(),
});
configureEnemyBot({
    getWorld: () => ({
        poolBots,
        poolJellyBubbles,
        poolNutrients,
        poolParticles,
        gameActive,
        isDying,
        runId,
        player,
        pulseDamageShake,
    }),
});

// Efecte active (Timpul este stocat acum exclusiv in secunde)
let activeEffects = {
    shriekPulse: 0,
    dashTime: 0,
};

// Mouse
let mouse = { x: screenW / 2, y: screenH / 2 };
let interpolatedZoom = Math.min(1.0, Math.min(screenW, screenH) / 700);
let cameraX = GAME_SETTINGS.WORLD_SIZE / 2;
let cameraY = GAME_SETTINGS.WORLD_SIZE / 2 + 500;
let cameraLookAheadX = 0;
let cameraLookAheadY = 0;

/** Camera / zoom / aura state mutated by js/sim-draw.js each frame. */
const simDrawCam = {
    get cameraX() { return cameraX; },
    set cameraX(v) { cameraX = v; },
    get cameraY() { return cameraY; },
    set cameraY(v) { cameraY = v; },
    get cameraLookAheadX() { return cameraLookAheadX; },
    set cameraLookAheadX(v) { cameraLookAheadX = v; },
    get cameraLookAheadY() { return cameraLookAheadY; },
    set cameraLookAheadY(v) { cameraLookAheadY = v; },
    get interpolatedZoom() { return interpolatedZoom; },
    set interpolatedZoom(v) { interpolatedZoom = v; },
    get auraSpawnCarry() { return auraSpawnCarry; },
    set auraSpawnCarry(v) { auraSpawnCarry = v; },
};

// Sistem Bounty
let bountySystem = {
    multiplier: 1,
    timer: 0,
    comboCount: 0,
    lastKillTime: 0
};

const FEATURE_VERSION_STORAGE_KEY = __META_CFG.featureVersionStorageKey;
const CURRENT_FEATURE_VERSION = __META_CFG.currentFeatureVersion;
// Entity mod tiers → js/entity-mods.js | Spore ghosts → js/spore-ghosts.js

configureEntityMods({
    getActiveRunSkinName: () => activeRunSkinName,
});

if (typeof configurePhaseCage === "function") {
    configurePhaseCage({
        phaseShifterX1Cfg: PHASE_SHIFTER_X1_CFG,
        phaseShifterX2Cfg: PHASE_SHIFTER_X2_CFG,
        phaseShifterX3Cfg: PHASE_SHIFTER_X3_CFG,
        hasResonanceMod: () => playerHasPhaseResonanceMod(),
        hasAscendMod: () => playerHasPhaseAscendMod(),
        getPoolBots: () => poolBots,
        onBotKilled: (bot) => onBotKilled(bot),
        getAbilitySettings: () => ABILITY_SETTINGS,
        getNutrientPool: () => poolNutrients,
    });
}

function getBloodRiftDamageMult(rift) {
    if (!rift || !rift.isAfterglow) return 1;
    const mult = Number(RAVENOUS_X3_CFG.afterglowDpsMult);
    return Number.isFinite(mult) ? mult : 0.35;
}

function spawnBloodRiftAt(x, y, ignorePreyBot) {
    const rift = getFromPool(poolBloodRifts);
    if (!rift) return null;
    rift.active = true;
    rift.isAfterglow = false;
    rift.afterglowMaxLife = 0;
    rift.x = x;
    rift.y = y;
    rift.r = ABILITY_SETTINGS.VAMPIRE_RIFT_RADIUS;
    rift.life = ABILITY_SETTINGS.VAMPIRE_RIFT_LIFE;
    rift.huntPrey = playerHasRavenousHuntMod();
    rift.trackBot = null;
    clearRiftSiphons(rift);
    if (rift.huntPrey) {
        rift.trackBot = findBloodRiftPrey(
            x,
            y,
            RAVENOUS_X1_CFG.acquireRange,
            ignorePreyBot || null
        );
    }
    return rift;
}

function beginRiftAfterglow(r) {
    const lifeSec = Number(RAVENOUS_X3_CFG.afterglowLifeSec);
    const radiusMult = Number(RAVENOUS_X3_CFG.afterglowRadiusMult);
    r.isAfterglow = true;
    r.huntPrey = false;
    r.trackBot = null;
    clearRiftSiphons(r);
    r.r *= Number.isFinite(radiusMult) ? radiusMult : 0.55;
    r.afterglowMaxLife = Number.isFinite(lifeSec) ? lifeSec : 1.5;
    r.life = r.afterglowMaxLife;
}

// Blood rift homing → js/ravenous-blood-rift.js

// Entity select + Evolution Lab UI → js/entity-select-ui.js (getActiveSkinKey acolo)

let roundBotKills = 0;
let roundStartTime = performance.now();
let sessionMatterEarned = 0;

configureGameOverUi({
    dom: {
        gameOverOverlay,
        runMatterEarnedElement,
        totalVoidMatterElement,
        timeIntrudedElement,
    },
    getPlayer: () => player,
    getSessionMatterEarned: () => sessionMatterEarned,
    setSessionMatterEarned: (v) => { sessionMatterEarned = v; },
    getTotalVoidMatter: () => window.totalVoidMatter,
    addTotalVoidMatter,
});

configureAboutArchiveUi({
    dom: { aboutScreen },
});

configureRunLifecycle({
    getGameSettings: () => GAME_SETTINGS,
    getEntityTypes: () => ENTITY_TYPES,
    getInitialBotTotal: () => INITIAL_BOT_TOTAL,
    getPlayer: () => player,
    getScreenW: () => screenW,
    getScreenH: () => screenH,
    getFromPool,
    getPoolBots: () => poolBots,
    getPools: () => ({
        poolBots,
        poolParticles,
        poolBloodRifts,
        poolSporeGhosts,
        poolBHSiphonParticles,
        poolAuraParticles,
        poolNutrients,
        poolJellyBubbles,
    }),
    incrementRunId: () => {
        runId++;
    },
    getRunId: () => runId,
    setCameraPosition: (x, y) => {
        cameraX = x;
        cameraY = y;
    },
    setCameraLookAhead: (x, y) => {
        cameraLookAheadX = x;
        cameraLookAheadY = y;
    },
    setInterpolatedZoom: (z) => {
        interpolatedZoom = z;
    },
    setRoundBotKills: (v) => {
        roundBotKills = v;
    },
    getRoundBotKills: () => roundBotKills,
    setRoundStartTime: (t) => {
        roundStartTime = t;
    },
    getRoundStartTime: () => roundStartTime,
    resetScreenShake,
    setScoreHudText: (text) => {
        scoreElement.innerText = text;
    },
    setSporeDashBurstSerial: (v) => {
        sporeDashBurstSerial = v;
    },
    setBhSiphonParticleCarry: (v) => {
        bhSiphonParticleCarry = v;
    },
    setAuraSpawnCarry: (v) => {
        auraSpawnCarry = v;
    },
    getBountySystem: () => bountySystem,
    getActiveEffects: () => activeEffects,
    clearRiftSiphons,
    clearPhaseCage,
    clearPickupFloats,
    getSelectedAbility: () => selectedAbility,
    setSelectedAbility: (v) => {
        selectedAbility = v;
    },
    getActiveRunSkinName: () => activeRunSkinName,
    setActiveRunSkinName: (v) => {
        activeRunSkinName = v;
    },
    getGameActive: () => gameActive,
    setGameActive: (v) => {
        gameActive = v;
    },
    getIsDying: () => isDying,
    setIsDying: (v) => {
        isDying = v;
    },
    dom: {
        startMenu,
        uiContainer,
        introScreen,
        retryBtn,
        backToMenuBtn,
    },
    hideGameOverOverlay,
    showGameOverOverlay,
    initJellyBubbles,
    ensureDrawLoop,
    initAudio,
    setAmbientLevel,
    getAmbientArenaGain: () => NebulaAudio.getAmbientArenaGain(),
    clearWasdKeysState,
    getControlScheme,
    dismissEvolutionLabForGameStart,
    applySkinCursor,
    addScreenShake,
    playDeathSound,
    updateBlackHoleAudio,
    resetGameOverSessionMatter,
    renderSelectedSkin,
    setHubSkippedForSession: (v) => {
        if (typeof setHubSkippedForSession === "function") setHubSkippedForSession(v);
    },
    setEntitySelectActive: (v) => {
        if (typeof setEntitySelectActive === "function") setEntitySelectActive(v);
    },
});

if (typeof wireRunLifecycleGameOverButtons === "function") wireRunLifecycleGameOverButtons();
if (totalVoidMatterElement) {
    totalVoidMatterElement.innerText = formatVoidMatterDisplay(window.totalVoidMatter);
}

configureEntitySelectUi({
    dom: {
        skinSelector,
        abilityDesc,
        evolutionLabBtn,
        skinActionBtn,
        matterDisplay,
        skinPriceBadge,
        startMenu,
        menuTitle,
        menuFullscreenBtn,
        menuSoundBtn,
    },
    getGameActive: () => gameActive,
    getIsDying: () => isDying,
    getActiveRunSkinName: () => activeRunSkinName,
    getEntitySelectActive: () =>
        typeof globalThis.getEntitySelectActive === "function"
            ? globalThis.getEntitySelectActive()
            : false,
    getEntitySelectIntent: () =>
        window.NebulaGameMode && typeof window.NebulaGameMode.getEntitySelectIntent === "function"
            ? window.NebulaGameMode.getEntitySelectIntent()
            : "single",
    onStartGameWithSkin: (skin) => {
        if (typeof globalThis.startGameWithSkin === "function") globalThis.startGameWithSkin(skin);
    },
    onEnterMultiplayerLobby: (skin) => {
        if (typeof globalThis.enterMultiplayerLobby === "function") globalThis.enterMultiplayerLobby(skin);
    },
});

configureMpLobby({
    dom: {
        multiplayerLobbyBackBtn,
        mpLobbyCancelHubBtn,
        mpLobbyEntityLabel,
        mpLobbyPlayerCount,
        mpLobbyPanelIdle,
        mpLobbyPanelWaiting,
        mpCreateRoomBtn,
        mpRoomLockBtn,
        mpPublicRooms,
        mpPublicRoomList,
        mpFindSignalBtn,
        mpJoinRoomBtn,
        mpLobbyJoinStack,
        mpRoomCodeInput,
        mpLobbyError,
        mpRoomCodeDisplay,
        mpLobbyStatusText,
        mpStartMatchBtn,
        multiplayerLobbyScreen,
        mpLobbyChatToggleBtn,
        mpLobbyChatCompose,
        mpChatLogPeer,
        mpChatLogSelf,
        mpChatInput,
        mpChatSendBtn,
    },
    playHoverSound: () => {
        try {
            if (typeof playHoverSound === "function") playHoverSound();
        } catch (e) {}
    },
    playChatReceiveSound: () => {
        try {
            if (NebulaAudio.isSoundEnabled() && typeof initAudio === "function") initAudio();
            if (typeof playChatReceiveSound === "function") playChatReceiveSound();
        } catch (e) {}
    },
    ensureDrawLoop,
    onReturnToEntitySelect: () => returnFromMultiplayerLobbyToEntitySelect(),
    onLeaveToHub: () => {
        hideMenuOverlay(multiplayerLobbyScreen);
        showMainHub();
        ensureDrawLoop();
    },
    onOpponentLeft: (msg) => noteMirrorOpponentLeft(msg),
    onRelayLost: () => {
        if (typeof noteMirrorRelayLost === "function") noteMirrorRelayLost();
    },
    onMatchLiveRejected: () => {
        if (typeof abortMirrorMatchToLobby === "function") abortMirrorMatchToLobby();
    },
    allowMockPeerFallback: __MP_CFG.allowMockPeerFallback === true,
    getMultiplayerConfig: () => __MP_CFG,
    onMirrorRelay: (msg) => {
        if (typeof handleMpRelayMessage === "function") handleMpRelayMessage(msg);
    },
    onMirrorMatchRequested: (ctx) => {
        if (typeof requestStartMirrorMatch === "function") requestStartMirrorMatch(ctx);
    },
});

configureMpSession({
    getRunMode: () =>
        window.NebulaGameMode && typeof window.NebulaGameMode.getRunMode === "function"
            ? window.NebulaGameMode.getRunMode()
            : "single",
    getMultiplayerConfig: () => __MP_CFG,
    getPlayer: () => player,
    getRemotePlayer,
    getRemotePlayers,
    getLocalPeerId,
    getEntityName: () => activeRunSkinName,
    getAbilitySnapshot: () =>
        typeof mirrorAbilitySnapshot === "function" ? mirrorAbilitySnapshot() : null,
    onRemoteMatchStart: (msg) => {
        if (typeof onRemoteMatchStart === "function") onRemoteMatchStart(msg);
    },
    onRemoteMatchEnd: (msg) => {
        if (typeof onRemoteMatchEnd === "function") onRemoteMatchEnd(msg);
    },
    onRemoteClaimHit: (msg) => {
        if (typeof onRemoteClaimHit === "function") onRemoteClaimHit(msg);
    },
    onRemoteHitAck: (msg) => {
        if (typeof onRemoteHitAck === "function") onRemoteHitAck(msg);
    },
    onRemoteArenaRespawn: (msg) => {
        if (typeof onRemoteArenaRespawn === "function") onRemoteArenaRespawn(msg);
    },
    onRemoteForfeit: (msg) => {
        if (typeof onRemoteForfeit === "function") onRemoteForfeit(msg);
    },
    onRemoteEliminated: (msg) => {
        if (typeof onRemoteEliminated === "function") onRemoteEliminated(msg);
    },
    onRemoteDust: (msg) => {
        if (typeof onRemoteDust === "function") onRemoteDust(msg);
    },
    onRemoteGlass: (msg) => {
        if (typeof onRemoteGlass === "function") onRemoteGlass(msg);
    },
    getGameActive: () => gameActive,
});

configureMpTaunts({
    getPlayer: () => player,
    getRemotePlayers,
    getLocalPeerId,
    getGameActive: () => gameActive,
    getIsDying: () => isDying,
    getActiveEffects: () => activeEffects,
    getGameSettings: () => GAME_SETTINGS,
    getRunMode: () =>
        window.NebulaGameMode && typeof window.NebulaGameMode.getRunMode === "function"
            ? window.NebulaGameMode.getRunMode()
            : "single",
    isOutOfArena: () =>
        typeof isMirrorPlayerOutOfArena === "function" && isMirrorPlayerOutOfArena(),
    playReceiveSound: () => {
        try {
            if (NebulaAudio.isSoundEnabled() && typeof initAudio === "function") initAudio();
            if (typeof playChatReceiveSound === "function") playChatReceiveSound();
        } catch (e) {}
    },
});

configureMirrorMatch({
    getGameSettings: () => GAME_SETTINGS,
    getPlayer: () => player,
    getRemotePlayer,
    getRemotePlayers,
    getLocalPeerId,
    getGameActive: () => gameActive,
    setGameActive: (v) => {
        gameActive = v;
    },
    getIsDying: () => isDying,
    setIsDying: (v) => {
        isDying = v;
    },
    getSelectedAbility: () => selectedAbility,
    setSelectedAbility: (v) => {
        selectedAbility = v;
    },
    getActiveRunSkinName: () => activeRunSkinName,
    setActiveRunSkinName: (v) => {
        activeRunSkinName = v;
    },
    getRoundStartTime: () => roundStartTime,
    getPoolNutrients: () => poolNutrients,
    getFromPool,
    setCameraPosition: (x, y) => {
        cameraX = x;
        cameraY = y;
    },
    setCameraLookAhead: (x, y) => {
        cameraLookAheadX = x;
        cameraLookAheadY = y;
    },
    resetScreenShake,
    setScoreHudText: (text) => {
        if (scoreElement) scoreElement.innerText = text;
    },
    setInterpolatedZoom: (z) => {
        simDrawCam.interpolatedZoom = z;
    },
    getScreenW: () => screenW,
    getScreenH: () => screenH,
    dom: {
        uiContainer,
        startMenu,
        multiplayerLobbyScreen,
    },
    resetRunState,
    initJellyBubbles,
    ensureDrawLoop,
    hideMenuOverlay,
    showMenuOverlay,
    hideGameOverOverlay,
    dismissEvolutionLabForGameStart,
    applySkinCursor,
    clearWasdKeysState,
    initAudio,
    setAmbientLevel,
    getAmbientArenaGain: () => NebulaAudio.getAmbientArenaGain(),
    getSignalCooldownMultiplier,
    getMultiplayerLobbyState,
    resumeMultiplayerLobby,
    resetMultiplayerLobby,
    returnFromMultiplayerLobbyToEntitySelect,
    showMirrorMatchOverlay,
    retitleMirrorMatchOverlay,
    addScreenShake,
    playDeathSound,
    updateBlackHoleAudio,
    pulseDamageShake,
    invokePlayerDeath: () => playerDeath(),
    clearLocalAbilityEffects: () => {
        activeEffects.shriekPulse = 0;
        activeEffects.dashTime = 0;
        player.cooldown = 0;
        player.mirrorFreezeUntil = 0;
        if (typeof clearLocalMirrorCasts === "function") clearLocalMirrorCasts();
        bountySystem.multiplier = 1;
        bountySystem.timer = 0;
        bountySystem.comboCount = 0;
        bountySystem.lastKillTime = 0;
        sporeDashBurstSerial = 0;
        bhSiphonParticleCarry = 0;
        auraSpawnCarry = 0;
        if (typeof clearPhaseCage === "function") clearPhaseCage();
        poolBloodRifts.forEach((r) => {
            r.active = false;
            r.huntPrey = false;
            r.trackBot = null;
            r.isAfterglow = false;
            r.afterglowMaxLife = 0;
            if (typeof clearRiftSiphons === "function") clearRiftSiphons(r);
        });
        poolSporeGhosts.forEach((g) => {
            g.active = false;
            g.phase = "fade";
            g.targetBot = null;
            g.latchLife = 0;
            g.toxicTier = 0;
            g.splitDispatched = false;
        });
        poolBHSiphonParticles.forEach((p) => {
            p.active = false;
        });
        poolAuraParticles.forEach((p) => {
            p.active = false;
        });
    },
});

window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

configureMirrorAbilities({
    getPlayer: () => player,
    getActiveEffects: () => activeEffects,
    getAbilitySettings: () => ABILITY_SETTINGS,
    getGameSettings: () => GAME_SETTINGS,
    getRemotePlayers,
    getLocalPeerId,
    getGameActive: () => gameActive,
    getIsDying: () => isDying,
});

function mirrorBaseCombat() {
    return !!(
        window.NebulaGameMode &&
        typeof window.NebulaGameMode.getRunMode === "function" &&
        window.NebulaGameMode.getRunMode() === "mirror"
    );
}

// --- ABILITĂȚI JUCĂTOR: cast-ul stă aici, tick-ul în js/sim-update.js (ABILITY_SIM) ---
const PLAYER_ABILITY_CAST = {
    vampire(signalMul) {
        if (!(player.radius > ABILITY_SETTINGS.VAMPIRE_MIN_RADIUS)) return;
        player.radius -= ABILITY_SETTINGS.VAMPIRE_COST_SIZE;
        player.cooldown = GAME_SETTINGS.CD_VAMPIRE * signalMul;
        const mirrorBase = mirrorBaseCombat();
        const huntActive = !mirrorBase && playerHasRavenousHuntMod();
        if (!mirrorBase && playerHasRavenousTwinAfterglowMod()) {
            const twinOff = Number(RAVENOUS_X3_CFG.twinOffsetPx) || 88;
            const half = twinOff * 0.5;
            const r1 = spawnBloodRiftAt(player.x - half, player.y, null);
            spawnBloodRiftAt(player.x + half, player.y, r1 ? r1.trackBot : null);
        } else {
            const rift = spawnBloodRiftAt(player.x, player.y, null);
            if (mirrorBase && rift) {
                rift.huntPrey = false;
                rift.trackBot = null;
                if (typeof clearRiftSiphons === "function") clearRiftSiphons(rift);
            }
        }
        if (typeof playBloodRiftCastSound === "function") {
            playBloodRiftCastSound(huntActive);
        }
        if (mirrorBase && typeof notifyMirrorAbilityCast === "function") {
            notifyMirrorAbilityCast("vampire", player.x, player.y);
        }
    },
    warp(signalMul) {
        activeEffects.shriekPulse = 1;
        const mirrorBase = mirrorBaseCombat();
        if (!mirrorBase && playerHasPhaseCageMod() && typeof spawnPhaseCageFromWarp === "function") {
            if (spawnPhaseCageFromWarp(player, poolBots, player.glow)) {
                const phaseCage =
                    typeof getLastSpawnedPhaseCage === "function"
                        ? getLastSpawnedPhaseCage()
                        : typeof getActivePhaseCage === "function"
                          ? getActivePhaseCage()
                          : null;
                if (phaseCage && phaseCage.trapped) {
                    for (let ti = 0; ti < phaseCage.trapped.length; ti++) {
                        const tb = phaseCage.trapped[ti];
                        if (tb && tb.active) {
                            tb.frozen = Math.max(tb.frozen || 0, ABILITY_SETTINGS.WARP_FREEZE_DURATION);
                        }
                    }
                }
            }
        }
        player.cooldown = GAME_SETTINGS.CD_WARP * signalMul;
        if (mirrorBase && typeof notifyMirrorAbilityCast === "function") {
            notifyMirrorAbilityCast("warp", player.x, player.y);
        }
    },
    speed(signalMul) {
        activeEffects.dashTime = ABILITY_SETTINGS.SPEED_DASH_DURATION;
        player.cooldown = GAME_SETTINGS.CD_SPEED * signalMul;
        const mirrorBase = mirrorBaseCombat();
        if (!mirrorBase && playerHasToxicSporeLatchMod()) sporeDashBurstSerial += 1;
        if (mirrorBase && typeof notifyMirrorAbilityCast === "function") {
            notifyMirrorAbilityCast("speed", player.x, player.y);
        }
    },
};

function playerAbilityKnown(id) {
    return typeof id === "string" && Object.prototype.hasOwnProperty.call(PLAYER_ABILITY_CAST, id);
}

function registerPlayerAbility(id, cast) {
    if (typeof id === "string" && id && typeof cast === "function") {
        PLAYER_ABILITY_CAST[id] = cast;
    }
}

function declanseazaAbilitatea() {
    if (!gameActive || isDying || player.cooldown > 0) return;

    if (typeof playAbilitySound === "function") playAbilitySound(selectedAbility);

    const signalMul = getSignalCooldownMultiplier();
    const cast = PLAYER_ABILITY_CAST[selectedAbility];
    if (cast) cast(signalMul);
}

window.playerAbilityKnown = playerAbilityKnown;
window.registerPlayerAbility = registerPlayerAbility;

// --- CONTROL DESKTOP (TASTATURA) ---
window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat) return;
    const target = e.target;
    const tag = target && target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (target && target.isContentEditable)) return;
    declanseazaAbilitatea();
});

// =============================================================================
// 🧠 PARTEA 4: LOGICA DE COMBAT, UPDATE FIZICĂ ȘI COLIZIUNI
// =============================================================================

function playerCanDevourBot(bot) {
    if (!bot || !bot.active || bot.isInvulnerable) return false;
    if (!(player.radius > bot.radius * GAME_SETTINGS.BOT_EAT_THRESHOLD)) return false;
    const dx = player.x - bot.x;
    const dy = player.y - bot.y;
    return dx * dx + dy * dy < (player.radius * GAME_SETTINGS.BOT_KILL_DIST_FACTOR) ** 2;
}

// --- KILL BOT & BOUNTY SYSTEM ---
function onBotKilled(bot) {
    if (!bot || !bot.active || bot._killCredited) return;
    bot._killCredited = true;
    roundBotKills++;
    addScreenShake(1.1, 0.07);
    playEatBotSound(bot.radius); const now = Date.now();
    bountySystem.comboCount = (now - bountySystem.lastKillTime > GAME_SETTINGS.COMBO_WINDOW) ? 1 : bountySystem.comboCount + 1;
    bountySystem.lastKillTime = now;

    let tier = null;
    for (const t of GAME_SETTINGS.BOUNTY_TIERS) {
        if (bountySystem.comboCount >= t.combo && (!tier || t.multiplier > tier.multiplier)) tier = t;
    }
    if (tier) {
        const newMultiplier = tier.multiplier;
        if (newMultiplier > bountySystem.multiplier) playBountySound(newMultiplier);
        bountySystem.multiplier = newMultiplier;
        bountySystem.timer = GAME_SETTINGS.BOUNTY_DURATION;
    }
    // Kill-uri 1–2 (sub primul tier) sau combo întrerupt: nu resetăm multiplier-ul aici;
    // bounty-ul activ expiră doar când timer-ul ajunge la 0 în update().
    const botScoreGain = Math.floor(GAME_SETTINGS.SCORE_BOT_KILL * bountySystem.multiplier);
    player.score += botScoreGain;
    if (scoreElement) scoreElement.innerText = Math.floor(player.score);
    pulseScoreOnBotKill();
    if (typeof spawnPickupFloat === "function") spawnPickupFloat(bot.x, bot.y, botScoreGain, "bot");
}

function pulseScoreOnBotKill() {
    if (!scoreElement) return;
    scoreElement.classList.remove("score-kill-pulse");
    void scoreElement.offsetWidth;
    scoreElement.classList.add("score-kill-pulse");
}

// Bounty HUD canvas helpers → js/ui-shell.js

configureSporeGhosts({
    getPoolSporeGhosts: () => poolSporeGhosts,
    getPoolBots: () => poolBots,
    getNutrientPool: () => poolNutrients,
    getPlayer: () => player,
    getActiveEffects: () => activeEffects,
    getSelectedAbility: () => selectedAbility,
    getSporeDashBurstSerial: () => sporeDashBurstSerial,
    getAbilitySettings: () => ABILITY_SETTINGS,
    onBotKilled: (bot) => onBotKilled(bot),
});

// --- Update loop → js/sim-update.js ---
configureSimUpdate({
    getIsDying: () => isDying,
    getGameActive: () => gameActive,
    getPlayer: () => player,
    getMouse: () => mouse,
    getControlScheme: () =>
        typeof getControlScheme === "function" ? getControlScheme() : "mouse",
    getWasdInput: () => (typeof getWasdInput === "function" ? getWasdInput() : { x: 0, y: 0 }),
    getWasdInputSmoothed: () =>
        typeof getWasdInputSmoothed === "function" ? getWasdInputSmoothed() : { x: 0, y: 0 },
    getScreenW: () => screenW,
    getScreenH: () => screenH,
    getSelectedAbility: () => selectedAbility,
    getActiveEffects: () => activeEffects,
    getBountySystem: () => bountySystem,
    getScoreElement: () => scoreElement,
    cam: simDrawCam,
    settings: { GAME_SETTINGS, ABILITY_SETTINGS, ENEMY_BOT_SETTINGS },
    pools: {
        poolNutrients,
        poolBloodRifts,
        poolBots,
        poolBHSiphonParticles,
        poolJellyBubbles,
        poolSporeGhosts,
        poolParticles,
    },
    getBhSiphonParticleCarry: () => bhSiphonParticleCarry,
    setBhSiphonParticleCarry: (v) => { bhSiphonParticleCarry = v; },
    getSporeDashBurstSerial: () => sporeDashBurstSerial,
    afterSimUpdate: (dt) => {
        if (typeof pushMirrorStateFromSim === "function") pushMirrorStateFromSim();
        if (typeof tickMirrorVictimContact === "function") tickMirrorVictimContact(dt);
        if (typeof tickMirrorPlayerContact === "function") tickMirrorPlayerContact(dt);
        if (typeof tickMirrorVictoryPoll === "function") tickMirrorVictoryPoll();
        if (typeof flushMirrorDustEats === "function") flushMirrorDustEats();
        if (typeof flushMirrorGlassEats === "function") flushMirrorGlassEats();
    },
});

// === Draw loop → js/sim-draw.js ===
configureSimDraw({
    getCtx: () => ctx,
    getScreenW: () => screenW,
    getScreenH: () => screenH,
    dom: {
        introScreen,
        startMenu,
        optionsScreen,
        aboutScreen,
        multiplayerLobbyScreen,
        uiContainer,
    },
    getGameActive: () => gameActive,
    getIsDying: () => isDying,
    getMouse: () => mouse,
    getControlScheme: () =>
        typeof getControlScheme === "function" ? getControlScheme() : "mouse",
    getWasdInput: () => (typeof getWasdInput === "function" ? getWasdInput() : { x: 0, y: 0 }),
    getWasdInputSmoothed: () =>
        typeof getWasdInputSmoothed === "function" ? getWasdInputSmoothed() : { x: 0, y: 0 },
    tickWasdInputSmoothing: (dt) => {
        if (typeof tickWasdInputSmoothing === "function") tickWasdInputSmoothing(dt);
    },
    getPlayer: () => player,
    getActiveEffects: () => activeEffects,
    getBountySystem: () => bountySystem,
    getSelectedAbility: () => selectedAbility,
    cam: simDrawCam,
    settings: { GAME_SETTINGS, ABILITY_SETTINGS, ENTITY_TYPES },
    pools: {
        poolJellyBubbles,
        poolBHSiphonParticles,
        poolBloodRifts,
        poolParticles,
        poolNutrients,
        poolBots,
        poolAuraParticles,
    },
    nutrientHsl: _NUTRIENT_HSL,
    ravenousX3Cfg: RAVENOUS_X3_CFG,
    update,
    updateScreenShake,
    getScreenShakeOffset,
    drawCosmicDust,
    drawBloodRiftSiphons,
    playerHasRavenousSiphonMod,
    drawSporeGhostsWorld,
    getFromPool,
    getSignalCooldownMultiplier,
    getEntityScoreHudFontStyle,
    getBountyTierAccentColor,
    hudColorsFromAccent,
    getRunMode: () =>
        window.NebulaGameMode && typeof window.NebulaGameMode.getRunMode === "function"
            ? window.NebulaGameMode.getRunMode()
            : "single",
    getRemotePlayer,
    getRemotePlayers,
});

configureHubFlow({
    dom: {
        introScreen,
        menuTitle,
        hubPlayBtn,
        hubMultiplayerBtn,
        hubOptionsBtn,
        hubAboutBtn,
        hubActions,
        optionsScreen,
        aboutScreen,
        multiplayerLobbyScreen,
        optionsBackBtn,
        aboutBackBtn,
        menuFullscreenBtn,
        menuSoundBtn,
        startMenu,
        entitySelectBackBtn,
    },
    getPlayer: () => player,
    getGameActive: () => gameActive,
    ensureDrawLoop,
    clearWasdKeysState,
    initAudio,
    playHoverSound,
    initControlSettings,
    initHubTitleColorSwatches,
    readHubTitleColor,
    setHubTitleColor,
    triggerTitleGlitch,
    isHubVisible,
    renderSelectedSkin,
    dismissEvolutionLabForGameStart,
    applySkinCursor,
    setSelectedAbility: (v) => {
        selectedAbility = v;
    },
    setActiveRunSkinName: (v) => {
        activeRunSkinName = v;
    },
    syncControlSchemePickerUi,
    isLabModeActive,
    getSoundEnabled: () => NebulaAudio.isSoundEnabled(),
    setSoundEnabled: (next) => NebulaAudio.setSoundEnabled(next),
});

if (typeof wireMenuSystemButtons === "function") wireMenuSystemButtons();

window.triggerPlayerAbility = declanseazaAbilitatea;

window.addEventListener("mousemove", function initAudioOnMove() {
    if (NebulaAudio.isSoundEnabled()) initAudio();
    window.removeEventListener("mousemove", initAudioOnMove);
});
window.addEventListener("pointerdown", function initAudioOnPointer() {
    if (NebulaAudio.isSoundEnabled()) initAudio();
    window.removeEventListener("pointerdown", initAudioOnPointer);
}, { passive: true });

initMainHub();
initMenuState();

// Pornește loop-ul de joc
ensureDrawLoop();