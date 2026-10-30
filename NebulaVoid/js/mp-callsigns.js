/**
 * NEBULA VOID — room callsign helpers (client fallback if relay omits tag).
 */
(function (global) {
    "use strict";

    const POOL = [
        "VOID", "GLORB", "SNACK", "YEET", "OOPS", "BLARP", "ZORP", "FLUX", "GOOP", "NOM",
        "BLOB", "WUMP", "PLIP", "GRONK", "SNEK", "MOCHI", "GLINT", "SPORK", "QUARK", "NEBU",
        "ORBIT", "PLASM", "GLOOP", "SLURP", "BOING", "ZAPPY", "CRISP", "DINGO", "FIZZ", "HONK",
    ];

    function hashPeer(peerId) {
        const s = String(peerId || "");
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function normalizeTag(raw) {
        return String(raw || "")
            .replace(/[^A-Za-z0-9]/g, "")
            .trim()
            .slice(0, 5)
            .toUpperCase();
    }

    /** Prefer server tag; else stable funny tag from peerId (same on all clients). */
    function resolveCallsign(peerId, serverTag) {
        const fromServer = normalizeTag(serverTag);
        if (fromServer) return fromServer;
        const id = String(peerId || "").trim();
        if (!id) return "";
        return POOL[hashPeer(id) % POOL.length];
    }

    global.NebulaMpCallsigns = {
        resolveCallsign,
        normalizeCallsign: normalizeTag,
    };
})(typeof window !== "undefined" ? window : globalThis);
