/**
 * Studio deck. One object per game, in the order the page shows them.
 * After a change, run: node studio/stamp.js
 * That refreshes the no-JS cards in index.html and the Signals table in README.md.
 *
 * id: unique slug
 * status: "live" (needs href), "hold", or "sealed"
 * href: omit or leave "" while the build is sealed
 * info: optional dossier; does not replace [ OPEN ]
 * web / tablet: platform badges. tabletLine: optional tablet tooltip
 * summary: optional phrase for the README table; otherwise kind is used
 */
(function (root) {
    "use strict";

    var GAMES = [
        {
            id: "nebula-void",
            title: "NEBULA VOID",
            kind: "ARENA",
            status: "live",
            line: "Survival arena in a drifting starfield. Consume, chain kills, and beat the pull — solo or multiplayer.",
            href: "NebulaVoid/index.html",
            info: "NebulaVoid/brief.html",
            summary: "Survival arena",
            web: true
        },
        {
            id: "cosmic-quiz",
            title: "COSMIC QUIZ",
            kind: "TRIVIA",
            status: "live",
            line: "Fifty questions on space, tech, and in-between facts. Classic, Survival, or Blitz — solo or a shared room code.",
            href: "CosmicQuiz/index.html",
            summary: "Trivia",
            web: true,
            tablet: true,
            tabletLine: "Touch layout sized for the tablet. Same modes and room code — not a shrunk desktop page."
        },
        {
            id: "cell-wars",
            title: "CELL WARS",
            kind: "ARENA",
            status: "live",
            line: "Mass-and-split arena on phosphor and scanlines. Outgrow the bots with mouse and keys, or the tablet pad.",
            href: "Cell War/index.html",
            summary: "Mass-and-split arena",
            web: true,
            tablet: true
        }
    ];

    function review(list) {
        var problems = [];
        var games = [];
        var seen = Object.create(null);
        if (!Array.isArray(list)) {
            return { games: games, problems: ["Catalog is not a list."] };
        }
        for (var i = 0; i < list.length; i++) {
            var game = list[i];
            var label = "entry " + (i + 1);
            var reasons = [];
            if (!game || typeof game !== "object") {
                problems.push(label + " is not an object.");
                continue;
            }
            if (typeof game.id === "string" && game.id) label = game.id;
            if (typeof game.id !== "string" || !game.id) reasons.push("needs a string id");
            else if (seen[game.id]) reasons.push("duplicates id " + game.id);
            else seen[game.id] = true;
            if (typeof game.title !== "string" || !game.title) reasons.push("needs a title");
            if (typeof game.kind !== "string" || !game.kind) reasons.push("needs a kind");
            if (game.status !== "live" && game.status !== "hold" && game.status !== "sealed") {
                reasons.push("has status \"" + game.status + "\"");
            }
            if (game.status === "live" && (typeof game.href !== "string" || !game.href)) {
                reasons.push("is live without href");
            }
            if (reasons.length) {
                problems.push(label + " " + reasons.join("; ") + ".");
                continue;
            }
            games.push(game);
        }
        return { games: games, problems: problems };
    }

    var report = review(GAMES);

    if (typeof module !== "undefined" && module.exports) {
        module.exports = report;
    } else {
        report.problems.forEach(function (msg) {
            console.error("REDUPLINK: " + msg);
        });
        root.STUDIO_GAMES = report.games;
    }
})(typeof window !== "undefined" ? window : {});
