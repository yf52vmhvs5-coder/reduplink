/**
 * NEBULA VOID — localStorage persistence (scores, skins, Void Matter, evolution, mods).
 * Load after config-loader.js.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/save.js");
    }

    const __META_CFG = boot.meta;
    const __EVO_CFG = boot.evolution;

    const BEST_SCORE_STORAGE_KEY = __META_CFG.bestScoreStorageKey;
    const SKINS_UNLOCK_STORAGE_KEY = __META_CFG.skinsUnlockStorageKey;
    const VOID_MATTER_STORAGE_KEY = __META_CFG.voidMatterStorageKey;
    const EVOLUTION_UPGRADES_STORAGE_KEY = __META_CFG.evolutionUpgradesStorageKey;
    const ENTITY_MODS_STORAGE_KEY = __META_CFG.entityModsStorageKey;

    const EVOLUTION_MAX_LEVEL = __EVO_CFG.maxLevel;
    const EVOLUTION_LEGACY_MIGRATION_SKIN = __EVO_CFG.legacyMigrationSkin;

    function makeEmptyBranchMap() {
        return { kinetic: 0, core: 0, signal: 0 };
    }

    function clampBranchLevel(v) {
        return Math.max(0, Math.min(EVOLUTION_MAX_LEVEL, parseInt(v, 10) || 0));
    }

    function sanitizeBranchMap(raw) {
        const out = makeEmptyBranchMap();
        if (!raw || typeof raw !== "object") return out;
        out.kinetic = clampBranchLevel(raw.kinetic);
        out.core = clampBranchLevel(raw.core);
        out.signal = clampBranchLevel(raw.signal);
        return out;
    }

    function readEvolutionUpgrades() {
        try {
            const raw = localStorage.getItem(EVOLUTION_UPGRADES_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return {};

            const looksLegacy =
                ("kinetic" in parsed || "core" in parsed || "signal" in parsed) &&
                !Object.values(parsed).some((v) => v && typeof v === "object");
            if (looksLegacy) {
                const migrated = {};
                migrated[EVOLUTION_LEGACY_MIGRATION_SKIN] = sanitizeBranchMap(parsed);
                return migrated;
            }

            const out = {};
            Object.keys(parsed).forEach((skinName) => {
                if (typeof skinName !== "string" || !skinName) return;
                out[skinName] = sanitizeBranchMap(parsed[skinName]);
            });
            return out;
        } catch (e) {
            return {};
        }
    }

    function writeEvolutionUpgrades(map) {
        try {
            localStorage.setItem(EVOLUTION_UPGRADES_STORAGE_KEY, JSON.stringify(map));
        } catch (e) {
            /* storage unavailable */
        }
    }

    function readEntityMods() {
        try {
            const raw = localStorage.getItem(ENTITY_MODS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return {};
            const out = {};
            Object.keys(parsed).forEach((skinName) => {
                if (typeof skinName !== "string" || !skinName) return;
                const row = parsed[skinName];
                if (!row || typeof row !== "object") return;
                out[skinName] = {
                    x1: row.x1 === true,
                    x2: row.x2 === true,
                    x3: row.x3 === true,
                };
            });
            return out;
        } catch (e) {
            return {};
        }
    }

    function writeEntityMods(map) {
        try {
            localStorage.setItem(ENTITY_MODS_STORAGE_KEY, JSON.stringify(map));
        } catch (e) {
            /* ignore */
        }
    }

    function readBestScore() {
        try {
            return Math.max(0, parseInt(localStorage.getItem(BEST_SCORE_STORAGE_KEY) || "0", 10) || 0);
        } catch (e) {
            return 0;
        }
    }

    function writeBestScore(value) {
        try {
            localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(Math.max(0, value)));
        } catch (e) {
            /* ignore */
        }
    }

    function readSkinsUnlockState() {
        try {
            const rawValue = localStorage.getItem(SKINS_UNLOCK_STORAGE_KEY);
            if (!rawValue) return {};
            const parsed = JSON.parse(rawValue);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function writeSkinsUnlockState(map) {
        try {
            localStorage.setItem(SKINS_UNLOCK_STORAGE_KEY, JSON.stringify(map));
        } catch (e) {
            /* ignore */
        }
    }

    function readTotalVoidMatter() {
        try {
            return Math.max(0, parseInt(localStorage.getItem(VOID_MATTER_STORAGE_KEY) || "0", 10) || 0);
        } catch (e) {
            return 0;
        }
    }

    function writeTotalVoidMatter(value) {
        try {
            localStorage.setItem(VOID_MATTER_STORAGE_KEY, String(Math.max(0, Math.floor(value))));
        } catch (e) {
            /* ignore */
        }
    }

    var evolutionUpgrades = readEvolutionUpgrades();
    var entityModsOwned = readEntityMods();
    var totalVoidMatter = readTotalVoidMatter();

    function addTotalVoidMatter(amount) {
        if (!Number.isFinite(amount) || amount <= 0) return;
        totalVoidMatter = Math.max(0, totalVoidMatter + Math.floor(amount));
        writeTotalVoidMatter(totalVoidMatter);
    }

    function spendVoidMatter(amount) {
        if (!Number.isFinite(amount) || amount <= 0) return false;
        const cost = Math.floor(amount);
        if (totalVoidMatter < cost) return false;
        totalVoidMatter -= cost;
        writeTotalVoidMatter(totalVoidMatter);
        return true;
    }

    global.makeEmptyBranchMap = makeEmptyBranchMap;
    global.sanitizeBranchMap = sanitizeBranchMap;
    global.clampBranchLevel = clampBranchLevel;
    global.readEvolutionUpgrades = readEvolutionUpgrades;
    global.writeEvolutionUpgrades = writeEvolutionUpgrades;
    global.readEntityMods = readEntityMods;
    global.writeEntityMods = writeEntityMods;
    global.readBestScore = readBestScore;
    global.writeBestScore = writeBestScore;
    global.readSkinsUnlockState = readSkinsUnlockState;
    global.writeSkinsUnlockState = writeSkinsUnlockState;
    global.readTotalVoidMatter = readTotalVoidMatter;
    global.writeTotalVoidMatter = writeTotalVoidMatter;
    global.addTotalVoidMatter = addTotalVoidMatter;
    global.spendVoidMatter = spendVoidMatter;
    global.evolutionUpgrades = evolutionUpgrades;
    global.entityModsOwned = entityModsOwned;
    Object.defineProperty(global, "totalVoidMatter", {
        get: function () {
            return totalVoidMatter;
        },
        configurable: true,
    });
})(typeof window !== "undefined" ? window : globalThis);
