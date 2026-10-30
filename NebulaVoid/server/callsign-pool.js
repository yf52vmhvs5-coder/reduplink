"use strict";

/** Max 5 letters — unique per room; funny / sci-fi tags */
const CALLSIGN_POOL = [
    "VOID", "GLORB", "SNACK", "YEET", "OOPS", "BLARP", "ZORP", "FLUX", "GOOP", "NOM",
    "BLOB", "WUMP", "PLIP", "GRONK", "SNEK", "MOCHI", "GLINT", "SPORK", "QUARK", "NEBU",
    "ORBIT", "PLASM", "GLOOP", "SLURP", "BOING", "ZAPPY", "CRISP", "DINGO", "FIZZ", "HONK",
    "JELLY", "KAPOW", "LURK", "MUNCH", "NOVA", "PLONK", "QUIRK", "ROBOT", "SQUID", "TACO",
    "UMAMI", "VIBES", "WOOZY", "XENON", "YIKES", "ZESTY", "AMOEB", "BLOOP", "CHOMP", "DRIFT",
    "EMBER", "FROTH", "GAMMA", "HYPER", "IGLOO", "JUMBO", "KRAK", "LUNAR", "MORPH", "NINJA",
    "OZONE", "PIXEL", "QUASI", "RADAR", "SLIME", "TURBO", "ULTRA", "VORTX", "WACKY", "ZONK",
];

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}

function usedInRoom(room) {
    const used = new Set();
    for (const meta of room.values()) {
        if (meta.callsign) used.add(meta.callsign);
    }
    return used;
}

function assignCallsign(room) {
    const used = usedInRoom(room);
    const order = shuffleInPlace(CALLSIGN_POOL.slice());
    for (let i = 0; i < order.length; i++) {
        const tag = order[i];
        if (!used.has(tag)) return tag;
    }
    return "P" + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 4);
}

module.exports = { assignCallsign, CALLSIGN_POOL };
