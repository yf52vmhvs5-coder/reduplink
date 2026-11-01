/**
 * SPACEJUNK transmissions guestbook.
 * Isolated from the studio deck: a failure here must not touch tint, cards, or the field.
 */
(function () {
    "use strict";

    var ROOT = "https://yhpylsuskkdqsvlvmzsr.supabase.co";
    var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlocHlsc3Vza2tkcXN2bHZtenNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NDk0ODcsImV4cCI6MjEwOTEyNTQ4N30.qfN0crRaW5bO7SH41GcqozgndyMCyDxlzpPD5jAgRzE";
    var ACK_KEY = "spacejunkStudioAcked";
    var SENT_KEY = "spacejunkTxSentAt";
    var SEND_WAIT_MS = 30000;

    var form = document.getElementById("txForm");
    var list = document.getElementById("txList");
    var statusEl = document.getElementById("txStatus");
    var liveCount = document.getElementById("txLiveCount");
    var ackBtn = document.getElementById("txAck");
    var ackCount = document.getElementById("txAckCount");
    var callsignEl = document.getElementById("txCallsign");
    var bodyEl = document.getElementById("txBody");
    if (!form || !list || !ackBtn) return;

    function headers(extra) {
        var out = {
            apikey: KEY,
            Authorization: "Bearer " + KEY,
            Accept: "application/json"
        };
        var key;
        if (extra) {
            for (key in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key];
            }
        }
        return out;
    }

    function alreadyAcked() {
        try {
            return localStorage.getItem(ACK_KEY) === "1";
        } catch (err) {
            return false;
        }
    }

    function markAcked() {
        try {
            localStorage.setItem(ACK_KEY, "1");
        } catch (err) {
            /* private mode */
        }
    }

    function lastSentAt() {
        try {
            return parseInt(sessionStorage.getItem(SENT_KEY) || "0", 10) || 0;
        } catch (err) {
            return 0;
        }
    }

    function markSent() {
        try {
            sessionStorage.setItem(SENT_KEY, String(Date.now()));
        } catch (err) {
            /* private mode */
        }
    }

    function setStatus(text, ok) {
        if (!statusEl) return;
        if (!text) {
            statusEl.hidden = true;
            statusEl.textContent = "";
            statusEl.classList.remove("tx-status--ok");
            return;
        }
        statusEl.hidden = false;
        statusEl.textContent = text;
        if (ok) statusEl.classList.add("tx-status--ok");
        else statusEl.classList.remove("tx-status--ok");
    }

    function showAckCount(n) {
        var value = Math.max(0, parseInt(n, 10) || 0);
        if (!ackCount) return;
        if (value <= 0) {
            ackCount.hidden = true;
            ackCount.textContent = "";
            return;
        }
        ackCount.hidden = false;
        ackCount.textContent = String(value);
    }

    function setPressed(on) {
        ackBtn.setAttribute("aria-pressed", on ? "true" : "false");
        ackBtn.setAttribute("aria-label", on ? "Liked this studio" : "Like this studio");
    }

    function ago(iso) {
        var then = Date.parse(iso);
        if (!then) return "";
        var s = Math.max(0, Math.floor((Date.now() - then) / 1000));
        if (s < 45) return "NOW";
        if (s < 3600) return Math.floor(s / 60) + "M";
        if (s < 86400) return Math.floor(s / 3600) + "H";
        if (s < 86400 * 14) return Math.floor(s / 86400) + "D";
        try {
            return new Date(then).toISOString().slice(0, 10);
        } catch (err) {
            return "";
        }
    }

    function renderList(rows) {
        list.textContent = "";
        if (!rows || !rows.length) {
            var empty = document.createElement("li");
            empty.className = "tx-empty";
            empty.textContent = "Frequency dark.";
            list.appendChild(empty);
            if (liveCount) liveCount.textContent = "QUIET";
            return;
        }
        if (liveCount) liveCount.textContent = rows.length + " LIVE";
        rows.forEach(function (row) {
            var item = document.createElement("li");
            item.className = "tx-item";
            var meta = document.createElement("p");
            meta.className = "tx-item-meta";
            var who = document.createElement("span");
            who.textContent = row.callsign || "UNKNOWN";
            var when = document.createElement("span");
            when.textContent = ago(row.created_at);
            meta.appendChild(who);
            meta.appendChild(when);
            var body = document.createElement("p");
            body.className = "tx-item-body";
            body.textContent = row.body || "";
            item.appendChild(meta);
            item.appendChild(body);
            list.appendChild(item);
        });
    }

    function api(path, opts) {
        return fetch(ROOT + path, opts).then(function (res) {
            if (!res.ok) {
                return res.text().then(function (text) {
                    throw new Error(text || String(res.status));
                });
            }
            if (res.status === 204) return null;
            var type = res.headers.get("content-type") || "";
            if (type.indexOf("json") === -1) return null;
            return res.json();
        });
    }

    function loadAcks() {
        return api("/rest/v1/studio_acks?select=count&id=eq.1", {
            headers: headers()
        }).then(function (rows) {
            var n = rows && rows[0] ? rows[0].count : 0;
            showAckCount(n);
        }).catch(function () {
            /* keep the rest of the page quiet */
        });
    }

    function loadPings() {
        return api(
            "/rest/v1/transmissions?select=id,callsign,body,created_at&live=eq.true&order=created_at.desc&limit=40",
            { headers: headers() }
        ).then(function (rows) {
            renderList(Array.isArray(rows) ? rows : []);
        }).catch(function () {
            renderList([]);
            setStatus("Uplink dark.");
        });
    }

    function sendPing() {
        if (alreadyAcked()) return Promise.resolve();
        ackBtn.disabled = true;
        return api("/rest/v1/rpc/ping_studio", {
            method: "POST",
            headers: headers({ "Content-Type": "application/json" }),
            body: "{}"
        }).then(function (count) {
            markAcked();
            setPressed(true);
            if (typeof count === "number") showAckCount(count);
            else return loadAcks();
        }).catch(function () {
            setStatus("Ping failed.");
        }).then(function () {
            ackBtn.disabled = false;
        });
    }

    function cleanCallsign(raw) {
        var text = String(raw || "").replace(/\s+/g, " ").trim();
        if (!text) return "UNKNOWN";
        return text.slice(0, 16);
    }

    function cleanBody(raw) {
        return String(raw || "").replace(/\r\n/g, "\n").trim().slice(0, 280);
    }

    ackBtn.addEventListener("click", function () {
        if (alreadyAcked()) return;
        sendPing();
    });

    form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var body = cleanBody(bodyEl && bodyEl.value);
        if (body.length < 1) {
            setStatus("Write a short signal.");
            return;
        }
        var wait = Date.now() - lastSentAt();
        if (wait < SEND_WAIT_MS) {
            setStatus("Hold — wait a moment before the next ping.");
            return;
        }
        var send = form.querySelector(".tx-send");
        if (send) send.disabled = true;
        api("/rest/v1/transmissions", {
            method: "POST",
            headers: headers({
                "Content-Type": "application/json",
                Prefer: "return=minimal"
            }),
            body: JSON.stringify({
                callsign: cleanCallsign(callsignEl && callsignEl.value),
                body: body
            })
        }).then(function () {
            markSent();
            if (bodyEl) bodyEl.value = "";
            setStatus("HELD. It goes live after ACK.", true);
        }).catch(function () {
            setStatus("Transmit failed.");
        }).then(function () {
            if (send) send.disabled = false;
        });
    });

    setPressed(alreadyAcked());
    loadAcks();
    loadPings();
})();
