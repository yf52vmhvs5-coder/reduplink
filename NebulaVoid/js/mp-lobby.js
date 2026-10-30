/**
 * NEBULA VOID — multiplayer lobby UI (room code + relay via NebulaMpMirror).
 */
(function (global) {
    "use strict";

    const ROOM_CODE_LEN = 4;
    const MOCK_PEER_MS = 2800;
    const CHAT_MAX_LEN = 120;
    const CHAT_MIN_INTERVAL_MS = 700;
    const CHAT_LOG_MAX = 48;
    const CHAT_LOG_SCROLL_GAP_PX = 4;
    const CHAT_SEND_RETRY_MS = 200;
    const CHAT_SEND_FAIL_FLASH_MS = 1600;
    const DEFAULT_MAX_ROOM_PLAYERS = 6;
    const DEFAULT_MIN_PLAYERS_TO_START = 2;
    const PUBLIC_LIST_VISIBLE = 3;
    const MAX_CREATE_RETRIES = 5;

    /** @type {null | Record<string, unknown>} */
    let deps = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let mockPeerTimer = null;
    /** @type {null | { name?: string; color?: string; ability?: string; unlocked?: boolean }} */
    let lobbySkin = null;
    let relayBound = false;
    let chatOpen = false;
    let chatUnread = false;
    let lastChatSentAt = 0;
    /** @type {string} */
    let lastPeerChatDedupKey = "";
    /** @type {ReturnType<typeof setTimeout> | null} */
    let chatSendFailTimer = null;
    let chatSendFailLease = false;

    const state = {
        roomId: null,
        isHost: false,
        status: "idle",
        localPeerId: null,
        /** @type {boolean | null} */
        roomPublic: null,
    };

    let createPublic = true;
    let createRetryCount = 0;
    /** @type {{ roomId: string, host: string, n: number, max: number }[]} */
    let publicRoomsCache = [];

    /** @type {Record<string, { callsign?: string, skinName?: string, color?: string, ability?: string, isHost?: boolean }>} */
    let peerRoster = {};

    function roomLimits() {
        const cfg = deps && typeof deps.getMultiplayerConfig === "function" ? deps.getMultiplayerConfig() : null;
        const maxN = cfg && Number(cfg.maxRoomPlayers);
        const minN = cfg && Number(cfg.minPlayersToStart);
        return {
            max: Number.isFinite(maxN) && maxN >= 2 && maxN <= 12 ? maxN : DEFAULT_MAX_ROOM_PLAYERS,
            minStart:
                Number.isFinite(minN) && minN >= 2 && minN <= 12 ? minN : DEFAULT_MIN_PLAYERS_TO_START,
        };
    }

    function mirrorApi() {
        return global.NebulaMpMirror || null;
    }

    function clearMockTimer() {
        if (mockPeerTimer) {
            clearTimeout(mockPeerTimer);
            mockPeerTimer = null;
        }
    }

    function playHover() {
        try {
            if (deps && typeof deps.playHoverSound === "function") deps.playHoverSound();
        } catch (e) {}
    }

    function playChatReceive() {
        try {
            if (deps && typeof deps.playChatReceiveSound === "function") deps.playChatReceiveSound();
        } catch (e) {}
    }

    function nudgeChatToggle() {
        const toggle = deps && deps.dom && deps.dom.mpLobbyChatToggleBtn;
        if (!toggle || chatOpen) return;
        toggle.classList.remove("mp-lobby-chat-toggle--nudge");
        void toggle.offsetWidth;
        toggle.classList.add("mp-lobby-chat-toggle--nudge");
        window.setTimeout(() => {
            toggle.classList.remove("mp-lobby-chat-toggle--nudge");
        }, 450);
    }

    function setError(msg) {
        const el = deps && deps.dom && deps.dom.mpLobbyError;
        if (!el) return;
        if (chatSendFailTimer) {
            clearTimeout(chatSendFailTimer);
            chatSendFailTimer = null;
        }
        if (chatSendFailLease) {
            chatSendFailLease = false;
        }
        if (!msg) {
            el.hidden = true;
            el.textContent = "";
            return;
        }
        el.hidden = false;
        el.textContent = msg;
    }

    function bumpChatInput() {
        const input = deps && deps.dom && deps.dom.mpChatInput;
        if (!input) return;
        input.classList.remove("mp-lobby-chat-input--deny");
        void input.offsetWidth;
        input.classList.add("mp-lobby-chat-input--deny");
        window.setTimeout(() => {
            input.classList.remove("mp-lobby-chat-input--deny");
        }, 220);
    }

    function flashChatSendFailed() {
        const el = deps && deps.dom && deps.dom.mpLobbyError;
        if (!el || !chatOpen) {
            bumpChatInput();
            return;
        }
        if (!el.hidden && !chatSendFailLease) {
            bumpChatInput();
            return;
        }
        if (chatSendFailTimer) {
            clearTimeout(chatSendFailTimer);
            chatSendFailTimer = null;
        }
        chatSendFailLease = true;
        el.hidden = false;
        el.textContent = "SIGNAL NOT SENT";
        chatSendFailTimer = window.setTimeout(() => {
            chatSendFailTimer = null;
            if (!chatSendFailLease) return;
            chatSendFailLease = false;
            el.hidden = true;
            el.textContent = "";
        }, CHAT_SEND_FAIL_FLASH_MS);
        bumpChatInput();
    }

    function pulseChatSendButton() {
        const btn = deps && deps.dom && deps.dom.mpChatSendBtn;
        if (!btn) return;
        btn.disabled = true;
        window.setTimeout(() => {
            if (!deps || !deps.dom) return;
            const sendBtn = deps.dom.mpChatSendBtn;
            if (!sendBtn) return;
            if (isInRoom() && isRelayConnected()) sendBtn.disabled = false;
        }, CHAT_MIN_INTERVAL_MS);
    }

    function generateRoomCode() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < ROOM_CODE_LEN; i++) {
            code += chars[(Math.random() * chars.length) | 0];
        }
        return code;
    }

    function normalizeCode(raw) {
        return String(raw || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
    }

    function showPanel(mode) {
        const idle = deps.dom.mpLobbyPanelIdle;
        const waiting = deps.dom.mpLobbyPanelWaiting;
        if (idle) idle.hidden = mode !== "idle";
        if (waiting) waiting.hidden = mode !== "waiting" && mode !== "ready";
        syncLockButton();
        updateChatUi();
        renderPublicRooms();
    }

    function lobbyScreenEl() {
        return deps && deps.dom && deps.dom.multiplayerLobbyScreen;
    }

    function isInRoom() {
        return !!(state.roomId && (state.status === "waiting" || state.status === "ready"));
    }

    function isRelayConnected() {
        const api = mirrorApi();
        if (!api || typeof api.getMirrorSession !== "function") return false;
        const sess = api.getMirrorSession();
        return !!(sess && sess.connected && sess.roomId);
    }

    function isSocketOpen() {
        const api = mirrorApi();
        if (!api || typeof api.getMirrorSession !== "function") return false;
        const sess = api.getMirrorSession();
        return !!(sess && sess.connected);
    }

    function roomCodeBlock() {
        return document.getElementById("mpRoomCodeBlock");
    }

    function placeLockIcon() {
        const btn = deps && deps.dom && deps.dom.mpRoomLockBtn;
        const idle = deps && deps.dom && deps.dom.mpLobbyPanelIdle;
        const codeBlock = roomCodeBlock();
        if (!btn || !idle || !codeBlock) return;
        const inRoom = isInRoom();
        if (inRoom) {
            if (btn.parentNode !== codeBlock) codeBlock.insertBefore(btn, codeBlock.firstChild);
        } else if (btn.parentNode !== idle) {
            idle.appendChild(btn);
        }
        btn.classList.toggle("is-set", inRoom);
    }

    function syncLockButton() {
        const btn = deps && deps.dom && deps.dom.mpRoomLockBtn;
        if (!btn) return;
        placeLockIcon();
        const inRoom = isInRoom();
        if (inRoom && typeof state.roomPublic !== "boolean") {
            btn.hidden = true;
            return;
        }
        btn.hidden = false;
        const isPublic = inRoom ? state.roomPublic : createPublic;
        btn.classList.toggle("is-private", !isPublic);
        btn.setAttribute("aria-pressed", isPublic ? "false" : "true");
        btn.title = isPublic ? "PUBLIC" : "PRIVATE";
        btn.setAttribute("aria-label", isPublic ? "Room visibility: public" : "Room visibility: private");
    }

    function toggleCreatePublic() {
        if (isInRoom()) return;
        playHover();
        createPublic = !createPublic;
        syncLockButton();
    }

    function extraPublicRooms() {
        if (publicRoomsCache.length <= PUBLIC_LIST_VISIBLE) return [];
        return publicRoomsCache.slice(PUBLIC_LIST_VISIBLE);
    }

    function renderPublicRooms() {
        if (!deps || !deps.dom) return;
        const wrap = deps.dom.mpPublicRooms;
        const listEl = deps.dom.mpPublicRoomList;
        const findBtn = deps.dom.mpFindSignalBtn;
        if (!wrap || !listEl) return;
        const show = !isInRoom() && publicRoomsCache.length > 0;
        wrap.hidden = !show;
        listEl.textContent = "";
        if (!show) {
            if (findBtn) findBtn.hidden = true;
            return;
        }
        const visible = publicRoomsCache.slice(0, PUBLIC_LIST_VISIBLE);
        for (let i = 0; i < visible.length; i++) {
            const item = visible[i];
            const row = document.createElement("button");
            row.type = "button";
            row.className = "mp-public-room-row";
            row.dataset.roomId = item.roomId;
            const host = document.createElement("span");
            host.className = "mp-public-room-host";
            host.textContent = item.host || "VOID";
            const fill = document.createElement("span");
            fill.className = "mp-public-room-fill";
            const n = typeof item.n === "number" ? item.n : 0;
            const max = typeof item.max === "number" ? item.max : 6;
            fill.textContent = n + "/" + max;
            row.appendChild(host);
            row.appendChild(fill);
            row.setAttribute("aria-label", "Join " + (item.host || "signal") + " " + n + " of " + max);
            row.onclick = function () {
                playHover();
                joinListedRoom(item.roomId);
            };
            listEl.appendChild(row);
        }
        if (findBtn) findBtn.hidden = extraPublicRooms().length === 0;
    }

    function applyRoomList(msg) {
        const raw = msg && Array.isArray(msg.rooms) ? msg.rooms : [];
        const next = [];
        for (let i = 0; i < raw.length; i++) {
            const item = raw[i];
            if (!item || typeof item.roomId !== "string") continue;
            next.push({
                roomId: item.roomId,
                host: typeof item.host === "string" ? item.host : "",
                n: typeof item.n === "number" ? item.n : 0,
                max: typeof item.max === "number" ? item.max : 6,
            });
        }
        publicRoomsCache = next;
        renderPublicRooms();
    }

    function ensureLobbyWatch() {
        const api = mirrorApi();
        if (!api) return;
        bindMirrorHandlers();
        api
            .connect()
            .then(function () {
                if (!deps || isInRoom()) return;
                if (typeof api.watchLobby === "function") api.watchLobby();
            })
            .catch(function () {
                publicRoomsCache = [];
                renderPublicRooms();
            });
    }

    function resolvePeerCount(msg) {
        if (msg && typeof msg.peerCount === "number" && msg.peerCount >= 0) {
            return msg.peerCount;
        }
        const api = mirrorApi();
        if (api && typeof api.getMirrorSession === "function") {
            const sess = api.getMirrorSession();
            if (sess && typeof sess.peerCount === "number" && sess.peerCount >= 0) {
                return sess.peerCount;
            }
        }
        return 1;
    }

    function handleRelayConnectionLost() {
        publicRoomsCache = [];
        renderPublicRooms();
        const hadRoom = isInRoom();
        if (hadRoom && typeof deps.onRelayLost === "function") deps.onRelayLost();
        if (!hadRoom) return;
        clearMockTimer();
        leaveRelay();
        state.roomId = null;
        state.isHost = false;
        state.status = "idle";
        resetPeerRoster();
        lastChatSentAt = 0;
        setChatUnread(false);
        setChatOpen(false);
        clearChatLogs();
        setError("RELAY LOST");
        updateStatusUI();
        updateChatUi();
        if (typeof deps.ensureDrawLoop === "function") deps.ensureDrawLoop();
    }

    function syncLobbyPeerSession() {
        if (!isInRoom()) return;
        if (!isRelayConnected()) {
            handleRelayConnectionLost();
            return;
        }
        markReadyIfPeersLinked(resolvePeerCount(null));
    }

    function resetPeerRoster() {
        peerRoster = {};
        state.localPeerId = null;
        const remotes = global.NebulaMpRemotes;
        if (remotes && typeof remotes.clearRemotePeers === "function") remotes.clearRemotePeers();
    }

    function upsertRosterPeer(peerId, meta) {
        const id = String(peerId || "").trim();
        if (!id) return;
        const prev = peerRoster[id] || {};
        peerRoster[id] = {
            callsign: meta && meta.callsign != null ? meta.callsign : prev.callsign || "",
            skinName: meta && meta.skinName != null ? meta.skinName : prev.skinName || "",
            color: meta && meta.color != null ? meta.color : prev.color,
            ability: meta && meta.ability != null ? meta.ability : prev.ability,
            isHost: meta && typeof meta.isHost === "boolean" ? meta.isHost : prev.isHost,
        };
    }

    function removeRosterPeer(peerId) {
        const id = String(peerId || "").trim();
        if (!id || !peerRoster[id]) return;
        delete peerRoster[id];
    }

    function applyRosterFromServer(peers) {
        if (!Array.isArray(peers)) return;
        for (let i = 0; i < peers.length; i++) {
            const p = peers[i];
            if (!p || !p.peerId) continue;
            upsertRosterPeer(p.peerId, p);
            ensureRosterCallsign(p.peerId, p.callsign);
        }
    }

    function buildPeerOrder() {
        const ids = new Set();
        const local = state.localPeerId;
        if (local) ids.add(local);
        for (const id of Object.keys(peerRoster)) {
            if (id) ids.add(id);
        }
        return Array.from(ids).sort();
    }

    function updateLobbyPlayerCount() {
        if (!deps || !deps.dom) return;
        const el = deps.dom.mpLobbyPlayerCount;
        if (!el) return;
        const limits = roomLimits();
        if (!isInRoom()) {
            el.hidden = true;
            el.textContent = "";
            return;
        }
        const n = resolvePeerCount(null);
        el.hidden = false;
        el.textContent = `LINKED ${n} / ${limits.max}`;
    }

    function resolveCallsignForPeer(peerId, serverTag) {
        const api = global.NebulaMpCallsigns;
        if (api && typeof api.resolveCallsign === "function") {
            return api.resolveCallsign(peerId, serverTag);
        }
        const id = String(peerId || "").trim();
        const label = String(serverTag || (id && peerRoster[id] && peerRoster[id].callsign) || "")
            .replace(/[^A-Za-z0-9]/g, "")
            .trim()
            .slice(0, 5)
            .toUpperCase();
        return label;
    }

    function ensureRosterCallsign(peerId, serverTag) {
        const id = String(peerId || "").trim();
        if (!id) return;
        const tag = resolveCallsignForPeer(id, serverTag != null ? serverTag : peerRoster[id]?.callsign);
        if (!tag) return;
        upsertRosterPeer(id, { callsign: tag });
    }

    function peerCallsignLabel(peerId) {
        const id = String(peerId || "").trim();
        if (!id) return "";
        return resolveCallsignForPeer(id, peerRoster[id] && peerRoster[id].callsign);
    }

    function chatCallsignFromMessage(msg, peerId) {
        const pid = String(peerId || "").trim();
        const inline = msg && msg.callsign != null ? msg.callsign : "";
        const tag = resolveCallsignForPeer(pid, inline);
        if (pid && tag) ensureRosterCallsign(pid, inline || tag);
        return tag;
    }

    function formatIncomingChatLine(msg, text) {
        if (!isInRoom()) return text;
        const pid = msg && msg.fromPeerId;
        const label = chatCallsignFromMessage(msg, pid);
        if (!label) return text;
        return label + ": " + text;
    }

    function updateLobbyEntityLabel() {
        if (!deps || !deps.dom) return;
        const label = deps.dom.mpLobbyEntityLabel;
        if (!label) return;
        const skin = lobbySkin;
        const tag = peerCallsignLabel(state.localPeerId);
        if (skin && skin.name) {
            const ent = String(skin.name).toUpperCase();
            label.textContent = tag ? `ENTITY: ${ent} · ${tag}` : `ENTITY: ${ent}`;
        } else if (!isInRoom()) {
            label.textContent = "";
        }
    }

    function updateRoomLinkUi() {
        if (!deps || !deps.dom) return;
        const inRoom = isInRoom();
        const joinBtn = deps.dom.mpJoinRoomBtn;
        const codeInput = deps.dom.mpRoomCodeInput;
        const joinStack = deps.dom.mpLobbyJoinStack;
        if (joinStack) joinStack.classList.toggle("mp-lobby-join-stack--in-room", inRoom);
        if (codeInput) codeInput.hidden = inRoom;
        if (joinBtn) {
            joinBtn.textContent = inRoom ? "[ DISCONNECT ]" : "[ JOIN ]";
            joinBtn.setAttribute("aria-label", inRoom ? "Leave room" : "Join room");
        }
    }

    function sanitizeChatText(raw) {
        return String(raw || "")
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, CHAT_MAX_LEN);
    }

    function trimChatLog(logEl) {
        if (!logEl) return;
        while (logEl.childElementCount > CHAT_LOG_MAX) {
            logEl.removeChild(logEl.firstElementChild);
        }
    }

    function alignChatLogScroll(logEl) {
        if (!logEl || logEl.clientHeight <= 0) return;
        const maxScroll = Math.max(0, logEl.scrollHeight - logEl.clientHeight);
        logEl.scrollTop = maxScroll;
        const kids = logEl.children;
        for (let pass = 0; pass < 3; pass++) {
            const viewTop = logEl.scrollTop;
            let adjusted = false;
            for (let i = 0; i < kids.length; i++) {
                const el = kids[i];
                const top = el.offsetTop;
                const bottom = top + el.offsetHeight;
                if (bottom <= viewTop + 1) continue;
                if (top < viewTop - 1) {
                    const hideClipped = Math.min(bottom + CHAT_LOG_SCROLL_GAP_PX, maxScroll);
                    if (hideClipped > logEl.scrollTop && hideClipped <= maxScroll + 1) {
                        logEl.scrollTop = hideClipped;
                    } else {
                        logEl.scrollTop = Math.min(top, maxScroll);
                    }
                    adjusted = true;
                }
                break;
            }
            if (!adjusted) break;
        }
    }

    function scrollChatLogToLatest(logEl) {
        if (!logEl) return;
        alignChatLogScroll(logEl);
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => alignChatLogScroll(logEl));
        }
    }

    function appendChatBubble(side, text) {
        if (!deps || !deps.dom) return;
        const logEl = side === "self" ? deps.dom.mpChatLogSelf : deps.dom.mpChatLogPeer;
        if (!logEl || !text) return;
        const bubble = document.createElement("p");
        bubble.className = "mp-lobby-chat-bubble";
        bubble.textContent = text;
        logEl.appendChild(bubble);
        trimChatLog(logEl);
        scrollChatLogToLatest(logEl);
    }

    function clearChatLogs() {
        if (!deps || !deps.dom) return;
        const peer = deps.dom.mpChatLogPeer;
        const self = deps.dom.mpChatLogSelf;
        if (peer) peer.textContent = "";
        if (self) self.textContent = "";
        if (deps.dom.mpChatInput) deps.dom.mpChatInput.value = "";
        lastPeerChatDedupKey = "";
    }

    function setChatUnread(unread) {
        const wasUnread = chatUnread;
        chatUnread = !!unread;
        const toggle = deps && deps.dom && deps.dom.mpLobbyChatToggleBtn;
        if (toggle) toggle.classList.toggle("mp-lobby-chat-toggle--unread", chatUnread);
        if (chatUnread && !wasUnread && !chatOpen) {
            playChatReceive();
            nudgeChatToggle();
        }
    }

    function setChatOpen(open) {
        chatOpen = !!open;
        const screen = lobbyScreenEl();
        if (screen) screen.classList.toggle("mp-lobby-chat-open", chatOpen);
        const compose = deps.dom.mpLobbyChatCompose;
        if (compose) compose.hidden = !chatOpen;
        const toggle = deps.dom.mpLobbyChatToggleBtn;
        if (toggle) {
            toggle.setAttribute("aria-expanded", chatOpen ? "true" : "false");
            const unreadHint = chatUnread && !chatOpen ? " — new messages" : "";
            toggle.setAttribute(
                "aria-label",
                (chatOpen ? "Close room chat" : "Open room chat") + unreadHint
            );
        }
        if (chatOpen) {
            setChatUnread(false);
            if (toggle) {
                toggle.classList.remove("mp-lobby-chat-toggle--nudge");
            }
            scrollChatLogToLatest(deps.dom.mpChatLogPeer);
            scrollChatLogToLatest(deps.dom.mpChatLogSelf);
        }
        if (chatOpen && deps.dom.mpChatInput && !deps.dom.mpChatInput.disabled) {
            try {
                deps.dom.mpChatInput.focus();
            } catch (e) {}
        } else if (!chatOpen && deps.dom.mpChatInput && document.activeElement === deps.dom.mpChatInput) {
            try {
                deps.dom.mpChatInput.blur();
            } catch (e) {}
        }
    }

    function updateChatUi() {
        if (!deps || !deps.dom) return;
        const inRoom = isInRoom() && isRelayConnected();
        const toggle = deps.dom.mpLobbyChatToggleBtn;
        const input = deps.dom.mpChatInput;
        const sendBtn = deps.dom.mpChatSendBtn;
        if (toggle) toggle.hidden = !inRoom;
        if (input) input.disabled = !inRoom;
        if (sendBtn) sendBtn.disabled = !inRoom;
        if (!inRoom) setChatOpen(false);
    }

    function handleLobbyChatMessage(msg) {
        if (!msg || msg.type !== "chat") return;
        const text = sanitizeChatText(msg.text);
        if (!text) return;
        const t = typeof msg.t === "number" && Number.isFinite(msg.t) ? msg.t : 0;
        const from =
            typeof msg.fromPeerId === "string" ? msg.fromPeerId : "";
        const dedupKey = from + "\0" + t + "\0" + text;
        if (dedupKey === lastPeerChatDedupKey) return;
        lastPeerChatDedupKey = dedupKey;
        appendChatBubble("peer", formatIncomingChatLine(msg, text));
        if (!chatOpen) {
            if (chatUnread) {
                playChatReceive();
                nudgeChatToggle();
            }
            setChatUnread(true);
        }
    }

    function deliverChatSend(text, sentAt) {
        ensureRosterCallsign(state.localPeerId, null);
        const tag = peerCallsignLabel(state.localPeerId);
        const line = tag ? tag + ": " + text : text;
        appendChatBubble("self", line);
        const input = deps.dom.mpChatInput;
        if (input) input.value = "";
        lastChatSentAt = sentAt;
        pulseChatSendButton();
    }

    function trySendChatPayload(api, text, sentAt) {
        return api.send({ type: "chat", text, t: sentAt });
    }

    function sendLobbyChat() {
        if (!deps || !isInRoom() || !isRelayConnected()) return;
        const input = deps.dom.mpChatInput;
        const text = sanitizeChatText(input ? input.value : "");
        if (!text) return;
        const now = performance.now();
        if (now - lastChatSentAt < CHAT_MIN_INTERVAL_MS) {
            bumpChatInput();
            return;
        }
        const api = mirrorApi();
        if (!api || typeof api.send !== "function") {
            flashChatSendFailed();
            return;
        }
        if (trySendChatPayload(api, text, now)) {
            deliverChatSend(text, now);
            return;
        }
        window.setTimeout(() => {
            if (!deps || !isInRoom() || !isRelayConnected()) {
                flashChatSendFailed();
                return;
            }
            const retryAt = performance.now();
            if (retryAt - lastChatSentAt < CHAT_MIN_INTERVAL_MS) {
                bumpChatInput();
                return;
            }
            const retryApi = mirrorApi();
            if (!retryApi || typeof retryApi.send !== "function") {
                flashChatSendFailed();
                return;
            }
            if (trySendChatPayload(retryApi, text, retryAt)) {
                deliverChatSend(text, retryAt);
                return;
            }
            flashChatSendFailed();
        }, CHAT_SEND_RETRY_MS);
    }

    function isLobbyOverlayVisible() {
        const screen = lobbyScreenEl();
        return !!(screen && !screen.hidden && screen.classList.contains("menu-overlay-visible"));
    }

    function markReadyIfPeersLinked(peerCount) {
        const n = typeof peerCount === "number" ? peerCount : 0;
        const minStart = roomLimits().minStart;
        if (n < minStart) {
            if (state.status === "ready" && isInRoom()) {
                state.status = "waiting";
                updateStatusUI();
            }
            return;
        }
        if (state.status !== "waiting" && state.status !== "ready") return;
        if (state.status === "ready") {
            setError(null);
            updateLobbyPlayerCount();
            return;
        }
        state.status = "ready";
        setError(null);
        updateStatusUI();
        if (typeof deps.ensureDrawLoop === "function") deps.ensureDrawLoop();
    }

    function applyHostPeer(hostPeerId) {
        const hostId = String(hostPeerId || "").trim();
        if (!hostId || !state.localPeerId) return;
        state.isHost = hostId === state.localPeerId;
        const ids = Object.keys(peerRoster);
        for (let i = 0; i < ids.length; i++) {
            if (peerRoster[ids[i]]) peerRoster[ids[i]].isHost = ids[i] === hostId;
        }
        upsertRosterPeer(state.localPeerId, { isHost: state.isHost });
    }

    function abandonFailedJoin(message) {
        clearMockTimer();
        const api = mirrorApi();
        if (api && typeof api.leaveRoom === "function" && isSocketOpen()) {
            api.leaveRoom();
        }
        state.roomId = null;
        state.isHost = false;
        state.status = "idle";
        state.roomPublic = null;
        resetPeerRoster();
        lastChatSentAt = 0;
        setChatUnread(false);
        setChatOpen(false);
        clearChatLogs();
        setError(message);
        updateStatusUI();
        updateChatUi();
        ensureLobbyWatch();
    }

    function applyJoinedSession(msg) {
        if (!msg || typeof msg !== "object") return;
        if (typeof msg.peerId === "string") state.localPeerId = msg.peerId;
        if (typeof msg.isHost === "boolean") state.isHost = msg.isHost;
        applyRosterFromServer(msg.peers);
        if (state.localPeerId) {
            upsertRosterPeer(state.localPeerId, {
                isHost: state.isHost,
                callsign: msg.callsign,
            });
            ensureRosterCallsign(state.localPeerId, msg.callsign);
        }
        markReadyIfPeersLinked(resolvePeerCount(msg));
        updateLobbyPlayerCount();
        updateLobbyEntityLabel();
    }

    function updateStatusUI() {
        if (!deps) return;
        const statusEl = deps.dom.mpLobbyStatusText;
        const codeEl = deps.dom.mpRoomCodeDisplay;
        const startBtn = deps.dom.mpStartMatchBtn;

        if (codeEl) codeEl.textContent = state.roomId || "";

        if (state.status === "waiting") {
            if (statusEl) statusEl.textContent = "Waiting for players…";
            if (startBtn) {
                startBtn.hidden = true;
                startBtn.disabled = true;
            }
            showPanel("waiting");
        } else if (state.status === "ready") {
            if (statusEl) {
                const n = resolvePeerCount(null);
                statusEl.textContent = state.isHost
                    ? `${n} linked — start when ready`
                    : `${n} linked — waiting for host to start`;
            }
            if (startBtn) {
                const showStart = !!state.isHost;
                startBtn.hidden = !showStart;
                startBtn.disabled = !showStart;
                startBtn.setAttribute("aria-disabled", showStart ? "false" : "true");
            }
            showPanel("waiting");
        } else {
            if (startBtn) {
                startBtn.hidden = true;
                startBtn.disabled = true;
            }
            showPanel("idle");
            if (codeEl) codeEl.textContent = "";
            if (statusEl) statusEl.textContent = "";
        }
        updateRoomLinkUi();
        updateLobbyPlayerCount();
    }

    function scheduleMockPeer(delayMs) {
        clearMockTimer();
        mockPeerTimer = setTimeout(() => {
            mockPeerTimer = null;
            if (state.status !== "waiting") return;
            state.status = "ready";
            updateStatusUI();
            if (typeof deps.ensureDrawLoop === "function") deps.ensureDrawLoop();
        }, delayMs);
    }

    function allowMockFallback() {
        return deps && deps.allowMockPeerFallback === true;
    }

    function bindMirrorHandlers() {
        const api = mirrorApi();
        if (!api || relayBound) return;
        relayBound = true;
        api.setHandlers({
            onJoined: function (msg) {
                applyJoinedSession(msg);
            },
            onPeerJoined: function (msg) {
                setError(null);
                if (msg && msg.peerId) {
                    upsertRosterPeer(msg.peerId, {
                        callsign: msg.callsign,
                        skinName: msg.skinName,
                        color: msg.color,
                        ability: msg.ability,
                    });
                    ensureRosterCallsign(msg.peerId, msg.callsign);
                }
                markReadyIfPeersLinked(resolvePeerCount(msg));
                updateLobbyPlayerCount();
                updateLobbyEntityLabel();
            },
            onDisconnected: function () {
                publicRoomsCache = [];
                renderPublicRooms();
                handleRelayConnectionLost();
            },
            onPeerLeft: function (msg) {
                if (msg && msg.peerId) removeRosterPeer(msg.peerId);
                if (msg && typeof msg.hostPeerId === "string" && msg.hostPeerId) {
                    applyHostPeer(msg.hostPeerId);
                }
                if (!isInRoom()) {
                    if (typeof deps.onOpponentLeft === "function") deps.onOpponentLeft(msg);
                    return;
                }
                const n = resolvePeerCount(msg);
                const inMirror =
                    global.NebulaGameMode &&
                    typeof global.NebulaGameMode.getRunMode === "function" &&
                    global.NebulaGameMode.getRunMode() === "mirror";
                const minStart = roomLimits().minStart;
                if (!inMirror && n < minStart) {
                    state.status = "waiting";
                    setError("OPPONENT DISCONNECTED");
                } else if (!inMirror) {
                    setError(null);
                    if (state.status === "waiting") state.status = "ready";
                } else {
                    markReadyIfPeersLinked(n);
                }
                updateStatusUI();
                updateLobbyPlayerCount();
                if (typeof deps.onOpponentLeft === "function") deps.onOpponentLeft(msg);
            },
            onError: function (msg) {
                const code = msg && msg.code;
                if (code === "ROOM_TAKEN") {
                    retryCreateAfterTaken();
                    return;
                }
                if (code === "NO_ROOM") abandonFailedJoin("ROOM NOT FOUND");
                else if (code === "ROOM_FULL") abandonFailedJoin("ROOM FULL");
                else if (code === "BAD_ROOM") abandonFailedJoin("INVALID ROOM CODE");
                else if (code === "PUBLIC_FULL") abandonFailedJoin("OPEN SIGNAL FULL");
                else if (code === "MATCH_LIVE") {
                    if (typeof deps.onMatchLiveRejected === "function") deps.onMatchLiveRejected();
                    setError("MATCH STILL LIVE");
                } else setError("RELAY ERROR");
            },
            onRoomList: function (msg) {
                applyRoomList(msg);
            },
            onRelay: function (msg) {
                if (msg && msg.type === "chat") {
                    const inMirror =
                        global.NebulaGameMode &&
                        typeof global.NebulaGameMode.getRunMode === "function" &&
                        global.NebulaGameMode.getRunMode() === "mirror";
                    if (inMirror) {
                        if (typeof deps.onMirrorRelay === "function") deps.onMirrorRelay(msg);
                        return;
                    }
                    handleLobbyChatMessage(msg);
                    return;
                }
                if (msg && msg.type === "matchEnd") {
                    const inMirror =
                        global.NebulaGameMode &&
                        typeof global.NebulaGameMode.getRunMode === "function" &&
                        global.NebulaGameMode.getRunMode() === "mirror";
                    const relay = mirrorApi();
                    if (!inMirror && isInRoom() && relay && typeof relay.send === "function") {
                        relay.send({ type: "roomIdle" });
                    }
                }
                if (typeof deps.onMirrorRelay === "function") deps.onMirrorRelay(msg);
            },
        });
    }

    function leaveRelay() {
        const api = mirrorApi();
        if (api && typeof api.leave === "function") api.leave();
    }

    function skinJoinPayload() {
        if (!lobbySkin) return {};
        return {
            skinName: lobbySkin.name,
            color: lobbySkin.color,
            ability: lobbySkin.ability,
        };
    }

    function tryRelayJoin(roomId, creating, listedPublic) {
        const api = mirrorApi();
        if (!api) return Promise.resolve(false);
        bindMirrorHandlers();
        return api
            .connect()
            .then(function () {
                const ok = api.joinRoom({
                    roomId,
                    create: creating === true,
                    public: creating === true && createPublic,
                    ...skinJoinPayload(),
                });
                if (!ok) throw new Error("join send failed");
                state.roomId = roomId;
                state.status = "waiting";
                if (creating === true) state.roomPublic = createPublic;
                else if (listedPublic === true) state.roomPublic = true;
                else state.roomPublic = null;
                updateStatusUI();
                return true;
            })
            .catch(function () {
                leaveRelay();
                return false;
            });
    }

    function clearOptimisticRoom() {
        state.roomId = null;
        state.isHost = false;
        state.status = "idle";
        state.roomPublic = null;
        resetPeerRoster();
        lastChatSentAt = 0;
        updateStatusUI();
        updateChatUi();
    }

    function beginCreateRoom() {
        const code = generateRoomCode();
        tryRelayJoin(code, true).then(function (ok) {
            if (ok) {
                if (deps.dom.mpRoomCodeInput) deps.dom.mpRoomCodeInput.value = "";
                return;
            }
            if (allowMockFallback()) {
                state.roomId = code;
                state.isHost = true;
                state.status = "waiting";
                state.roomPublic = createPublic;
                updateStatusUI();
                scheduleMockPeer(MOCK_PEER_MS);
                if (deps.dom.mpRoomCodeInput) deps.dom.mpRoomCodeInput.value = "";
                return;
            }
            setError("RELAY OFF — RUN server\\start-relay.bat");
        });
    }

    function retryCreateAfterTaken() {
        createRetryCount += 1;
        clearMockTimer();
        clearOptimisticRoom();
        if (createRetryCount > MAX_CREATE_RETRIES) {
            setError("ROOM CODE IN USE");
            ensureLobbyWatch();
            return;
        }
        beginCreateRoom();
    }

    function onCreateRoom() {
        playHover();
        if (isInRoom()) return;
        createRetryCount = 0;
        setError(null);
        clearMockTimer();
        beginCreateRoom();
    }

    function joinListedRoom(roomId) {
        const code = normalizeCode(roomId);
        if (code.length < ROOM_CODE_LEN) return;
        if (isInRoom()) return;
        setError(null);
        clearMockTimer();
        tryRelayJoin(code, false, true).then(function (ok) {
            if (ok) {
                if (deps.dom.mpRoomCodeInput) deps.dom.mpRoomCodeInput.value = "";
                return;
            }
            setError("RELAY OFF — RUN server\\start-relay.bat");
        });
    }

    function onFindSignal() {
        playHover();
        if (isInRoom()) return;
        const extra = extraPublicRooms();
        if (!extra.length) return;
        joinListedRoom(extra[0].roomId);
    }

    function onJoinRoom() {
        playHover();
        const input = deps.dom.mpRoomCodeInput;
        const code = normalizeCode(input ? input.value : "");
        if (code.length < ROOM_CODE_LEN) {
            setError("ENTER A VALID ROOM CODE");
            return;
        }
        if (isInRoom()) return;
        setError(null);
        clearMockTimer();
        tryRelayJoin(code, false).then(function (ok) {
            if (ok) return;
            if (allowMockFallback()) {
                state.roomId = code;
                state.isHost = false;
                state.status = "waiting";
                state.roomPublic = null;
                updateStatusUI();
                scheduleMockPeer(Math.round(MOCK_PEER_MS * 0.65));
                return;
            }
            setError("RELAY OFF — RUN server\\start-relay.bat");
        });
    }

    function leaveMultiplayerRoom() {
        playHover();
        if (!isInRoom()) return;
        clearMockTimer();
        const api = mirrorApi();
        if (api && typeof api.leaveRoom === "function" && isSocketOpen()) {
            api.leaveRoom();
        } else {
            leaveRelay();
        }
        state.roomId = null;
        state.isHost = false;
        state.status = "idle";
        state.roomPublic = null;
        resetPeerRoster();
        lastChatSentAt = 0;
        setError(null);
        clearChatLogs();
        setChatUnread(false);
        setChatOpen(false);
        updateStatusUI();
        updateChatUi();
        ensureLobbyWatch();
    }

    function onRoomLinkButton() {
        if (isInRoom()) leaveMultiplayerRoom();
        else onJoinRoom();
    }

    function resetMultiplayerLobby() {
        clearMockTimer();
        leaveRelay();
        state.roomId = null;
        state.isHost = false;
        state.status = "idle";
        state.roomPublic = null;
        resetPeerRoster();
        lobbySkin = null;
        lastChatSentAt = 0;
        setError(null);
        clearChatLogs();
        setChatUnread(false);
        setChatOpen(false);
        if (deps && deps.dom.mpRoomCodeInput) deps.dom.mpRoomCodeInput.value = "";
        publicRoomsCache = [];
        updateStatusUI();
    }

    function openMultiplayerLobbySession(skin) {
        if (!deps) return;
        lobbySkin = skin || null;
        state.roomId = null;
        state.isHost = false;
        state.status = "idle";
        resetPeerRoster();
        clearMockTimer();
        setError(null);
        if (deps.dom.mpRoomCodeInput) deps.dom.mpRoomCodeInput.value = "";
        syncLockButton();
        updateLobbyEntityLabel();
        updateChatUi();
        updateStatusUI();
        ensureLobbyWatch();
    }

    function wireButtons() {
        const d = deps.dom;
        if (d.mpCreateRoomBtn) d.mpCreateRoomBtn.onclick = onCreateRoom;
        if (d.mpRoomLockBtn) d.mpRoomLockBtn.onclick = toggleCreatePublic;
        if (d.mpFindSignalBtn) d.mpFindSignalBtn.onclick = onFindSignal;
        if (d.mpJoinRoomBtn) d.mpJoinRoomBtn.onclick = onRoomLinkButton;
        if (d.mpRoomCodeInput) {
            d.mpRoomCodeInput.addEventListener("keydown", (e) => {
                if (e.code === "Enter") {
                    e.preventDefault();
                    if (isInRoom()) return;
                    onJoinRoom();
                }
            });
        }
        if (d.mpLobbyCancelHubBtn) {
            d.mpLobbyCancelHubBtn.onclick = () => {
                playHover();
                resetMultiplayerLobby();
                if (typeof deps.onLeaveToHub === "function") deps.onLeaveToHub();
            };
        }
        if (d.multiplayerLobbyBackBtn) {
            d.multiplayerLobbyBackBtn.onclick = () => {
                playHover();
                resetMultiplayerLobby();
                if (typeof deps.onReturnToEntitySelect === "function") deps.onReturnToEntitySelect();
            };
        }
        if (d.mpStartMatchBtn) {
            d.mpStartMatchBtn.onclick = () => {
                playHover();
                if (state.status !== "ready" || !lobbySkin || !state.isHost) return;
                if (typeof deps.onMirrorMatchRequested === "function") {
                    deps.onMirrorMatchRequested({
                        roomId: state.roomId,
                        isHost: state.isHost,
                        skin: lobbySkin,
                    });
                }
            };
        }
        if (d.mpLobbyChatToggleBtn) {
            d.mpLobbyChatToggleBtn.onclick = () => {
                playHover();
                if (!isInRoom() || !isRelayConnected()) return;
                setChatOpen(!chatOpen);
            };
            d.mpLobbyChatToggleBtn.addEventListener("keydown", (e) => {
                if (e.code !== "Enter" && e.code !== "NumpadEnter" && e.code !== "Space") return;
                e.preventDefault();
                if (!isInRoom() || !isRelayConnected()) return;
                setChatOpen(!chatOpen);
            });
        }
        if (d.mpChatSendBtn) {
            d.mpChatSendBtn.onclick = () => {
                playHover();
                sendLobbyChat();
            };
        }
        if (d.mpChatInput) {
            d.mpChatInput.addEventListener("keydown", (e) => {
                if (e.code === "Enter" || e.code === "NumpadEnter") {
                    e.preventDefault();
                    if (!chatOpen) return;
                    sendLobbyChat();
                }
            });
        }

        if (!global.__nebulaMpLobbyEnterGuard) {
            global.__nebulaMpLobbyEnterGuard = true;
            window.addEventListener(
                "keydown",
                (e) => {
                    if (e.code !== "Enter" && e.code !== "NumpadEnter") return;
                    if (!isLobbyOverlayVisible()) return;
                    const target = e.target;
                    if (chatOpen) {
                        if (target === d.mpChatInput) return;
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    if (state.status === "idle" && target === d.mpRoomCodeInput) return;
                    if (target === d.mpLobbyChatToggleBtn) return;
                    e.preventDefault();
                    e.stopPropagation();
                },
                true
            );
        }

        if (!global.__nebulaMpLobbyChatKeys) {
            global.__nebulaMpLobbyChatKeys = true;
            window.addEventListener(
                "keydown",
                (e) => {
                    if (!isLobbyOverlayVisible()) return;
                    if (e.code === "Escape") {
                        if (!chatOpen) return;
                        e.preventDefault();
                        setChatOpen(false);
                        return;
                    }
                    if (e.code !== "KeyT" || e.ctrlKey || e.metaKey || e.altKey) return;
                    if (!isInRoom() || !isRelayConnected()) return;
                    const target = e.target;
                    const tag = target && target.tagName;
                    if (tag === "INPUT" || tag === "TEXTAREA") {
                        if (target !== d.mpChatInput) return;
                        if (chatOpen) return;
                    } else if (target && target.isContentEditable) {
                        return;
                    }
                    if (chatOpen) return;
                    e.preventDefault();
                    setChatOpen(true);
                },
                true
            );
        }
    }

    function configureMpLobby(nextDeps) {
        if (!nextDeps || !nextDeps.dom) {
            throw new Error("configureMpLobby requires dom refs and callbacks");
        }
        deps = nextDeps;
        syncLockButton();
        wireButtons();
    }

    function resumeMultiplayerLobby(_opts) {
        if (!deps) return;
        updateLobbyEntityLabel();
        updateChatUi();
        updateStatusUI();
        syncLobbyPeerSession();
        const api = mirrorApi();
        if (isInRoom() && api && typeof api.send === "function") {
            api.send({ type: "roomIdle" });
        }
        if (!isInRoom()) ensureLobbyWatch();
    }

    function getMultiplayerLobbyState() {
        return {
            roomId: state.roomId,
            isHost: state.isHost,
            status: state.status,
            skin: lobbySkin,
            localPeerId: state.localPeerId,
            peerOrder: buildPeerOrder(),
            peerCount: resolvePeerCount(null),
        };
    }

    global.configureMpLobby = configureMpLobby;
    global.openMultiplayerLobbySession = openMultiplayerLobbySession;
    global.resetMultiplayerLobby = resetMultiplayerLobby;
    global.resumeMultiplayerLobby = resumeMultiplayerLobby;
    global.getMultiplayerLobbyState = getMultiplayerLobbyState;
    global.getPeerCallsign = peerCallsignLabel;
})(typeof window !== "undefined" ? window : globalThis);
