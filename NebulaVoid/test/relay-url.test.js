"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MP = {
    relayWsUrl: "ws://127.0.0.1:8080",
    relayWsUrlPublic: "wss://reduplink-nebula-relay.onrender.com",
};

function loadMirror(location) {
    const sandbox = { console, setTimeout, clearTimeout, URL };
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    if (location) sandbox.location = location;
    vm.createContext(sandbox);
    const file = path.join(__dirname, "../js/mp-mirror.js");
    vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: "js/mp-mirror.js" });
    return sandbox.NebulaMpMirror;
}

describe("relay url selection", () => {
    it("keeps localhost, loopback, and file pages on the local relay", () => {
        const pages = [
            null,
            { protocol: "file:", hostname: "" },
            { protocol: "http:", hostname: "localhost" },
            { protocol: "http:", hostname: "127.0.0.1" },
            { protocol: "http:", hostname: "[::1]" },
        ];
        for (const location of pages) {
            const mirror = loadMirror(location);
            assert.equal(mirror.resolveRelayUrl(MP), MP.relayWsUrl);
            assert.equal(mirror.usesPublicRelay(), false);
        }
    });

    it("points a LAN page at the relay on that same host", () => {
        const cases = [
            ["192.168.1.20", "ws://192.168.1.20:8080"],
            ["10.0.0.4", "ws://10.0.0.4:8080"],
            ["172.16.5.8", "ws://172.16.5.8:8080"],
            ["my-pc.local", "ws://my-pc.local:8080"],
        ];
        for (let i = 0; i < cases.length; i++) {
            const mirror = loadMirror({ protocol: "http:", hostname: cases[i][0] });
            assert.equal(mirror.usesPublicRelay(), false);
            assert.equal(mirror.resolveRelayUrl(MP), cases[i][1]);
        }
        const customPort = loadMirror({ protocol: "http:", hostname: "192.168.0.12" });
        assert.equal(
            customPort.resolveRelayUrl({ relayWsUrl: "ws://127.0.0.1:9090" }),
            "ws://192.168.0.12:9090"
        );
    });

    it("uses the public relay on GitHub Pages", () => {
        const mirror = loadMirror({
            protocol: "https:",
            hostname: "yf52vmhvs5-coder.github.io",
        });
        assert.equal(mirror.usesPublicRelay(), true);
        assert.equal(mirror.resolveRelayUrl(MP), MP.relayWsUrlPublic);
        mirror.configureMpMirror({ relayWsUrl: mirror.resolveRelayUrl(MP) });
        assert.equal(mirror.getRelayUrl(), MP.relayWsUrlPublic);
    });

    it("keeps an explicit relay url even on a public page", () => {
        const mirror = loadMirror({
            protocol: "https:",
            hostname: "yf52vmhvs5-coder.github.io",
        });
        mirror.configureMpMirror({ relayWsUrl: "ws://127.0.0.1:9999" });
        assert.equal(mirror.getRelayUrl(), "ws://127.0.0.1:9999");
    });

    it("stays on the local relay when the public url is missing", () => {
        const mirror = loadMirror({
            protocol: "https:",
            hostname: "yf52vmhvs5-coder.github.io",
        });
        assert.equal(
            mirror.resolveRelayUrl({ relayWsUrl: "ws://127.0.0.1:8080" }),
            "ws://127.0.0.1:8080"
        );
    });
});
