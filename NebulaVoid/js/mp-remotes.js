/**
 * NEBULA VOID — remote human cells for mirror / FFA (up to max room players).
 */
(function (global) {
    "use strict";

    /** @type {Map<string, Record<string, unknown>>} */
    const remotePlayersById = new Map();

    function defaultWorldMid() {
        const boot = global.__GAME_BOOT;
        const ws =
            boot && boot.gameSettings && typeof boot.gameSettings.WORLD_SIZE === "number"
                ? boot.gameSettings.WORLD_SIZE
                : 4000;
        return ws / 2;
    }

    function createRemoteCell(peerId) {
        const mid = defaultWorldMid();
        return {
            peerId,
            active: false,
            x: mid,
            y: mid - 500,
            radius: 20,
            displayX: mid,
            displayY: mid - 500,
            displayRadius: 20,
            color: "#0a0a0a",
            glow: "#888888",
            entity: "",
            ability: "",
            cd: 0,
            cdMax: 0,
            cdAt: 0,
            netVelX: 0,
            netVelY: 0,
            netStateT: 0,
            arenaOut: false,
        };
    }

    function ensureRemotePeer(peerId) {
        const id = String(peerId || "").trim();
        if (!id) return null;
        let rp = remotePlayersById.get(id);
        if (!rp) {
            rp = createRemoteCell(id);
            remotePlayersById.set(id, rp);
        }
        return rp;
    }

    function getRemotePlayer(peerId) {
        if (typeof peerId === "string" && peerId) {
            return remotePlayersById.get(peerId) || null;
        }
        for (const rp of remotePlayersById.values()) {
            if (rp.active) return rp;
        }
        return null;
    }

    function getRemotePlayers() {
        return Array.from(remotePlayersById.values());
    }

    function deactivateRemotePeer(peerId) {
        const rp = remotePlayersById.get(peerId);
        if (!rp) return;
        rp.arenaOut = true;
        rp.active = false;
        rp.entity = "";
        rp.ability = "";
        rp.cd = 0;
        rp.cdMax = 0;
        rp.cdAt = 0;
        rp.displayRadius = 0;
        rp.radius = 0;
    }

    function reactivateRemotePeer(peerId) {
        const rp = ensureRemotePeer(peerId);
        if (!rp) return;
        rp.arenaOut = false;
    }

    function clearRemotePeers() {
        remotePlayersById.clear();
    }

    function getLocalPeerId() {
        const api = global.NebulaMpMirror;
        if (!api || typeof api.getMirrorSession !== "function") return null;
        const sess = api.getMirrorSession();
        return sess && sess.peerId ? sess.peerId : null;
    }

    global.NebulaMpRemotes = {
        ensureRemotePeer,
        getRemotePlayer,
        getRemotePlayers,
        deactivateRemotePeer,
        reactivateRemotePeer,
        clearRemotePeers,
        getLocalPeerId,
    };
})(typeof window !== "undefined" ? window : globalThis);
