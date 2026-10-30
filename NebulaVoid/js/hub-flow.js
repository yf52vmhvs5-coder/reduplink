/**
 * NEBULA VOID — main hub, menu overlays, entity select / lobby navigation.
 * configureHubFlow() from entities.js after NebulaDom refs exist.
 */
(function (global) {
    "use strict";

    /** @type {null | Record<string, unknown>} */
    let deps = null;

    let hubSkippedForSession = false;
    let entitySelectActive = false;
    let hubActionsRevealed = false;

    function configureHubFlow(nextDeps) {
        if (!nextDeps || !nextDeps.dom) {
            throw new Error("configureHubFlow requires dom refs and navigation callbacks");
        }
        deps = nextDeps;
    }

    function setMenuToggleLabel(button, label, isOn) {
        if (!button) return;
        button.innerHTML = `${label}: <span class="${isOn ? "state-on" : "state-off"}">${isOn ? "ON" : "OFF"}</span>`;
    }

    function getEntitySelectActive() {
        return entitySelectActive;
    }

    function getHubSkippedForSession() {
        return hubSkippedForSession;
    }

    function setHubSkippedForSession(value) {
        hubSkippedForSession = !!value;
    }

    function setEntitySelectActive(value) {
        entitySelectActive = !!value;
    }

    function hideMenuOverlay(overlay) {
        if (!overlay) return;
        overlay.classList.remove("menu-overlay-visible");
        overlay.hidden = true;
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
    }

    function showMenuOverlay(overlay) {
        if (!overlay) return;
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add("menu-overlay-visible"));
    }

    function showMainHub() {
        const d = deps.dom;
        if (!d.introScreen) return;
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        hideMenuOverlay(d.optionsScreen);
        hideMenuOverlay(d.aboutScreen);
        hideMenuOverlay(d.multiplayerLobbyScreen);
        if (typeof global.stopMpNetworkTick === "function") global.stopMpNetworkTick();
        if (typeof global.resetMultiplayerLobby === "function") global.resetMultiplayerLobby();
        if (global.NebulaGameMode && typeof global.NebulaGameMode.resetEntitySelectIntent === "function") {
            global.NebulaGameMode.resetEntitySelectIntent();
        }
        if (global.NebulaGameMode && typeof global.NebulaGameMode.resetRunMode === "function") {
            global.NebulaGameMode.resetRunMode();
        }
        if (d.startMenu) {
            d.startMenu.style.display = "none";
            d.startMenu.classList.remove("ready");
        }
        entitySelectActive = false;
        hubActionsRevealed = true;
        d.introScreen.style.display = "";
        d.introScreen.classList.add("intro-ready", "hub-title-settled", "hub-actions-ready");
        d.introScreen.classList.remove("hub-leaving");
        if (d.hubActions) d.hubActions.setAttribute("aria-hidden", "false");
        const hubColorRow = document.getElementById("hubColorRow");
        if (hubColorRow) hubColorRow.setAttribute("aria-hidden", "false");
        if (typeof deps.setHubTitleColor === "function") {
            deps.setHubTitleColor(deps.readHubTitleColor(), false);
        }
        if (typeof global.scheduleHubSpectrumBeckon === "function") global.scheduleHubSpectrumBeckon();
    }

    function openEntitySelect(fromHub, opts) {
        const d = deps.dom;
        if (!d.startMenu) return;
        opts = opts || {};
        if (global.NebulaGameMode && typeof global.NebulaGameMode.setEntitySelectIntent === "function") {
            if (opts.multiplayer === true) {
                global.NebulaGameMode.setEntitySelectIntent("multiplayer");
            } else if (opts.multiplayer === false) {
                global.NebulaGameMode.setEntitySelectIntent("single");
            }
        }
        hideMenuOverlay(d.multiplayerLobbyScreen);
        try {
            if (typeof deps.initAudio === "function") deps.initAudio();
        } catch (e) {}
        if (fromHub) {
            hubSkippedForSession = true;
            if (d.introScreen) {
                d.introScreen.classList.add("hub-leaving");
                setTimeout(() => {
                    if (d.introScreen) d.introScreen.style.display = "none";
                }, 480);
            }
        } else if (d.introScreen) {
            d.introScreen.style.display = "none";
        }
        hideMenuOverlay(d.optionsScreen);
        hideMenuOverlay(d.aboutScreen);
        if (typeof deps.clearWasdKeysState === "function") deps.clearWasdKeysState();
        entitySelectActive = true;
        d.startMenu.style.display = "flex";
        d.startMenu.style.pointerEvents = "";
        d.startMenu.style.removeProperty("opacity");
        d.startMenu.classList.remove("ready");
        requestAnimationFrame(() => d.startMenu.classList.add("ready"));
        if (typeof deps.renderSelectedSkin === "function") deps.renderSelectedSkin();
        deps.ensureDrawLoop();
    }

    function returnFromMultiplayerLobbyToEntitySelect() {
        hideMenuOverlay(deps.dom.multiplayerLobbyScreen);
        if (global.NebulaGameMode && typeof global.NebulaGameMode.setEntitySelectIntent === "function") {
            global.NebulaGameMode.setEntitySelectIntent("multiplayer");
        }
        openEntitySelect(false, { multiplayer: true });
    }

    function syncMultiplayerLobbyAccent() {
        const screen = deps.dom.multiplayerLobbyScreen;
        if (!screen) return;
        const accent =
            typeof deps.readHubTitleColor === "function" ? deps.readHubTitleColor() : "#ff2d2d";
        screen.style.setProperty("--mp-accent", accent);
    }

    function enterMultiplayerLobby(skin) {
        if (!skin || !skin.unlocked) return;
        const d = deps.dom;
        const player = deps.getPlayer();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        if (typeof deps.dismissEvolutionLabForGameStart === "function") {
            deps.dismissEvolutionLabForGameStart();
        }
        try {
            if (typeof deps.initAudio === "function") deps.initAudio();
        } catch (e) {}
        player.glow = skin.color;
        if (typeof deps.applySkinCursor === "function") deps.applySkinCursor(skin.color);
        deps.setSelectedAbility(skin.ability);
        deps.setActiveRunSkinName(skin.name);
        entitySelectActive = false;
        if (d.startMenu) {
            d.startMenu.style.opacity = "0";
            d.startMenu.style.display = "none";
            d.startMenu.style.pointerEvents = "none";
            d.startMenu.classList.remove("ready");
        }
        document.body.classList.remove("game-running");
        syncMultiplayerLobbyAccent();
        if (d.multiplayerLobbyScreen) {
            const entityCol = skin.color || skin.glow || "#ffffff";
            d.multiplayerLobbyScreen.style.setProperty("--mp-entity-color", entityCol);
        }
        if (typeof global.openMultiplayerLobbySession === "function") {
            global.openMultiplayerLobbySession(skin);
        }
        showMenuOverlay(d.multiplayerLobbyScreen);
        deps.ensureDrawLoop();
    }

    function syncOptionsScreenAccent() {
        const screen = deps.dom.optionsScreen;
        if (!screen) return;
        const accent =
            typeof deps.readHubTitleColor === "function" ? deps.readHubTitleColor() : "#c86bff";
        screen.style.setProperty("--opt-accent", accent);
    }

    function syncAboutScreenAccent() {
        const screen = deps.dom.aboutScreen;
        if (!screen) return;
        const accent =
            typeof deps.readHubTitleColor === "function" ? deps.readHubTitleColor() : "#c86bff";
        screen.style.setProperty("--about-accent", accent);
    }

    function clearOptionsSystemButtonInlineStyles() {
        const d = deps.dom;
        if (d.menuSoundBtn) {
            d.menuSoundBtn.style.removeProperty("border-color");
            d.menuSoundBtn.style.removeProperty("box-shadow");
        }
        if (d.menuFullscreenBtn) {
            d.menuFullscreenBtn.style.removeProperty("border-color");
            d.menuFullscreenBtn.style.removeProperty("box-shadow");
        }
    }

    function openHubOptions() {
        const d = deps.dom;
        if (!d.optionsScreen) return;
        syncOptionsScreenAccent();
        clearOptionsSystemButtonInlineStyles();
        try {
            if (typeof deps.initAudio === "function") deps.initAudio();
        } catch (e) {}
        try {
            if (typeof deps.playHoverSound === "function") deps.playHoverSound();
        } catch (e) {}
        if (typeof deps.syncControlSchemePickerUi === "function") deps.syncControlSchemePickerUi();
        setMenuToggleLabel(d.menuFullscreenBtn, "SCREEN", !!document.fullscreenElement);
        setMenuToggleLabel(d.menuSoundBtn, "SOUND", deps.getSoundEnabled());
        if (d.introScreen) d.introScreen.style.display = "none";
        showMenuOverlay(d.optionsScreen);
        deps.ensureDrawLoop();
    }

    function openHubAbout() {
        const d = deps.dom;
        if (!d.aboutScreen) return;
        syncAboutScreenAccent();
        try {
            if (typeof deps.initAudio === "function") deps.initAudio();
        } catch (e) {}
        try {
            if (typeof deps.playHoverSound === "function") deps.playHoverSound();
        } catch (e) {}
        if (d.introScreen) d.introScreen.style.display = "none";
        showMenuOverlay(d.aboutScreen);
        if (typeof global.setAboutArchivePage === "function") global.setAboutArchivePage(0);
        deps.ensureDrawLoop();
    }

    function revealHubActions() {
        const d = deps.dom;
        if (hubActionsRevealed || hubSkippedForSession || !d.introScreen) return;
        hubActionsRevealed = true;
        d.introScreen.classList.add("hub-actions-ready");
        if (d.hubActions) d.hubActions.setAttribute("aria-hidden", "false");
        const hubColorRow = document.getElementById("hubColorRow");
        if (hubColorRow) hubColorRow.setAttribute("aria-hidden", "false");
        if (typeof deps.triggerTitleGlitch === "function" && d.menuTitle && deps.isHubVisible()) {
            deps.triggerTitleGlitch(d.menuTitle.dataset.originalText || "NEBULA VOID");
        }
        if (typeof global.scheduleHubSpectrumBeckon === "function") global.scheduleHubSpectrumBeckon();
    }

    function onHubTitleSettled() {
        if (!deps.dom.introScreen || hubSkippedForSession) return;
        global.setTimeout(revealHubActions, 120);
    }

    function initMainHub() {
        const d = deps.dom;
        if (typeof deps.initControlSettings === "function") deps.initControlSettings(d.optionsScreen);
        if (typeof global.initAboutArchive === "function") global.initAboutArchive();
        if (typeof deps.initHubTitleColorSwatches === "function") deps.initHubTitleColorSwatches();
        if (d.startMenu && !hubSkippedForSession) {
            d.startMenu.style.display = "none";
        }
        if (!d.introScreen) {
            openEntitySelect(false);
            return;
        }
        if (d.hubPlayBtn) {
            d.hubPlayBtn.addEventListener("click", () => {
                try {
                    if (typeof deps.playHoverSound === "function") deps.playHoverSound();
                } catch (e) {}
                openEntitySelect(true, { multiplayer: false });
            });
        }
        if (d.hubMultiplayerBtn) {
            d.hubMultiplayerBtn.addEventListener("click", () => {
                try {
                    if (typeof deps.playHoverSound === "function") deps.playHoverSound();
                } catch (e) {}
                openEntitySelect(true, { multiplayer: true });
            });
        }
        if (d.hubOptionsBtn) d.hubOptionsBtn.addEventListener("click", openHubOptions);
        if (d.hubAboutBtn) d.hubAboutBtn.addEventListener("click", openHubAbout);
        if (d.optionsBackBtn) {
            d.optionsBackBtn.addEventListener("click", () => {
                hideMenuOverlay(d.optionsScreen);
                showMainHub();
                deps.ensureDrawLoop();
            });
        }
        if (d.aboutBackBtn) {
            d.aboutBackBtn.addEventListener("click", () => {
                hideMenuOverlay(d.aboutScreen);
                showMainHub();
                deps.ensureDrawLoop();
            });
        }
        if (d.entitySelectBackBtn) {
            d.entitySelectBackBtn.addEventListener("click", () => {
                if (!entitySelectActive || d.startMenu.style.display === "none" || deps.getGameActive()) {
                    return;
                }
                if (typeof deps.isLabModeActive === "function" && deps.isLabModeActive()) return;
                try {
                    if (typeof deps.playHoverSound === "function") deps.playHoverSound();
                } catch (e) {}
                showMainHub();
                deps.ensureDrawLoop();
            });
        }
        if (d.menuTitle) {
            d.menuTitle.addEventListener("transitionend", (ev) => {
                if (ev.propertyName === "top" || ev.propertyName === "transform") onHubTitleSettled();
            });
        }
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!hubSkippedForSession && d.introScreen) {
                    d.introScreen.classList.add("intro-ready");
                    global.setTimeout(() => {
                        if (!hubSkippedForSession && d.introScreen) {
                            d.introScreen.classList.add("hub-title-settled");
                        }
                    }, 520);
                    global.setTimeout(revealHubActions, 1650);
                }
            });
        });
    }

    function initMenuState() {
        const d = deps.dom;
        setMenuToggleLabel(d.menuFullscreenBtn, "SCREEN", !!document.fullscreenElement);
        setMenuToggleLabel(d.menuSoundBtn, "SOUND", deps.getSoundEnabled());
        if (typeof deps.renderSelectedSkin === "function") deps.renderSelectedSkin();
        if (d.startMenu && hubSkippedForSession) {
            openEntitySelect(false);
        }
    }

    function wireMenuSystemButtons() {
        const d = deps.dom;
        if (d.menuFullscreenBtn) {
            d.menuFullscreenBtn.addEventListener("click", () => {
                const req = !document.fullscreenElement
                    ? document.documentElement.requestFullscreen()
                    : document.exitFullscreen();
                if (req && typeof req.catch === "function") req.catch(() => {});
            });
            document.addEventListener("fullscreenchange", () => {
                setMenuToggleLabel(d.menuFullscreenBtn, "SCREEN", !!document.fullscreenElement);
            });
        }
        if (d.menuSoundBtn) {
            d.menuSoundBtn.addEventListener("click", async () => {
                const next = !deps.getSoundEnabled();
                await deps.setSoundEnabled(next);
                setMenuToggleLabel(d.menuSoundBtn, "SOUND", next);
            });
        }
    }

    global.configureHubFlow = configureHubFlow;
    global.hideMenuOverlay = hideMenuOverlay;
    global.showMenuOverlay = showMenuOverlay;
    global.showMainHub = showMainHub;
    global.openEntitySelect = openEntitySelect;
    global.returnFromMultiplayerLobbyToEntitySelect = returnFromMultiplayerLobbyToEntitySelect;
    global.enterMultiplayerLobby = enterMultiplayerLobby;
    global.getEntitySelectActive = getEntitySelectActive;
    global.getHubSkippedForSession = getHubSkippedForSession;
    global.setHubSkippedForSession = setHubSkippedForSession;
    global.setEntitySelectActive = setEntitySelectActive;
    global.initMainHub = initMainHub;
    global.initMenuState = initMenuState;
    global.wireMenuSystemButtons = wireMenuSystemButtons;
})(typeof window !== "undefined" ? window : globalThis);
