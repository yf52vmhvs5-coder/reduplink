/**
 * NEBULA VOID — UI shell: DOM refs, hub title color, bounty HUD helpers, game over overlay.
 * Load after config-loader.js. entity-select-ui.js remains the heavy entity picker screen.
 */
(function (global) {
    "use strict";

    // -------------------------------------------------------------------------
    // Static DOM references
    // -------------------------------------------------------------------------

    const byId = (id) => document.getElementById(id);

    const canvas = byId("gameCanvas");
    if (!canvas || typeof canvas.getContext !== "function") {
        throw new Error("NEBULA VOID: #gameCanvas missing from index.html");
    }

    global.NebulaDom = Object.freeze({
        canvas,
        ctx: canvas.getContext("2d"),

        uiContainer: byId("ui"),
        scoreElement: byId("score"),

        introScreen: byId("introScreen"),
        menuTitle: byId("introTitle"),
        hubPlayBtn: byId("hubPlayBtn"),
        hubMultiplayerBtn: byId("hubMultiplayerBtn"),
        hubOptionsBtn: byId("hubOptionsBtn"),
        hubAboutBtn: byId("hubAboutBtn"),
        hubActions: byId("hubActions"),
        optionsScreen: byId("optionsScreen"),
        aboutScreen: byId("aboutScreen"),
        multiplayerLobbyScreen: byId("multiplayerLobbyScreen"),
        multiplayerLobbyBackBtn: byId("multiplayerLobbyBackBtn"),
        mpLobbyCancelHubBtn: byId("mpLobbyCancelHubBtn"),
        mpLobbyEntityLabel: byId("mpLobbyEntityLabel"),
        mpLobbyPlayerCount: byId("mpLobbyPlayerCount"),
        mpLobbyPanelIdle: byId("mpLobbyPanelIdle"),
        mpLobbyPanelWaiting: byId("mpLobbyPanelWaiting"),
        mpCreateRoomBtn: byId("mpCreateRoomBtn"),
        mpRoomLockBtn: byId("mpRoomLockBtn"),
        mpPublicRooms: byId("mpPublicRooms"),
        mpPublicRoomList: byId("mpPublicRoomList"),
        mpFindSignalBtn: byId("mpFindSignalBtn"),
        mpJoinRoomBtn: byId("mpJoinRoomBtn"),
        mpLobbyJoinStack: byId("mpLobbyJoinStack"),
        mpRoomCodeInput: byId("mpRoomCodeInput"),
        mpLobbyError: byId("mpLobbyError"),
        mpRoomCodeDisplay: byId("mpRoomCodeDisplay"),
        mpLobbyStatusText: byId("mpLobbyStatusText"),
        mpStartMatchBtn: byId("mpStartMatchBtn"),
        mpLobbyChatToggleBtn: byId("mpLobbyChatToggleBtn"),
        mpLobbyChatCompose: byId("mpLobbyChatCompose"),
        mpLobbyChatColPeer: byId("mpLobbyChatColPeer"),
        mpLobbyChatColSelf: byId("mpLobbyChatColSelf"),
        mpChatLogPeer: byId("mpChatLogPeer"),
        mpChatLogSelf: byId("mpChatLogSelf"),
        mpChatInput: byId("mpChatInput"),
        mpChatSendBtn: byId("mpChatSendBtn"),
        optionsBackBtn: byId("optionsBackBtn"),
        aboutBackBtn: byId("aboutBackBtn"),
        menuFullscreenBtn: byId("fullscreenBtn"),
        menuSoundBtn: byId("soundBtn"),
        startMenu: byId("startMenu"),
        abilityDesc: byId("abilityDesc"),
        evolutionLabBtn: byId("evolutionLabBtn"),
        skinSelector: byId("skinSelector"),
        entitySelectBackBtn: byId("entitySelectBackBtn"),
        skinPriceBadge: byId("skinPriceBadge"),
        matterDisplay: byId("matterDisplay"),
        skinActionBtn: byId("skinActionBtn"),

        gameOverOverlay: byId("gameOver"),
        runMatterEarnedElement: byId("finalScore"),
        totalVoidMatterElement: byId("bestScore"),
        timeIntrudedElement: byId("timeIntruded"),
        retryBtn: byId("retryBtn"),
        backToMenuBtn: byId("backToMenuBtn"),
    });

    // -------------------------------------------------------------------------
    // Hub title color (localStorage + swatches)
    // -------------------------------------------------------------------------

    const HUB_TITLE_COLOR_STORAGE_KEY = "nebulaVoidHubTitleColor";
    const STUDIO_TINT_KEY = "spacejunkStudioTint";
    const HUB_SPECTRUM_OPENED_KEY = "nebulaVoidSpectrumOpened";
    const HUB_ALIEN_BECKON_KEY = "nebulaVoidAlienTintHintSeen";
    const HUB_TITLE_COLOR_DEFAULT = "#ff2d2d";
    /** Culorile deja folosite de entități, lab și bounty — nu un curcubeu generic. */
    const HUB_TITLE_SWATCHES = [
        { color: "#ff2d2d", label: "Blood rift" },
        { color: "#ff2ed1", label: "Void signal" },
        { color: "#c86bff", label: "Phase glow" },
        { color: "#8a2be2", label: "Shifter" },
        { color: "#00e5ff", label: "Velocity" },
        { color: "#3da5ff", label: "Phase cage" },
        { color: "#39ff14", label: "Spore" },
        { color: "#ffdd22", label: "Bounty" },
    ];
    const HUB_TITLE_COLOR_LEGACY = {
        "#f87171": "#ff2d2d",
        "#fb923c": "#ffdd22",
        "#facc15": "#ffdd22",
        "#4ade80": "#39ff14",
        "#2dd4bf": "#00e5ff",
        "#38bdf8": "#3da5ff",
        "#818cf8": "#8a2be2",
        "#c084fc": "#c86bff",
    };

    function getMenuTitle() {
        return global.NebulaDom && global.NebulaDom.menuTitle;
    }

    function getIntroScreen() {
        return global.NebulaDom && global.NebulaDom.introScreen;
    }

    function normalizeHubTitleColor(value) {
        if (typeof value !== "string") return HUB_TITLE_COLOR_DEFAULT;
        const v = value.trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(v)) return HUB_TITLE_COLOR_DEFAULT;
        return HUB_TITLE_COLOR_LEGACY[v] || v;
    }

    function readStudioTint() {
        try {
            const raw = localStorage.getItem(STUDIO_TINT_KEY);
            if (typeof raw !== "string") return "";
            const v = raw.trim().toLowerCase();
            if (!/^#[0-9a-f]{6}$/.test(v)) return "";
            return HUB_TITLE_COLOR_LEGACY[v] || v;
        } catch (e) {
            return "";
        }
    }

    function readHubTitleColor() {
        const studio = readStudioTint();
        if (studio) return studio;
        try {
            const raw = localStorage.getItem(HUB_TITLE_COLOR_STORAGE_KEY);
            const next = normalizeHubTitleColor(raw);
            if (raw && raw.trim().toLowerCase() !== next) writeHubTitleColor(next);
            return next;
        } catch (e) {
            return HUB_TITLE_COLOR_DEFAULT;
        }
    }

    function writeHubTitleColor(color) {
        const next = normalizeHubTitleColor(color);
        try {
            localStorage.setItem(HUB_TITLE_COLOR_STORAGE_KEY, next);
            localStorage.setItem(STUDIO_TINT_KEY, next);
        } catch (e) {
            /* storage indisponibil */
        }
    }

    function applyHubTitleColor(color) {
        const c = normalizeHubTitleColor(color);
        const menuTitle = getMenuTitle();
        if (!menuTitle) return c;
        menuTitle.style.color = c;
        menuTitle.style.textShadow = `0 0 20px color-mix(in srgb, ${c} 55%, transparent), 0 0 42px color-mix(in srgb, ${c} 22%, transparent)`;
        const introScreen = getIntroScreen();
        if (introScreen) introScreen.style.setProperty("--hub-signal-tint", c);
        const hubPlayBtn = document.getElementById("hubPlayBtn");
        if (hubPlayBtn) {
            hubPlayBtn.style.removeProperty("border-color");
            hubPlayBtn.style.removeProperty("box-shadow");
        }
        const row = document.getElementById("hubColorSwatches");
        if (row) {
            row.querySelectorAll(".hub-color-swatch").forEach((btn) => {
                const match = (btn.dataset.color || "").toLowerCase() === c;
                btn.classList.toggle("is-active", match);
                btn.setAttribute("aria-pressed", match ? "true" : "false");
            });
        }
        const aboutScreen = document.getElementById("aboutScreen");
        if (aboutScreen) {
            aboutScreen.style.setProperty("--about-accent", c);
        }
        const optionsScreen = document.getElementById("optionsScreen");
        if (optionsScreen) {
            optionsScreen.style.setProperty("--opt-accent", c);
            ["soundBtn", "fullscreenBtn"].forEach((id) => {
                const btn = document.getElementById(id);
                if (!btn) return;
                btn.style.removeProperty("border-color");
                btn.style.removeProperty("box-shadow");
            });
        }
        const previewBtn = document.getElementById("hubColorPreviewBtn");
        if (previewBtn) previewBtn.style.setProperty("--swatch-color", c);
        return c;
    }

    function setHubTitleColor(color, persist) {
        const c = applyHubTitleColor(color);
        if (persist) writeHubTitleColor(c);
        return c;
    }

    let hubSpectrumOpen = false;
    let hubSpectrumUiReady = false;
    let hubSpectrumBeckonTimer = null;

    function readHubSpectrumEverOpened() {
        try {
            return localStorage.getItem(HUB_SPECTRUM_OPENED_KEY) === "1";
        } catch (e) {
            return false;
        }
    }

    function markHubSpectrumEverOpened() {
        try {
            localStorage.setItem(HUB_SPECTRUM_OPENED_KEY, "1");
        } catch (e) {
            /* storage indisponibil */
        }
        const colorRow = document.getElementById("hubColorRow");
        if (colorRow) colorRow.classList.remove("hub-color-row--show-calibrate-hint");
    }

    function syncHubSpectrumAria() {
        const spectrum = document.getElementById("hubColorSpectrum");
        const alienBtn = document.getElementById("hubAlienTintBtn");
        const previewBtn = document.getElementById("hubColorPreviewBtn");
        const expanded = hubSpectrumOpen ? "true" : "false";
        const hidden = hubSpectrumOpen ? "false" : "true";
        if (spectrum) spectrum.setAttribute("aria-hidden", hidden);
        if (alienBtn) alienBtn.setAttribute("aria-expanded", expanded);
        if (previewBtn) previewBtn.setAttribute("aria-expanded", expanded);
    }

    function setHubSpectrumOpen(open) {
        const colorRow = document.getElementById("hubColorRow");
        if (!colorRow) return;
        hubSpectrumOpen = !!open;
        colorRow.classList.toggle("hub-color-row--spectrum-open", hubSpectrumOpen);
        colorRow.classList.toggle("hub-color-row--spectrum-collapsed", !hubSpectrumOpen);
        syncHubSpectrumAria();
        if (hubSpectrumOpen) markHubSpectrumEverOpened();
    }

    function toggleHubSpectrum() {
        setHubSpectrumOpen(!hubSpectrumOpen);
    }

    function closeHubSpectrum() {
        if (hubSpectrumOpen) setHubSpectrumOpen(false);
    }

    function onHubSpectrumToggleClick(e) {
        if (e) e.stopPropagation();
        try {
            if (typeof global.playHoverSound === "function") global.playHoverSound();
        } catch (err) {}
        toggleHubSpectrum();
    }

    function initHubSpectrumUi() {
        if (hubSpectrumUiReady) return;
        const colorRow = document.getElementById("hubColorRow");
        const alienBtn = document.getElementById("hubAlienTintBtn");
        const previewBtn = document.getElementById("hubColorPreviewBtn");
        if (!colorRow || !alienBtn || !previewBtn) return;
        hubSpectrumUiReady = true;

        if (!readHubSpectrumEverOpened()) {
            colorRow.classList.add("hub-color-row--show-calibrate-hint");
        }
        setHubSpectrumOpen(false);

        alienBtn.addEventListener("click", onHubSpectrumToggleClick);
        previewBtn.addEventListener("click", onHubSpectrumToggleClick);

        document.addEventListener("click", (e) => {
            if (!hubSpectrumOpen) return;
            if (colorRow.contains(e.target)) return;
            closeHubSpectrum();
        });

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape" || !hubSpectrumOpen) return;
            if (!isHubVisible()) return;
            closeHubSpectrum();
            e.preventDefault();
        });
    }

    function scheduleHubSpectrumBeckon() {
        if (hubSpectrumBeckonTimer != null) return;
        try {
            if (localStorage.getItem(HUB_ALIEN_BECKON_KEY) === "1") return;
        } catch (e) {
            return;
        }
        hubSpectrumBeckonTimer = global.setTimeout(() => {
            hubSpectrumBeckonTimer = null;
            const introScreen = getIntroScreen();
            const alienBtn = document.getElementById("hubAlienTintBtn");
            if (!introScreen || !introScreen.classList.contains("hub-actions-ready") || !alienBtn) return;
            try {
                if (localStorage.getItem(HUB_ALIEN_BECKON_KEY) === "1") return;
                localStorage.setItem(HUB_ALIEN_BECKON_KEY, "1");
            } catch (e) {
                return;
            }
            alienBtn.classList.add("hub-brand-alien-btn--beckon");
            global.setTimeout(() => {
                alienBtn.classList.remove("hub-brand-alien-btn--beckon");
            }, 2800);
        }, 2200);
    }

    function initHubTitleColorSwatches() {
        const row = document.getElementById("hubColorSwatches");
        if (!row || row.dataset.built === "1") return;
        row.dataset.built = "1";
        const saved = readHubTitleColor();
        HUB_TITLE_SWATCHES.forEach((entry) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "hub-color-swatch";
            btn.dataset.color = entry.color;
            btn.style.setProperty("--swatch-color", entry.color);
            btn.title = entry.label;
            btn.setAttribute("aria-label", entry.label);
            btn.setAttribute("aria-pressed", "false");
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                try {
                    if (typeof global.playHoverSound === "function") global.playHoverSound();
                } catch (err) {}
                setHubTitleColor(entry.color, true);
                global.requestAnimationFrame(() => {
                    global.requestAnimationFrame(() => closeHubSpectrum());
                });
            });
            row.appendChild(btn);
        });
        setHubTitleColor(saved, false);
        initHubSpectrumUi();
    }

    function isHubVisible() {
        const introScreen = getIntroScreen();
        return !!(introScreen && introScreen.style.display !== "none");
    }

    global.readHubTitleColor = readHubTitleColor;
    global.setHubTitleColor = setHubTitleColor;
    global.initHubTitleColorSwatches = initHubTitleColorSwatches;
    global.closeHubSpectrum = closeHubSpectrum;
    global.scheduleHubSpectrumBeckon = scheduleHubSpectrumBeckon;
    global.isHubVisible = isHubVisible;

    // -------------------------------------------------------------------------
    // Canvas bounty HUD helpers
    // -------------------------------------------------------------------------

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/ui-shell.js");
    }

    const GAME_SETTINGS = boot.gameSettings;

    const HUD_TEXT_MIX = 0.82;
    const HUD_GLOW_ALPHA = 0.42;
    const HUD_BASE_RGB = { r: 37, g: 37, b: 37 };

    function parseHexRgb(hex) {
        if (!hex || typeof hex !== "string") return null;
        let h = hex.trim();
        if (h.startsWith("#")) h = h.slice(1);
        if (h.length === 3) h = h.split("").map((c) => c + c).join("");
        if (h.length !== 6) return null;
        const n = parseInt(h, 16);
        if (!Number.isFinite(n)) return null;
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function hudColorsFromAccent(accentHex) {
        const a = parseHexRgb(accentHex) || { r: 204, g: 204, b: 204 };
        const u = 1 - HUD_TEXT_MIX;
        const r = Math.round(a.r * HUD_TEXT_MIX + HUD_BASE_RGB.r * u);
        const g = Math.round(a.g * HUD_TEXT_MIX + HUD_BASE_RGB.g * u);
        const b = Math.round(a.b * HUD_TEXT_MIX + HUD_BASE_RGB.b * u);
        return {
            fill: `rgb(${r}, ${g}, ${b})`,
            glow: `rgba(${a.r}, ${a.g}, ${a.b}, ${HUD_GLOW_ALPHA})`,
        };
    }

    function getBountyTierAccentColor(multiplier) {
        for (const tier of GAME_SETTINGS.BOUNTY_TIERS) {
            if (tier.multiplier === multiplier && tier.color) return tier.color;
        }
        if (multiplier >= 4) return "#39ff14";
        if (multiplier === 3) return "#ff2bd6";
        return "#ffe600";
    }

    function getEntityScoreHudFontStyle() {
        const uiBasePx = Math.min(16, Math.max(12, (global.innerWidth || 800) * 0.018));
        const uiContainer = global.NebulaDom && global.NebulaDom.uiContainer;
        const refEl = uiContainer && uiContainer.querySelector(".label");
        if (!refEl) {
            return {
                fontSize: uiBasePx,
                fontWeight: "bold",
                fontFamily: '"Courier New", Courier, monospace',
                letterSpacing: "2px",
            };
        }
        const cs = getComputedStyle(refEl);
        const fontSize = parseFloat(cs.fontSize);
        const letterSpacing = cs.letterSpacing;
        return {
            fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : uiBasePx,
            fontWeight: cs.fontWeight || "bold",
            fontFamily: cs.fontFamily || '"Courier New", Courier, monospace',
            letterSpacing: letterSpacing && letterSpacing !== "normal" ? letterSpacing : "2px",
        };
    }

    global.parseHexRgb = parseHexRgb;
    global.hudColorsFromAccent = hudColorsFromAccent;
    global.getBountyTierAccentColor = getBountyTierAccentColor;
    global.getEntityScoreHudFontStyle = getEntityScoreHudFontStyle;

    // -------------------------------------------------------------------------
    // Game over overlay
    // -------------------------------------------------------------------------

    /** @type {null | Record<string, unknown>} */
    let gameOverDeps = null;
    let scoreCountAnimFrame = null;

    function configureGameOverUi(nextDeps) {
        if (!nextDeps || !nextDeps.dom) {
            throw new Error("configureGameOverUi requires dom refs and getters");
        }
        gameOverDeps = nextDeps;
    }

    function formatVoidMatterDisplay(amount) {
        return Math.max(0, Math.floor(amount)).toLocaleString();
    }

    function runMatterEarnedCountUp(fromValue, targetValue) {
        const runMatterEarnedElement = gameOverDeps.dom.runMatterEarnedElement;
        if (!runMatterEarnedElement) return;
        if (scoreCountAnimFrame) cancelAnimationFrame(scoreCountAnimFrame);
        const startTime = performance.now();
        const duration = 650;
        const from = Math.max(0, Math.floor(fromValue));
        const to = Math.max(0, Math.floor(targetValue));
        const delta = to - from;

        function tick(now) {
            const t = Math.min(1, (now - startTime) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            runMatterEarnedElement.innerText = formatVoidMatterDisplay(from + delta * eased);
            if (t < 1) scoreCountAnimFrame = requestAnimationFrame(tick);
            else scoreCountAnimFrame = null;
        }
        scoreCountAnimFrame = requestAnimationFrame(tick);
    }

    const GAME_OVER_TEMPLATE = {
        title: "VOID CONSUMED YOU",
        earnedLabel: "VOID MATTER EARNED",
        totalLabel: "TOTAL VOID MATTER",
        timeLabel: "TIME INTRUDED",
        retry: "RETRY",
        change: "CHANGE ENTITY",
    };

    function applyGameOverCopy(copy) {
        const root = gameOverDeps && gameOverDeps.dom && gameOverDeps.dom.gameOverOverlay;
        if (!root || !copy) return;
        const title = root.querySelector("h2");
        if (title) title.textContent = copy.title;
        const labels = root.querySelectorAll(".go-stat-label");
        if (labels[0]) labels[0].textContent = copy.earnedLabel;
        if (labels[1]) labels[1].textContent = copy.totalLabel;
        if (labels[2]) labels[2].textContent = copy.timeLabel;
        if (gameOverDeps.dom.retryBtn) gameOverDeps.dom.retryBtn.textContent = copy.retry;
        if (gameOverDeps.dom.backToMenuBtn) gameOverDeps.dom.backToMenuBtn.textContent = copy.change;
    }

    function restoreGameOverTemplate() {
        const root = gameOverDeps && gameOverDeps.dom && gameOverDeps.dom.gameOverOverlay;
        if (root) root.classList.remove("mp-result");
        applyGameOverCopy(GAME_OVER_TEMPLATE);
    }

    function hideGameOverOverlay() {
        const gameOverOverlay = gameOverDeps.dom.gameOverOverlay;
        if (!gameOverOverlay) return;
        gameOverOverlay.classList.remove("visible");
        gameOverOverlay.style.display = "none";
        restoreGameOverTemplate();
    }

    function formatIntrudedTime(seconds) {
        const safeSeconds = Math.max(0, Math.floor(seconds));
        const mins = String(Math.floor(safeSeconds / 60)).padStart(2, "0");
        const secs = String(safeSeconds % 60).padStart(2, "0");
        return `${mins}:${secs}`;
    }

    function showGameOverOverlay(matterFromRun, survivedSeconds) {
        const gameOverOverlay = gameOverDeps.dom.gameOverOverlay;
        if (!gameOverOverlay) return;
        restoreGameOverTemplate();
        const earned = Math.max(0, Math.floor(matterFromRun));
        const previousSession = gameOverDeps.getSessionMatterEarned();
        gameOverDeps.setSessionMatterEarned(previousSession + earned);

        if (earned > 0) gameOverDeps.addTotalVoidMatter(earned);

        const totalVoidMatterElement = gameOverDeps.dom.totalVoidMatterElement;
        if (totalVoidMatterElement) {
            totalVoidMatterElement.innerText = formatVoidMatterDisplay(gameOverDeps.getTotalVoidMatter());
        }
        const timeIntrudedElement = gameOverDeps.dom.timeIntrudedElement;
        if (timeIntrudedElement) {
            timeIntrudedElement.innerText = formatIntrudedTime(survivedSeconds || 0);
        }
        runMatterEarnedCountUp(previousSession, gameOverDeps.getSessionMatterEarned());

        const player = gameOverDeps.getPlayer();
        const deathAccent = (player && (player.glow || player.color)) || "#b482ff";
        gameOverOverlay.style.setProperty("--go-accent", deathAccent);

        gameOverOverlay.style.display = "flex";
        requestAnimationFrame(() => gameOverOverlay.classList.add("visible"));
    }

    function showMirrorMatchOverlay(opts) {
        const gameOverOverlay = gameOverDeps.dom.gameOverOverlay;
        if (!gameOverOverlay) return;
        const view = opts || {};
        applyGameOverCopy({
            title: view.title || "OPPONENT DISCONNECTED",
            earnedLabel: "ENTITY_SCORE",
            totalLabel: view.totalStatLabel || "OPPONENT",
            timeLabel: "TIME INTRUDED",
            retry: view.retry || "RETRY",
            change: view.change || "CHANGE ENTITY",
        });
        gameOverOverlay.classList.add("mp-result");
        const scoreEl = gameOverDeps.dom.runMatterEarnedElement;
        if (scoreEl) scoreEl.innerText = formatVoidMatterDisplay(view.score || 0);
        const opponentEl = gameOverDeps.dom.totalVoidMatterElement;
        if (opponentEl) opponentEl.innerText = view.opponent || "OPPONENT";
        const timeEl = gameOverDeps.dom.timeIntrudedElement;
        if (timeEl) timeEl.innerText = formatIntrudedTime(view.seconds || 0);
        gameOverOverlay.style.setProperty("--go-accent", view.accent || "#b482ff");
        gameOverOverlay.style.display = "flex";
        requestAnimationFrame(() => gameOverOverlay.classList.add("visible"));
    }

    function retitleMirrorMatchOverlay(title) {
        const root = gameOverDeps && gameOverDeps.dom && gameOverDeps.dom.gameOverOverlay;
        if (!root) return;
        const heading = root.querySelector("h2");
        if (heading) heading.textContent = title;
    }

    function resetSessionMatterEarned() {
        gameOverDeps.setSessionMatterEarned(0);
        const runMatterEarnedElement = gameOverDeps.dom.runMatterEarnedElement;
        if (runMatterEarnedElement) runMatterEarnedElement.innerText = "0";
    }

    global.configureGameOverUi = configureGameOverUi;
    global.formatVoidMatterDisplay = formatVoidMatterDisplay;
    global.hideGameOverOverlay = hideGameOverOverlay;
    global.showGameOverOverlay = showGameOverOverlay;
    global.showMirrorMatchOverlay = showMirrorMatchOverlay;
    global.retitleMirrorMatchOverlay = retitleMirrorMatchOverlay;
    global.resetGameOverSessionMatter = resetSessionMatterEarned;
})(typeof window !== "undefined" ? window : globalThis);
