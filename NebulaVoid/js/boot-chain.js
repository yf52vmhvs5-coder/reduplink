/**
 * NEBULA VOID — ordered script loading after game config is ready.
 * Requires js/game-data.js and js/config-loader.js loaded first in index.html.
 *
 * Modules in each wave may download in parallel; execution order within a wave
 * is preserved (async=false, append order).
 */
(function (global) {
    "use strict";

    var MODULE_WAVES = [
        ["js/pool.js", "js/save.js", "js/control-settings.js", "js/entity-mods.js", "js/game-mode.js"],
        [
            "js/nutrient.js",
            "js/particle.js",
            "js/fx-presentation.js",
            "js/jelly-bubble.js",
            "js/glass-vault.js",
            "js/ravenous-blood-rift.js",
            "js/phase-cage.js",
            "js/evolution-rules.js",
        ],
        [
            "js/entity-select-ui.js",
            "js/enemy-bot.js",
            "js/audio.js",
            "js/ui-shell.js",
            "js/mp-match-upgrades.js",
            "js/mp-mirror.js",
            "js/mp-remotes.js",
            "js/mp-callsigns.js",
            "js/mp-lobby.js",
            "js/mp-session.js",
            "js/mp-taunts.js",
            "js/about-archive-ui.js",
            "js/run-lifecycle.js",
            "js/hub-flow.js",
            "js/mirror-match.js",
            "js/mp-abilities.js",
            "js/spore-ghosts.js",
        ],
        ["js/mp-offscreen-indicators.js", "js/sim-update.js", "js/sim-draw.js"],
        ["entities.js"],
    ];

    var MODULE_SCRIPTS = [];
    for (var w = 0; w < MODULE_WAVES.length; w++) {
        for (var j = 0; j < MODULE_WAVES[w].length; j++) {
            MODULE_SCRIPTS.push(MODULE_WAVES[w][j]);
        }
    }

    /** @type {Set<string>} */
    var loadedScripts = new Set();
    var bootPromise = null;

    var BOOT_SYMBOL_CHECKS = [
        { path: "getFromPool", hint: "js/pool.js" },
        { path: "readBestScore", hint: "js/save.js" },
        { path: "configureEntityMods", hint: "js/entity-mods.js" },
        { path: "Nutrient", hint: "js/nutrient.js" },
        { path: "Particle", hint: "js/particle.js" },
        { path: "drawCosmicDust", hint: "js/fx-presentation.js" },
        { path: "JellyBubble", hint: "js/jelly-bubble.js" },
        { path: "NebulaGlass", hint: "js/glass-vault.js" },
        { path: "configureBloodRift", hint: "js/ravenous-blood-rift.js" },
        { path: "spawnPhaseCageFromWarp", hint: "js/phase-cage.js" },
        { path: "configureEvolution", hint: "js/evolution-rules.js" },
        { path: "configureEntitySelectUi", hint: "js/entity-select-ui.js" },
        { path: "EnemyBot", hint: "js/enemy-bot.js" },
        { path: "configureAudio", hint: "js/audio.js" },
        { path: "NebulaDom", hint: "js/ui-shell.js" },
        { path: "configureSporeGhosts", hint: "js/spore-ghosts.js" },
        { path: "configureMpTaunts", hint: "js/mp-taunts.js" },
        { path: "update", hint: "js/sim-update.js" },
        { path: "drawMpOffscreenIndicators", hint: "js/mp-offscreen-indicators.js" },
        { path: "ensureDrawLoop", hint: "js/sim-draw.js" },
    ];

    function flattenMessage(err) {
        if (!err) return "Unknown boot error";
        if (typeof err === "string") return err;
        if (err.message) return err.message;
        return String(err);
    }

    function showBootFailure(err) {
        var msg = flattenMessage(err);
        console.error("[NEBULA VOID boot]", err);
        if (global.document && !global.document.getElementById("nebulaBootFailure")) {
            var panel = global.document.createElement("div");
            panel.id = "nebulaBootFailure";
            panel.setAttribute("role", "alert");
            panel.style.cssText =
                "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
                "background:#000;color:#ff4545;font-family:Courier New,Courier,monospace;" +
                "padding:24px;text-align:center;z-index:99999;box-sizing:border-box;";
            panel.innerHTML =
                '<div style="max-width:42rem;line-height:1.45">' +
                "<strong style=\"color:#ff6b6b;display:block;margin-bottom:12px;font-size:1.05rem\">" +
                "BOOT FAILED</strong>" +
                '<p style="margin:0 0 12px;color:#e8e8e8;word-break:break-word">' +
                escapeHtml(msg) +
                "</p>" +
                '<p style="margin:0;font-size:0.85rem;color:#888">Check js/game-data.js, boot-chain order, and the browser console.</p>' +
                "</div>";
            global.document.body.appendChild(panel);
        }
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function getGlobalSymbol(path) {
        var parts = path.split(".");
        var cur = global;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function assertBootReady() {
        for (var i = 0; i < BOOT_SYMBOL_CHECKS.length; i++) {
            var row = BOOT_SYMBOL_CHECKS[i];
            var val = getGlobalSymbol(row.path);
            if (val === undefined || val === null) {
                throw new Error(
                    "BOOT: missing " +
                        row.path +
                        " after load — expected from " +
                        row.hint +
                        " (see js/boot-chain.js MODULE_WAVES)"
                );
            }
            if (typeof val === "function" || typeof val === "object") continue;
            throw new Error("BOOT: invalid export " + row.path + " from " + row.hint);
        }
    }

    function loadScript(src, stepIndex, totalSteps) {
        if (loadedScripts.has(src)) {
            return Promise.resolve();
        }
        return new Promise(function (resolve, reject) {
            var s = global.document.createElement("script");
            s.src = src;
            s.async = false;
            s.onload = function () {
                loadedScripts.add(src);
                resolve();
            };
            s.onerror = function () {
                reject(
                    new Error(
                        "BOOT step " +
                            stepIndex +
                            "/" +
                            totalSteps +
                            ": failed to load " +
                            src +
                            " (missing file or blocked network)"
                    )
                );
            };
            global.document.body.appendChild(s);
        });
    }

    function loadWave(wave, waveIndex, stepOffset, totalSteps, onProgress) {
        var pending = [];
        for (var i = 0; i < wave.length; i++) {
            var src = wave[i];
            var step = stepOffset + i + 1;
            if (typeof onProgress === "function") {
                onProgress(step, totalSteps, src, waveIndex);
            }
            pending.push(loadScript(src, step, totalSteps));
        }
        return Promise.all(pending);
    }

    function loadNebulaModules(opts) {
        if (bootPromise) {
            return bootPromise;
        }

        var onProgress = opts && opts.onProgress;
        var totalSteps = MODULE_SCRIPTS.length;

        bootPromise = global
            .loadGameConfig()
            .then(function () {
                var chain = Promise.resolve();
                var stepOffset = 0;
                for (var w = 0; w < MODULE_WAVES.length; w++) {
                    (function (wave, waveIdx, offset) {
                        chain = chain.then(function () {
                            return loadWave(wave, waveIdx, offset, totalSteps, onProgress);
                        });
                    })(MODULE_WAVES[w], w, stepOffset);
                    stepOffset += MODULE_WAVES[w].length;
                }
                return chain;
            })
            .then(function () {
                assertBootReady();
            })
            .catch(function (err) {
                bootPromise = null;
                throw err;
            });

        return bootPromise;
    }

    function preloadModuleScripts() {
        if (!global.document || !global.document.head) return;
        for (var i = 0; i < MODULE_SCRIPTS.length; i++) {
            var href = MODULE_SCRIPTS[i];
            if (loadedScripts.has(href)) continue;
            var link = global.document.createElement("link");
            link.rel = "preload";
            link.as = "script";
            link.href = href;
            global.document.head.appendChild(link);
        }
    }

    global.NEBULA_MODULE_SCRIPTS = MODULE_SCRIPTS;
    global.NEBULA_MODULE_WAVES = MODULE_WAVES;
    global.loadNebulaModules = loadNebulaModules;
    global.showNebulaBootFailure = showBootFailure;
    if (global.document && global.document.readyState !== "loading") {
        preloadModuleScripts();
    } else if (global.document) {
        global.document.addEventListener("DOMContentLoaded", preloadModuleScripts);
    }
})(typeof window !== "undefined" ? window : globalThis);
