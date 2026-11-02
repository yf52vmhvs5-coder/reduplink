/**
 * NEBULA VOID — WebSocket client for blind-mirror relay (lobby + future state sync).
 */
(function (global) {
    "use strict";

    /** @type {string} */
    let relayWsUrl = "ws://127.0.0.1:8080";
    /** @type {WebSocket | null} */
    let socket = null;
    /** @type {Promise<void> | null} */
    let connectPromise = null;

    let peerId = null;
    let roomId = null;
    let peerCount = 0;

    let suppressCloseNotify = false;

    /** @type {{ onJoined?: Function, onPeerJoined?: Function, onPeerLeft?: Function, onError?: Function, onRelay?: Function, onDisconnected?: Function, onRoomList?: Function }} */
    let handlers = {};

    function isLocalHostname(hostname) {
        if (!hostname) return true;
        const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
        if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
            return true;
        }
        if (host.endsWith(".local")) return true;
        if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
        if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
        if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
        return false;
    }

    /** Public pages use relayWsUrlPublic. localhost, file://, and LAN stay on relayWsUrl. */
    function pageUsesPublicRelay() {
        const loc = global.location;
        if (!loc || loc.protocol === "file:") return false;
        return !isLocalHostname(loc.hostname);
    }

    function resolveRelayUrl(mp) {
        const cfg = mp && typeof mp === "object" ? mp : {};
        const localUrl =
            typeof cfg.relayWsUrl === "string" && cfg.relayWsUrl.length > 0
                ? cfg.relayWsUrl
                : "ws://127.0.0.1:8080";
        const publicUrl = typeof cfg.relayWsUrlPublic === "string" ? cfg.relayWsUrlPublic.trim() : "";
        if (pageUsesPublicRelay() && publicUrl) return publicUrl;
        return localUrl;
    }

    function getBootRelayUrl() {
        const boot = global.__GAME_BOOT;
        if (!boot || !boot.multiplayer || typeof boot.multiplayer !== "object") return null;
        return resolveRelayUrl(boot.multiplayer);
    }

    function configureMpMirror(opts) {
        if (opts && typeof opts.relayWsUrl === "string" && opts.relayWsUrl.length > 0) {
            relayWsUrl = opts.relayWsUrl;
        } else {
            const fromBoot = getBootRelayUrl();
            if (fromBoot) relayWsUrl = fromBoot;
        }
    }

    function getRelayUrl() {
        return relayWsUrl;
    }

    function setHandlers(next) {
        handlers = next || {};
    }

    function dispatchMessage(msg) {
        if (!msg || typeof msg !== "object") return;
        switch (msg.type) {
            case "joined":
                peerId = msg.peerId || null;
                roomId = msg.roomId || roomId;
                peerCount = typeof msg.peerCount === "number" ? msg.peerCount : peerCount;
                if (typeof handlers.onJoined === "function") handlers.onJoined(msg);
                break;
            case "peerJoined":
                peerCount =
                    typeof msg.peerCount === "number" && msg.peerCount >= 0
                        ? msg.peerCount
                        : Math.min(6, peerCount + 1);
                if (typeof handlers.onPeerJoined === "function") handlers.onPeerJoined(msg);
                break;
            case "peerLeft":
                peerCount =
                    typeof msg.peerCount === "number" && msg.peerCount >= 0
                        ? msg.peerCount
                        : Math.max(0, peerCount - 1);
                if (typeof handlers.onPeerLeft === "function") handlers.onPeerLeft(msg);
                break;
            case "error":
                if (typeof handlers.onError === "function") handlers.onError(msg);
                break;
            case "roomList":
                if (typeof handlers.onRoomList === "function") handlers.onRoomList(msg);
                break;
            default:
                if (typeof handlers.onRelay === "function") handlers.onRelay(msg);
                break;
        }
    }

    function connect() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        if (connectPromise) return connectPromise;

        connectPromise = new Promise(function (resolve, reject) {
            let ws;
            try {
                ws = new WebSocket(relayWsUrl);
            } catch (err) {
                connectPromise = null;
                reject(err);
                return;
            }
            socket = ws;

            ws.onopen = function () {
                connectPromise = null;
                resolve();
            };

            ws.onerror = function () {
                connectPromise = null;
                reject(new Error("WebSocket connection failed"));
            };

            ws.onclose = function () {
                connectPromise = null;
                const skipNotify = suppressCloseNotify;
                suppressCloseNotify = false;
                if (socket === ws) socket = null;
                if (!skipNotify && typeof handlers.onDisconnected === "function") {
                    handlers.onDisconnected();
                }
            };

            ws.onmessage = function (ev) {
                try {
                    dispatchMessage(JSON.parse(String(ev.data)));
                } catch (e) {
                    if (typeof handlers.onError === "function") {
                        handlers.onError({ type: "error", code: "BAD_JSON" });
                    }
                }
            };
        });

        return connectPromise;
    }

    /** Skip only disposable `state` snapshots when the OS send buffer is backing up. */
    const STATE_BUFFERED_LIMIT = 8192;

    function send(payload, opts) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        if (
            opts &&
            opts.dropIfBuffered === true &&
            typeof socket.bufferedAmount === "number" &&
            socket.bufferedAmount > STATE_BUFFERED_LIMIT
        ) {
            return false;
        }
        try {
            socket.send(JSON.stringify(payload));
            return true;
        } catch (e) {
            return false;
        }
    }

    function joinRoom(joinPayload) {
        const rid = String(joinPayload.roomId || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
        roomId = rid;
        return send({
            type: "join",
            roomId: rid,
            create: joinPayload.create === true,
            public: joinPayload.public === true,
            skinName: joinPayload.skinName,
            color: joinPayload.color,
            ability: joinPayload.ability,
        });
    }

    function watchLobby() {
        return send({ type: "lobby" });
    }

    function leaveRoom() {
        const ok = send({ type: "leave" });
        peerId = null;
        roomId = null;
        peerCount = 0;
        return ok;
    }

    function leave() {
        suppressCloseNotify = true;
        const ws = socket;
        socket = null;
        connectPromise = null;
        peerId = null;
        roomId = null;
        peerCount = 0;
        if (ws) {
            try {
                if (ws.readyState === WebSocket.CLOSED) {
                    suppressCloseNotify = false;
                } else {
                    ws.close();
                }
            } catch (e) {
                suppressCloseNotify = false;
            }
        } else {
            suppressCloseNotify = false;
        }
    }

    function getMirrorSession() {
        return { peerId, roomId, peerCount, connected: !!(socket && socket.readyState === WebSocket.OPEN) };
    }

    global.NebulaMpMirror = {
        configureMpMirror,
        resolveRelayUrl,
        usesPublicRelay: pageUsesPublicRelay,
        getRelayUrl,
        setHandlers,
        connect,
        send,
        joinRoom,
        watchLobby,
        leaveRoom,
        leave,
        getMirrorSession,
    };
})(typeof window !== "undefined" ? window : globalThis);
