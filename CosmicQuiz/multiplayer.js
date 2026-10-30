/**
 * Cosmic Quiz — Online lobby (PeerJS)
 *
 * Host/guest rooms (max 2 players): room codes, WebRTC data channel,
 * status + message callbacks. Exposes window.CosmicLobby for script.js.
 */
(function () {
    'use strict';

    // =========================================================================
    // CONSTANTS & CONFIGURATION
    // Room code alphabet/length and PeerJS cloud + STUN settings.
    // =========================================================================
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const CODE_LENGTH = 6;
    const PEER_OPTS = {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 1,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ],
        },
    };

    // =========================================================================
    // MODULE STATE
    // Peer instance, active connection, role (host/guest), event handlers.
    // =========================================================================
    let peer = null;
    let conn = null;
    let role = null;
    let roomCode = null;
    let messageHandler = null;
    let statusHandler = null;
    let roomTask = null;

    // =========================================================================
    // EVENT EMITTERS
    // Forward PeerJS events to script.js via onStatus / onMessage callbacks.
    // =========================================================================
    function emitStatus(status, detail) {
        if (statusHandler) statusHandler(status, detail || {});
    }

    function emitMessage(data) {
        if (messageHandler) messageHandler(data);
    }

    // =========================================================================
    // ROOM CODE GENERATION
    // 6-char host codes and unique guest Peer IDs (G + alphanumeric).
    // =========================================================================
    function generateCode() {
        let code = '';
        for (let i = 0; i < CODE_LENGTH; i++) {
            code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        }
        return code;
    }

    function generateGuestId() {
        return 'G' + generateCode() + generateCode().slice(0, 2);
    }

    // =========================================================================
    // CLEANUP
    // Tear down data connection and Peer instance; reset role and room code.
    // =========================================================================
    function destroyPeer() {
        if (conn) {
            try {
                conn.close();
            } catch (_) { /* ignore */ }
            conn = null;
        }
        if (peer) {
            try {
                peer.destroy();
            } catch (_) { /* ignore */ }
            peer = null;
        }
        role = null;
        roomCode = null;
    }

    // =========================================================================
    // CONNECTION LIFECYCLE
    // Wire open/data/close/error on the active host↔guest data channel.
    // =========================================================================
    function bindConnection(connection) {
        conn = connection;

        const onConnOpen = () => {
            emitStatus('connected', { role, roomCode });
        };

        if (connection.open) {
            onConnOpen();
        } else {
            connection.on('open', onConnOpen);
        }

        connection.on('data', (data) => {
            emitMessage(data);
        });

        connection.on('close', () => {
            conn = null;
            emitStatus('peer_left');
        });

        connection.on('error', () => {
            emitStatus('error', { message: 'Connection lost' });
        });
    }

    // =========================================================================
    // CONNECTION PROMISES
    // Timeboxed waits for Peer open and guest→host connection open.
    // =========================================================================
    function waitForPeerOpen(peerInstance, timeoutMs) {
        return new Promise((resolve, reject) => {
            if (peerInstance.destroyed) {
                reject(new Error('Peer unavailable'));
                return;
            }

            if (peerInstance.open) {
                resolve(peerInstance.id);
                return;
            }

            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Peer connection timed out'));
            }, timeoutMs);

            const cleanup = () => {
                clearTimeout(timer);
                peerInstance.off('open', onOpen);
                peerInstance.off('error', onError);
            };

            const onOpen = (id) => {
                cleanup();
                resolve(id);
            };

            const onError = (err) => {
                cleanup();
                reject(err);
            };

            peerInstance.on('open', onOpen);
            peerInstance.on('error', onError);
        });
    }

    function waitForConnectionOpen(connection, timeoutMs) {
        return new Promise((resolve, reject) => {
            if (connection.open) {
                resolve(connection);
                return;
            }

            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Room connection timed out'));
            }, timeoutMs);

            const cleanup = () => {
                clearTimeout(timer);
                connection.off('open', onOpen);
                connection.off('error', onError);
                connection.off('close', onClose);
            };

            const onOpen = () => {
                cleanup();
                resolve(connection);
            };

            const onError = (err) => {
                cleanup();
                reject(err || new Error('Could not reach room'));
            };

            const onClose = () => {
                cleanup();
                reject(new Error('Connection closed'));
            };

            connection.on('open', onOpen);
            connection.on('error', onError);
            connection.on('close', onClose);
        });
    }

    // =========================================================================
    // PEER SETUP
    // Factory for Peer instances and user-facing error mapping.
    // =========================================================================
    function createPeer(id) {
        return new Peer(id, PEER_OPTS);
    }

    function attachPeerErrors(context) {
        peer.on('error', (err) => {
            const type = err && err.type;
            let message = 'Connection error';

            if (type === 'unavailable-id') message = 'Room code in use, try again';
            else if (type === 'peer-unavailable') message = 'Room not found — check the code';
            else if (type === 'network' || type === 'disconnected') {
                message = 'Network error — check internet and retry';
            } else if (type === 'browser-incompatible') {
                message = 'Browser does not support online play';
            }

            if (!conn || context === 'join') {
                emitStatus('error', { message });
            }
        });
    }

    // =========================================================================
    // ROOM OPERATIONS
    // createRoom (host, retry on code collision) and joinRoom (guest + hello).
    // =========================================================================
    async function createRoom() {
        if (roomTask) return roomTask;
        roomTask = createRoomNow();
        try {
            return await roomTask;
        } finally {
            roomTask = null;
        }
    }

    async function createRoomNow() {
        destroyPeer();
        emitStatus('connecting', { message: 'Creating room…', hidePanels: true });

        let attempts = 0;
        while (attempts < 8) {
            const code = generateCode();
            attempts++;

            try {
                peer = createPeer(code);
                attachPeerErrors('host');

                peer.on('connection', (connection) => {
                    if (conn) {
                        connection.close();
                        return;
                    }
                    bindConnection(connection);
                });

                const id = await waitForPeerOpen(peer, 15000);
                role = 'host';
                roomCode = id;
                emitStatus('hosting', { roomCode: id });
                return id;
            } catch (err) {
                destroyPeer();
                if (err && (err.type === 'unavailable-id' || /unavailable/i.test(err.message || ''))) {
                    continue;
                }
                emitStatus('error', { message: 'Could not create room' });
                throw err;
            }
        }

        emitStatus('error', { message: 'Could not create room' });
        throw new Error('Could not create room');
    }

    async function joinRoom(code) {
        if (roomTask) return roomTask;
        roomTask = joinRoomNow(code);
        try {
            return await roomTask;
        } finally {
            roomTask = null;
        }
    }

    async function joinRoomNow(code) {
        const normalized = String(code || '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, CODE_LENGTH);

        if (normalized.length < CODE_LENGTH) {
            emitStatus('error', { message: 'Enter a valid 6-character room code' });
            throw new Error('Invalid code');
        }

        destroyPeer();
        emitStatus('connecting', { message: `Joining room ${normalized}…` });

        const guestId = generateGuestId();
        peer = createPeer(guestId);
        attachPeerErrors('join');

        try {
            await waitForPeerOpen(peer, 15000);

            const connection = peer.connect(normalized, { reliable: true });
            role = 'guest';
            roomCode = normalized;

            await waitForConnectionOpen(connection, 25000);

            bindConnection(connection);
            setTimeout(() => send({ type: 'hello' }), 150);

            return normalized;
        } catch (err) {
            destroyPeer();
            const msg =
                err && err.message === 'Room connection timed out'
                    ? 'Could not join — is the host still in the room?'
                    : 'Could not join room — check the code';
            emitStatus('error', { message: msg });
            throw err;
        }
    }

    // =========================================================================
    // PUBLIC API
    // send, role/connection helpers, callbacks, leave, window.CosmicLobby.
    // =========================================================================
    function send(data) {
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    function isConnected() {
        return !!(conn && conn.open);
    }

    function isHost() {
        return role === 'host';
    }

    function isGuest() {
        return role === 'guest';
    }

    function getRole() {
        return role;
    }

    function getRoomCode() {
        return roomCode;
    }

    function onMessage(handler) {
        messageHandler = handler;
    }

    function onStatus(handler) {
        statusHandler = handler;
    }

    function leave() {
        destroyPeer();
        emitStatus('idle');
    }

    window.CosmicLobby = {
        createRoom,
        joinRoom,
        send,
        leave,
        onMessage,
        onStatus,
        isConnected,
        isHost,
        isGuest,
        getRole,
        getRoomCode,
    };
})();
