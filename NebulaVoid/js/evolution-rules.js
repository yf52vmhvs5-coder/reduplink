/**
 * NEBULA VOID — Evolution Lab runtime rules (levels, costs, multipliers).
 * UI rendering stays in entities.js. Call configureEvolution() after skins are ready.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/evolution-rules.js");
    }

    const __EVO_CFG = boot.evolution;

    const EVOLUTION_MAX_LEVEL = __EVO_CFG.maxLevel;
    const EVOLUTION_BASE_COST = __EVO_CFG.baseCost;
    const EVOLUTION_COST_STEP = __EVO_CFG.costStep;
    const EVOLUTION_KINETIC_PER_LEVEL = __EVO_CFG.kineticPerLevel;
    const EVOLUTION_CORE_GROWTH_PER_LEVEL = __EVO_CFG.coreGrowthPerLevel;
    const EVOLUTION_CORE_SHRINK_PER_LEVEL = __EVO_CFG.coreShrinkPerLevel;
    const EVOLUTION_SIGNAL_PER_LEVEL = __EVO_CFG.signalPerLevel;
    const EVOLUTION_BRANCHES = __EVO_CFG.branches;

    /** @type {null | (() => string | null)} */
    let getActiveSkinKeyFn = null;

    function configureEvolution(deps) {
        if (!deps || typeof deps.getActiveSkinKey !== "function") {
            throw new Error("configureEvolution requires { getActiveSkinKey: () => string | null }");
        }
        getActiveSkinKeyFn = deps.getActiveSkinKey;
    }

    function activeSkinKey() {
        if (!getActiveSkinKeyFn) {
            throw new Error("NEBULA VOID: configureEvolution() before using evolution rules");
        }
        return getActiveSkinKeyFn();
    }

    function getSkinUpgrades(skinName) {
        if (!skinName) return global.makeEmptyBranchMap();
        if (!global.evolutionUpgrades[skinName]) {
            global.evolutionUpgrades[skinName] = global.makeEmptyBranchMap();
        }
        return global.evolutionUpgrades[skinName];
    }

    function getEvolutionLevel(branch) {
        if (
            global.NebulaGameMode &&
            typeof global.NebulaGameMode.getRunMode === "function" &&
            global.NebulaGameMode.getRunMode() === "mirror"
        ) {
            const matchLevel = typeof global.getMpMatchUpgradeLevel === "function"
                ? global.getMpMatchUpgradeLevel()
                : 0;
            if (branch !== "kinetic" && branch !== "core" && branch !== "signal") return 0;
            return Math.max(0, Math.min(EVOLUTION_MAX_LEVEL, matchLevel || 0));
        }
        const skinName = activeSkinKey();
        const map = skinName ? getSkinUpgrades(skinName) : global.makeEmptyBranchMap();
        return Math.max(0, Math.min(EVOLUTION_MAX_LEVEL, map[branch] || 0));
    }

    function getEvolutionCost(branch) {
        const lvl = getEvolutionLevel(branch);
        if (lvl >= EVOLUTION_MAX_LEVEL) return Infinity;
        return EVOLUTION_BASE_COST + lvl * EVOLUTION_COST_STEP;
    }

    function getKineticSpeedMultiplier() {
        return 1 + getEvolutionLevel("kinetic") * EVOLUTION_KINETIC_PER_LEVEL;
    }

    function getCoreGrowthMultiplier() {
        return 1 + getEvolutionLevel("core") * EVOLUTION_CORE_GROWTH_PER_LEVEL;
    }

    function getCoreShrinkMultiplier() {
        return Math.max(0.1, 1 - getEvolutionLevel("core") * EVOLUTION_CORE_SHRINK_PER_LEVEL);
    }

    function getSignalCooldownMultiplier() {
        return Math.max(0.1, 1 - getEvolutionLevel("signal") * EVOLUTION_SIGNAL_PER_LEVEL);
    }

    function applyEvolutionUpgrade(branch) {
        const skinName = activeSkinKey();
        if (!skinName) return { ok: false, reason: "skin" };
        const map = getSkinUpgrades(skinName);
        const lvl = Math.max(0, Math.min(EVOLUTION_MAX_LEVEL, map[branch] || 0));
        if (lvl >= EVOLUTION_MAX_LEVEL) return { ok: false, reason: "max" };
        const cost = EVOLUTION_BASE_COST + lvl * EVOLUTION_COST_STEP;
        if (!global.spendVoidMatter(cost)) return { ok: false, reason: "matter" };
        map[branch] = lvl + 1;
        global.writeEvolutionUpgrades(global.evolutionUpgrades);
        return { ok: true, newLevel: map[branch], cost };
    }

    global.EVOLUTION_MAX_LEVEL = EVOLUTION_MAX_LEVEL;
    global.EVOLUTION_BASE_COST = EVOLUTION_BASE_COST;
    global.EVOLUTION_COST_STEP = EVOLUTION_COST_STEP;
    global.EVOLUTION_BRANCHES = EVOLUTION_BRANCHES;
    global.configureEvolution = configureEvolution;
    global.getSkinUpgrades = getSkinUpgrades;
    global.getEvolutionLevel = getEvolutionLevel;
    global.getEvolutionCost = getEvolutionCost;
    global.getKineticSpeedMultiplier = getKineticSpeedMultiplier;
    global.getCoreGrowthMultiplier = getCoreGrowthMultiplier;
    global.getCoreShrinkMultiplier = getCoreShrinkMultiplier;
    global.getSignalCooldownMultiplier = getSignalCooldownMultiplier;
    global.applyEvolutionUpgrade = applyEvolutionUpgrade;
})(typeof window !== "undefined" ? window : globalThis);
