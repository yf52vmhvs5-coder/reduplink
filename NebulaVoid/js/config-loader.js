/**
 * Reads window.__GAME_DATA_SOURCE (js/game-data.js), validates shape, exposes window.__GAME_BOOT.
 * js/game-data.js must load before this file. entities.js must load after loadGameConfig() resolves.
 */
(function (global) {
    "use strict";

    function deepFreezeConfigSection(value) {
        if (!value || typeof value !== "object") return value;
        Object.freeze(value);
        Object.getOwnPropertyNames(value).forEach(function (key) {
            const child = value[key];
            if (child && typeof child === "object" && !Object.isFrozen(child)) {
                deepFreezeConfigSection(child);
            }
        });
        return value;
    }

    function assertObject(data, key) {
        const val = data[key];
        if (!val || typeof val !== "object" || Array.isArray(val)) {
            throw new Error('js/game-data.js: missing or invalid "' + key + '"');
        }
        return val;
    }

    function assertNumbers(section, sectionName, keys) {
        keys.forEach(function (key) {
            const v = section[key];
            if (typeof v !== "number" || !Number.isFinite(v)) {
                throw new Error('js/game-data.js: ' + sectionName + '.' + key + ' must be a number');
            }
        });
    }

    function assertBountyTiers(tiers) {
        if (!Array.isArray(tiers) || tiers.length === 0) {
            throw new Error('js/game-data.js: gameSettings.BOUNTY_TIERS must be a non-empty array');
        }
        tiers.forEach(function (t, i) {
            if (!t || !Number.isFinite(t.combo) || !Number.isFinite(t.multiplier) || typeof t.color !== "string") {
                throw new Error('js/game-data.js: gameSettings.BOUNTY_TIERS[' + i + '] needs { combo, multiplier, color }');
            }
        });
    }

    function validateGameData(data) {
        if (!data || typeof data !== "object") {
            throw new Error("js/game-data.js: root must be an object");
        }
        assertObject(data, "gameSettings");
        assertObject(data, "abilitySettings");
        assertObject(data, "enemyBotSettings");
        assertObject(data, "entityTypes");
        assertObject(data, "world");
        assertObject(data, "audio");
        assertObject(data, "meta");
        assertObject(data, "evolution");
        assertObject(data, "entityMods");
        assertObject(data, "about");
        if (!Array.isArray(data.skins) || data.skins.length === 0) {
            throw new Error('js/game-data.js: "skins" must be a non-empty array');
        }
        const ws = data.gameSettings.WORLD_SIZE;
        if (typeof ws !== "number" || !(ws > 0)) {
            throw new Error("js/game-data.js: gameSettings.WORLD_SIZE must be a positive number");
        }
        assertNumbers(data.gameSettings, "gameSettings", [
            "MIN_SPEED", "RADIUS_SPEED_DIVISOR", "BOT_CONTACT_DRAIN",
            "BH_PULL_RANGE", "BH_CORE_RADIUS", "BH_PULL_FORCE", "BH_CORE_DAMAGE",
            "BH_NUTRIENT_PULL_FORCE", "BH_PARTICLE_PULL_RANGE", "BH_PARTICLE_PULL_SPEED"
        ]);
        assertBountyTiers(data.gameSettings.BOUNTY_TIERS);
        assertNumbers(data.abilitySettings, "abilitySettings", [
            "VAMPIRE_MIN_RADIUS", "SPEED_DASH_DURATION"
        ]);
        assertNumbers(data.world, "world", ["botRespawnDelayMs"]);
        return data;
    }

    function normalizeBoot(data) {
        const validated = validateGameData(data);
        const skins = validated.skins.map(function (entry) {
            const skin = {
                color: entry.color,
                name: entry.name,
                ability: entry.ability,
                desc: entry.desc,
                unlocked: entry.defaultUnlocked === true
            };
            if (entry.glowColor) skin.glowColor = entry.glowColor;
            if (Number.isFinite(entry.costMatter)) skin.costMatter = entry.costMatter;
            return skin;
        });

        const boot = {
            configVersion: validated.configVersion || 1,
            multiplayer:
                validated.multiplayer && typeof validated.multiplayer === "object"
                    ? validated.multiplayer
                    : { relayWsUrl: "ws://127.0.0.1:8080", allowMockPeerFallback: false },
            gameSettings: validated.gameSettings,
            abilitySettings: validated.abilitySettings,
            enemyBotSettings: validated.enemyBotSettings,
            entityTypes: validated.entityTypes,
            world: validated.world,
            audio: validated.audio,
            meta: validated.meta,
            evolution: validated.evolution,
            entityMods: validated.entityMods,
            about: validated.about,
            skins: skins
        };

        deepFreezeConfigSection(boot.gameSettings);
        deepFreezeConfigSection(boot.abilitySettings);
        deepFreezeConfigSection(boot.enemyBotSettings);
        deepFreezeConfigSection(boot.entityTypes);
        deepFreezeConfigSection(boot.world);
        deepFreezeConfigSection(boot.audio);
        deepFreezeConfigSection(boot.meta);
        deepFreezeConfigSection(boot.evolution);
        deepFreezeConfigSection(boot.entityMods);
        deepFreezeConfigSection(boot.about);
        Object.freeze(boot.skins);
        boot.skins.forEach(function (s) {
            deepFreezeConfigSection(s);
        });
        Object.freeze(boot);

        return boot;
    }

    function loadGameConfig() {
        return new Promise(function (resolve, reject) {
            try {
                const source = global.__GAME_DATA_SOURCE;
                if (!source || typeof source !== "object") {
                    throw new Error("NEBULA VOID: js/game-data.js missing. Load it before js/config-loader.js.");
                }
                global.__GAME_BOOT = normalizeBoot(source);
                resolve(global.__GAME_BOOT);
            } catch (e) {
                reject(e);
            }
        });
    }

    global.loadGameConfig = loadGameConfig;
})(window);
