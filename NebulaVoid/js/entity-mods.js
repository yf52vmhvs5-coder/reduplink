/**
 * NEBULA VOID — entity mod tiers (x1/x2/x3) ownership and runtime checks.
 * Call configureEntityMods() from entities.js with getActiveRunSkinName.
 */
(function (global) {
    "use strict";

    const boot = global.__GAME_BOOT;
    if (!boot) {
        throw new Error("NEBULA VOID: load game config before js/entity-mods.js");
    }

    const cfg = boot.entityMods;

    global.ENTITY_MOD_X1_COST = Number(cfg.x1Cost) || 10000;
    global.ENTITY_MOD_X2_COST = Number(cfg.x2Cost) || 10000;
    global.ENTITY_MOD_X3_COST = Number(cfg.x3Cost) || 10000;
    global.RAVENOUS_X1_CFG = cfg.ravenousX1 || { skinName: "THE RAVENOUS" };
    global.PHASE_SHIFTER_X1_CFG = cfg.phaseShifterX1 || { skinName: "THE PHASE SHIFTER" };
    global.PHASE_SHIFTER_X2_CFG = cfg.phaseShifterX2 || { skinName: "THE PHASE SHIFTER" };
    global.PHASE_SHIFTER_X3_CFG = cfg.phaseShifterX3 || { skinName: "THE PHASE SHIFTER" };
    global.RAVENOUS_X2_CFG = cfg.ravenousX2 || { skinName: "THE RAVENOUS" };
    global.RAVENOUS_X3_CFG = cfg.ravenousX3 || {
        skinName: "THE RAVENOUS",
        afterglowLifeSec: 1.5,
        afterglowAccent: "#c86bff",
    };
    global.TOXIC_SPORE_X1_CFG = cfg.toxicSporeX1 || { skinName: "THE TOXIC SPORE" };
    global.TOXIC_SPORE_X2_CFG = cfg.toxicSporeX2 || { skinName: "THE TOXIC SPORE" };
    global.TOXIC_SPORE_X3_CFG = cfg.toxicSporeX3 || { skinName: "THE TOXIC SPORE" };

    /** @type {() => string} */
    let getActiveRunSkinName = () => "";

    function configureEntityMods(deps) {
        if (!deps || typeof deps.getActiveRunSkinName !== "function") {
            throw new Error("configureEntityMods requires { getActiveRunSkinName }");
        }
        getActiveRunSkinName = deps.getActiveRunSkinName;
    }

    function owned() {
        return global.entityModsOwned || {};
    }

    function formatEntityModPrice(cost) {
        const v = Number(cost);
        if (!Number.isFinite(v) || v <= 0) return "—";
        return `+ ${v.toLocaleString()}`;
    }

    function hasEntityModX1(skinName) {
        if (!skinName) return false;
        const o = owned();
        return !!(o[skinName] && o[skinName].x1);
    }

    function hasEntityModX2(skinName) {
        if (!skinName) return false;
        const o = owned();
        return !!(o[skinName] && o[skinName].x2);
    }

    function hasEntityModX3(skinName) {
        if (!skinName) return false;
        const o = owned();
        return !!(o[skinName] && o[skinName].x3);
    }

    function isEntityModX1AvailableForSkin(skinName) {
        if (!skinName) return false;
        const ravenous = global.RAVENOUS_X1_CFG && global.RAVENOUS_X1_CFG.skinName;
        const phase = global.PHASE_SHIFTER_X1_CFG && global.PHASE_SHIFTER_X1_CFG.skinName;
        const toxic = global.TOXIC_SPORE_X1_CFG && global.TOXIC_SPORE_X1_CFG.skinName;
        return skinName === ravenous || skinName === phase || skinName === toxic;
    }

    function isEntityModX2AvailableForSkin(skinName) {
        if (!skinName) return false;
        const ravenous = global.RAVENOUS_X2_CFG && global.RAVENOUS_X2_CFG.skinName;
        const phase = global.PHASE_SHIFTER_X2_CFG && global.PHASE_SHIFTER_X2_CFG.skinName;
        const toxic = global.TOXIC_SPORE_X2_CFG && global.TOXIC_SPORE_X2_CFG.skinName;
        return skinName === ravenous || skinName === phase || skinName === toxic;
    }

    function isEntityModX3AvailableForSkin(skinName) {
        if (!skinName) return false;
        const ravenous = global.RAVENOUS_X3_CFG && global.RAVENOUS_X3_CFG.skinName;
        const phase = global.PHASE_SHIFTER_X3_CFG && global.PHASE_SHIFTER_X3_CFG.skinName;
        const toxic = global.TOXIC_SPORE_X3_CFG && global.TOXIC_SPORE_X3_CFG.skinName;
        return skinName === ravenous || skinName === phase || skinName === toxic;
    }

    function playerHasRavenousHuntMod() {
        const name = getActiveRunSkinName();
        return name === global.RAVENOUS_X1_CFG.skinName && hasEntityModX1(name);
    }

    function playerHasRavenousSiphonMod() {
        const name = getActiveRunSkinName();
        return name === global.RAVENOUS_X2_CFG.skinName && hasEntityModX2(name);
    }

    function playerHasRavenousTwinAfterglowMod() {
        const name = getActiveRunSkinName();
        return name === global.RAVENOUS_X3_CFG.skinName && hasEntityModX3(name);
    }

    function playerHasPhaseCageMod() {
        const name = getActiveRunSkinName();
        return name === global.PHASE_SHIFTER_X1_CFG.skinName && hasEntityModX1(name);
    }

    function playerHasPhaseResonanceMod() {
        const name = getActiveRunSkinName();
        return name === global.PHASE_SHIFTER_X2_CFG.skinName && hasEntityModX2(name);
    }

    function playerHasPhaseAscendMod() {
        const name = getActiveRunSkinName();
        return name === global.PHASE_SHIFTER_X3_CFG.skinName && hasEntityModX3(name);
    }

    function playerHasToxicSporeLatchMod() {
        const name = getActiveRunSkinName();
        return name === global.TOXIC_SPORE_X1_CFG.skinName && hasEntityModX1(name);
    }

    function playerHasToxicSporeSplitMod() {
        const name = getActiveRunSkinName();
        return name === global.TOXIC_SPORE_X2_CFG.skinName && hasEntityModX2(name);
    }

    function playerHasToxicSporeVisionMod() {
        const name = getActiveRunSkinName();
        return name === global.TOXIC_SPORE_X3_CFG.skinName && hasEntityModX3(name);
    }

    global.configureEntityMods = configureEntityMods;
    global.formatEntityModPrice = formatEntityModPrice;
    global.hasEntityModX1 = hasEntityModX1;
    global.hasEntityModX2 = hasEntityModX2;
    global.hasEntityModX3 = hasEntityModX3;
    global.isEntityModX1AvailableForSkin = isEntityModX1AvailableForSkin;
    global.isEntityModX2AvailableForSkin = isEntityModX2AvailableForSkin;
    global.isEntityModX3AvailableForSkin = isEntityModX3AvailableForSkin;
    global.playerHasRavenousHuntMod = playerHasRavenousHuntMod;
    global.playerHasRavenousSiphonMod = playerHasRavenousSiphonMod;
    global.playerHasRavenousTwinAfterglowMod = playerHasRavenousTwinAfterglowMod;
    global.playerHasPhaseCageMod = playerHasPhaseCageMod;
    global.playerHasPhaseResonanceMod = playerHasPhaseResonanceMod;
    global.playerHasPhaseAscendMod = playerHasPhaseAscendMod;
    global.playerHasToxicSporeLatchMod = playerHasToxicSporeLatchMod;
    global.playerHasToxicSporeSplitMod = playerHasToxicSporeSplitMod;
    global.playerHasToxicSporeVisionMod = playerHasToxicSporeVisionMod;
})(typeof window !== "undefined" ? window : globalThis);
