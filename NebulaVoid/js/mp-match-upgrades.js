/**
 * NEBULA VOID — in-match upgrade readout (multiplayer only).
 * Shows score thresholds and feeds speed, growth, and ability for the match only.
 * Does not spend Void Matter or write the Evolution Lab save.
 */
(function (global) {
    "use strict";

    const MOD_SLOTS = [
        { tier: 1, color: "#00e5ff", glow: "rgba(0, 229, 255, 0.85)" },
        { tier: 2, color: "#c86bff", glow: "rgba(200, 107, 255, 0.85)" },
        { tier: 3, color: "#ffbe76", glow: "rgba(255, 190, 118, 0.85)" },
    ];

    let built = false;
    let barLevel = 0;
    let modTier = 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let flashTimer = null;
    /** @type {{ barCellScore: number, barMaxLevel: number, modScores: number[], branches: { key: string, statLabel: string, color: string, glow: string }[] }} */
    let cfg = {
        barCellScore: 50,
        barMaxLevel: 10,
        modScores: [100, 250, 500],
        branches: [],
    };

    function rootEl() {
        return document.getElementById("mpMatchUpgrades");
    }

    function isMirrorRun() {
        return !!(
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror"
        );
    }

    function readCfg() {
        const boot = global.__GAME_BOOT;
        const evo = boot && boot.evolution;
        const raw = boot && boot.multiplayer && boot.multiplayer.matchUpgrades;
        const branches = evo && Array.isArray(evo.branches) ? evo.branches : [];
        const modScores = raw && Array.isArray(raw.modScores)
            ? raw.modScores.filter(function (n) { return typeof n === "number" && n > 0; }).slice(0, 3).sort(function (a, b) { return a - b; })
            : [];
        cfg = {
            barCellScore: raw && typeof raw.barCellScore === "number" && raw.barCellScore > 0 ? raw.barCellScore : 50,
            barMaxLevel: raw && typeof raw.barMaxLevel === "number" && raw.barMaxLevel >= 1
                ? Math.min(10, Math.floor(raw.barMaxLevel))
                : 10,
            modScores: modScores.length === 3 ? modScores : [100, 250, 500],
            branches: branches.map(function (branch) {
                return {
                    key: branch.key,
                    statLabel: branch.statLabel || branch.label || "",
                    color: branch.color || "#ffffff",
                    glow: branch.glow || "rgba(255,255,255,0.6)",
                };
            }),
        };
    }

    function build() {
        if (built) return;
        const bars = document.getElementById("mpMatchBars");
        const mods = document.getElementById("mpMatchMods");
        if (!bars || !mods) return;
        readCfg();
        bars.textContent = "";
        mods.textContent = "";
        cfg.branches.forEach(function (branch) {
            const row = document.createElement("div");
            row.className = "mp-match-row";
            row.dataset.branch = branch.key;
            row.style.setProperty("--bar-color", branch.color);
            row.style.setProperty("--bar-glow", branch.glow);
            const name = document.createElement("span");
            name.className = "mp-match-name";
            name.textContent = branch.statLabel;
            const cells = document.createElement("div");
            cells.className = "mp-match-cells";
            for (let i = 0; i < cfg.barMaxLevel; i++) {
                const cell = document.createElement("span");
                cell.className = "mp-match-cell";
                cells.appendChild(cell);
            }
            row.appendChild(name);
            row.appendChild(cells);
            bars.appendChild(row);
        });
        MOD_SLOTS.forEach(function (slot) {
            const el = document.createElement("span");
            el.className = "mp-match-mod";
            el.dataset.tier = String(slot.tier);
            el.style.setProperty("--mod-color", slot.color);
            el.style.setProperty("--mod-glow", slot.glow);
            el.textContent = "x" + slot.tier;
            mods.appendChild(el);
        });
        built = true;
    }

    function paint(popFromBar) {
        document.querySelectorAll(".mp-match-row").forEach(function (row) {
            const cells = row.querySelectorAll(".mp-match-cell");
            let rowPopped = false;
            cells.forEach(function (cell, i) {
                const on = i < barLevel;
                cell.classList.toggle("is-filled", on);
                if (on && popFromBar != null && i >= popFromBar && i < barLevel) {
                    cell.classList.remove("is-pop");
                    void cell.offsetWidth;
                    cell.classList.add("is-pop");
                    rowPopped = true;
                }
            });
            if (rowPopped) {
                row.classList.remove("is-tick");
                void row.offsetWidth;
                row.classList.add("is-tick");
            }
        });
        document.querySelectorAll(".mp-match-mod").forEach(function (el) {
            const tier = Number(el.dataset.tier);
            el.classList.toggle("is-on", tier <= modTier);
        });
    }

    const UPGRADE_HUD_HOLD_MS = 2600;

    function flash(text) {
        const root = rootEl();
        if (root) root.hidden = false;
        const el = document.getElementById("mpMatchFlash");
        if (!el) return;
        el.hidden = false;
        el.textContent = text;
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(function () {
            el.hidden = true;
            el.textContent = "";
            const r = rootEl();
            if (r) r.hidden = true;
            flashTimer = null;
        }, UPGRADE_HUD_HOLD_MS);
    }

    function levelsForScore(score) {
        const safe = Math.max(0, Number(score) || 0);
        const bars = Math.min(cfg.barMaxLevel, Math.floor(safe / cfg.barCellScore));
        let mods = 0;
        for (let i = 0; i < cfg.modScores.length; i++) {
            if (safe >= cfg.modScores[i]) mods = i + 1;
        }
        return { bars: bars, mods: mods };
    }

    function beginMpMatchUpgradeHud() {
        build();
        barLevel = 0;
        modTier = 0;
        if (flashTimer) {
            clearTimeout(flashTimer);
            flashTimer = null;
        }
        const root = rootEl();
        if (root) root.hidden = true;
        const flashEl = document.getElementById("mpMatchFlash");
        if (flashEl) {
            flashEl.hidden = true;
            flashEl.textContent = "";
        }
        paint(null);
    }

    function hideMpMatchUpgradeHud() {
        barLevel = 0;
        modTier = 0;
        if (flashTimer) {
            clearTimeout(flashTimer);
            flashTimer = null;
        }
        const root = rootEl();
        if (root) root.hidden = true;
        const flashEl = document.getElementById("mpMatchFlash");
        if (flashEl) {
            flashEl.hidden = true;
            flashEl.textContent = "";
        }
    }

    function syncMpMatchUpgradeHud(score) {
        if (!isMirrorRun()) {
            const root = rootEl();
            if (root && !root.hidden) root.hidden = true;
            return;
        }
        build();
        const next = levelsForScore(score);
        const prevBar = barLevel;
        const prevMod = modTier;
        if (next.bars > barLevel) barLevel = next.bars;
        if (next.mods > modTier) modTier = next.mods;
        if (barLevel !== prevBar || modTier !== prevMod) {
            const root = rootEl();
            if (root) root.hidden = false;
            paint(prevBar);
            if (modTier > prevMod) {
                if (typeof global.playModPurchaseSound === "function") {
                    global.playModPurchaseSound(modTier);
                }
                flash("x" + modTier + " AWAKENED");
            } else {
                if (typeof global.playEvolutionBarUpgradeSound === "function") {
                    global.playEvolutionBarUpgradeSound(barLevel);
                }
                flash("UPGRADE +1");
            }
        }
    }

    function getMpMatchUpgradeLevel() {
        return barLevel;
    }

    global.beginMpMatchUpgradeHud = beginMpMatchUpgradeHud;
    global.hideMpMatchUpgradeHud = hideMpMatchUpgradeHud;
    global.syncMpMatchUpgradeHud = syncMpMatchUpgradeHud;
    global.getMpMatchUpgradeLevel = getMpMatchUpgradeLevel;
})(typeof window !== "undefined" ? window : globalThis);
