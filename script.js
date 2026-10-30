/**
 * SPACEJUNK studio deck.
 * Add a game by appending one object. Do not edit the page for that.
 *
 * {
 *   title: "NEBULA VOID",
 *   kind: "ARENA",
 *   status: "live",          // "live" or "hold"
 *   line: "One sentence.",
 *   href: "../NebulaVoid/index.html",   // omit or leave "" while the build is sealed
 *   web: true                           // browser badge (optional; defaults from href)
 * }
 */
(function () {
    "use strict";

    var GAMES = [
        {
            title: "NEBULA VOID",
            kind: "ARENA",
            status: "live",
            line: "The studio signature: a hungry singularity. Grow, or be pulled in.",
            href: "../NebulaVoid/index.html",
            web: true
        },
        {
            title: "COSMIC QUIZ",
            kind: "TRIVIA",
            status: "live",
            line: "Fifty questions on space, tech, and odd facts. Solo or pass a room code.",
            href: "../CosmicQuiz/index.html",
            web: true
        },
        {
            title: "CELL WARS",
            kind: "ARENA",
            status: "live",
            line: "Grow, split, dominate — retro phosphor and scanlines.",
            href: "../Cell%20War/index.html",
            web: true
        }
    ];

    var TINTS = [
        { color: "#ff2d2d", label: "Blood rift" },
        { color: "#ff2ed1", label: "Void signal" },
        { color: "#c86bff", label: "Phase glow" },
        { color: "#8a2be2", label: "Shifter" },
        { color: "#00e5ff", label: "Velocity" },
        { color: "#3da5ff", label: "Phase cage" },
        { color: "#39ff14", label: "Spore" },
        { color: "#ffdd22", label: "Bounty" }
    ];

    var TINT_KEY = "spacejunkStudioTint";

    function isHex(value) {
        return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
    }

    function readTint() {
        try {
            var saved = localStorage.getItem(TINT_KEY);
            if (saved && isHex(saved.toLowerCase())) return saved.toLowerCase();
        } catch (err) {
            /* private mode */
        }
        return TINTS[0].color;
    }

    function applyTint(color) {
        document.documentElement.style.setProperty("--signal", color);
        var buttons = document.querySelectorAll(".swatch");
        for (var i = 0; i < buttons.length; i++) {
            var on = buttons[i].getAttribute("data-color") === color;
            buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
        }
    }

    function buildTints() {
        var row = document.getElementById("tints");
        if (!row) return;
        var current = readTint();
        TINTS.forEach(function (entry) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "swatch";
            btn.style.setProperty("--swatch", entry.color);
            btn.setAttribute("data-color", entry.color);
            btn.setAttribute("aria-label", entry.label);
            btn.title = entry.label;
            btn.addEventListener("click", function () {
                applyTint(entry.color);
                try {
                    localStorage.setItem(TINT_KEY, entry.color);
                } catch (err) {
                    /* ignore */
                }
            });
            row.appendChild(btn);
        });
        applyTint(current);
    }

    function strokeEl(ns, tag, attrs) {
        var el = document.createElementNS(ns, tag);
        var key;
        for (key in attrs) {
            if (Object.prototype.hasOwnProperty.call(attrs, key)) {
                el.setAttribute(key, attrs[key]);
            }
        }
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", "currentColor");
        el.setAttribute("stroke-width", "1.2");
        el.setAttribute("stroke-linecap", "round");
        el.setAttribute("stroke-linejoin", "round");
        return el;
    }

    function browserBadgeIcon() {
        var ns = "http://www.w3.org/2000/svg";
        var svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        svg.appendChild(
            strokeEl(ns, "circle", {
                cx: "12",
                cy: "12",
                r: "7.75"
            })
        );
        svg.appendChild(strokeEl(ns, "path", { d: "M4.25 12h15.5" }));
        svg.appendChild(
            strokeEl(ns, "path", {
                d: "M12 4.25c2.05 2.25 3.15 4.4 3.15 7.75s-1.1 5.5-3.15 7.75c-2.05-2.25-3.15-4.4-3.15-7.75s1.1-5.5 3.15-7.75z"
            })
        );
        return svg;
    }

    function gameWebCompat(game) {
        if (game.web === true) return true;
        if (game.web === false) return false;
        return !!game.href;
    }

    function browserBadge() {
        var el = document.createElement("span");
        el.className = "card-platform card-platform--on";
        el.title = "Runs in browser";
        var hidden = document.createElement("span");
        hidden.className = "card-platform__label";
        hidden.textContent = "Browser";
        el.appendChild(hidden);
        el.appendChild(browserBadgeIcon());
        return el;
    }

    function cardPlatforms(game) {
        if (!gameWebCompat(game)) return null;
        var wrap = document.createElement("div");
        wrap.className = "card-platforms";
        wrap.setAttribute("role", "img");
        wrap.setAttribute("aria-label", "Runs in browser");
        wrap.appendChild(browserBadge());
        return wrap;
    }

    function card(game) {
        var live = game.status === "live" && game.href;
        var li = document.createElement("li");
        li.className = "card " + (live ? "card--live" : "card--hold");

        var kicker = document.createElement("p");
        kicker.className = "card-kicker";
        var kind = document.createElement("span");
        kind.textContent = game.kind || "SIGNAL";
        var state = document.createElement("span");
        state.textContent = live ? "LIVE" : "SEALED";
        kicker.appendChild(kind);
        kicker.appendChild(state);

        var title = document.createElement("h3");
        title.textContent = game.title || "UNTITLED";

        var blurb = document.createElement("p");
        blurb.className = "blurb";
        blurb.textContent = game.line || "";

        li.appendChild(kicker);
        li.appendChild(title);
        li.appendChild(blurb);

        var foot = document.createElement("div");
        foot.className = "card-foot";

        if (live) {
            var link = document.createElement("a");
            link.className = "open";
            link.href = game.href;
            link.textContent = "[ OPEN ]";
            if (/^https?:\/\//.test(game.href)) {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
            }
            foot.appendChild(link);
        } else {
            var seal = document.createElement("span");
            seal.className = "sealed";
            seal.textContent = "[ SEALED ]";
            foot.appendChild(seal);
        }

        var platforms = cardPlatforms(game);
        if (platforms) foot.appendChild(platforms);
        li.appendChild(foot);
        return li;
    }

    function buildDeck() {
        var deck = document.getElementById("deck");
        var count = document.getElementById("signalCount");
        if (!deck) return;
        var live = 0;
        GAMES.forEach(function (game) {
            if (game.status === "live" && game.href) live += 1;
            deck.appendChild(card(game));
        });
        if (count) {
            count.textContent = live + " LIVE / " + GAMES.length;
        }
    }

    function paintField() {
        var canvas = document.getElementById("field");
        if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        var ctx = canvas.getContext("2d");
        var stars = [];
        var running = true;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            var n = Math.round((canvas.width * canvas.height) / 18000);
            stars = [];
            for (var i = 0; i < n; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    r: Math.random() * 1.2 + 0.3,
                    v: Math.random() * 0.15 + 0.04,
                    a: Math.random() * 0.45 + 0.15
                });
            }
        }

        function frame() {
            if (!running) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (var i = 0; i < stars.length; i++) {
                var s = stars[i];
                s.y += s.v;
                if (s.y > canvas.height) s.y = 0;
                ctx.globalAlpha = s.a;
                ctx.fillStyle = "#f4f4f4";
                ctx.fillRect(s.x, s.y, s.r, s.r);
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(frame);
        }

        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", function () {
            var hidden = document.hidden;
            if (hidden) running = false;
            else if (!running) {
                running = true;
                frame();
            }
        });
        frame();
    }

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
    buildTints();
    buildDeck();
    paintField();
})();
