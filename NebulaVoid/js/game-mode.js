/**
 * NEBULA VOID — single vs multiplayer entry intent (client-only).
 */
(function (global) {
    "use strict";

    /** @type {'single' | 'multiplayer'} */
    let entitySelectIntent = "single";
    /** @type {'single' | 'mirror'} */
    let runMode = "single";

    function setEntitySelectIntent(intent) {
        entitySelectIntent = intent === "multiplayer" ? "multiplayer" : "single";
    }

    function getEntitySelectIntent() {
        return entitySelectIntent;
    }

    function resetEntitySelectIntent() {
        entitySelectIntent = "single";
    }

    function setRunMode(mode) {
        runMode = mode === "mirror" ? "mirror" : "single";
    }

    function getRunMode() {
        return runMode;
    }

    function resetRunMode() {
        runMode = "single";
    }

    global.NebulaGameMode = {
        setEntitySelectIntent,
        getEntitySelectIntent,
        resetEntitySelectIntent,
        setRunMode,
        getRunMode,
        resetRunMode,
    };
})(typeof window !== "undefined" ? window : globalThis);
