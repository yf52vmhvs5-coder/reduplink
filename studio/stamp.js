/**
 * Refresh the no-JS deck and the README table from studio/catalog.js.
 * Usage: node studio/stamp.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "..");
var indexPath = path.join(root, "index.html");
var readmePath = path.join(root, "README.md");
var report = require("./catalog.js");

if (report.problems.length) {
    report.problems.forEach(function (msg) {
        console.error("REDUPLINK: " + msg);
    });
    process.exit(1);
}

var games = report.games;

function newline(text) {
    return text.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
}

function esc(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function externalAttrs(href) {
    if (/^https?:\/\//.test(href)) return " target=\"_blank\" rel=\"noopener noreferrer\"";
    return "";
}

function live(game) {
    return game.status === "live" && !!game.href;
}

function cardHtml(game) {
    var pad = "                    ";
    var open = live(game);
    var lines = [
        pad + "<li class=\"card " + (open ? "card--live" : "card--hold") + "\">",
        pad + "    <p class=\"card-kicker\"><span>" + esc(game.kind) + "</span><span>" + (open ? "LIVE" : "SEALED") + "</span></p>",
        pad + "    <h3>" + esc(game.title) + "</h3>",
        pad + "    <p class=\"blurb\">" + esc(game.line || "") + "</p>"
    ];
    if (open) {
        var link = "<a class=\"open\" href=\"" + esc(game.href) + "\"" + externalAttrs(game.href) + ">[ OPEN ]</a>";
        if (game.info) {
            link += "<a class=\"open open--info\" href=\"" + esc(game.info) + "\"" + externalAttrs(game.info) + ">[ INFO ]</a>";
            lines.push(pad + "    <div class=\"card-foot\"><span class=\"card-actions\">" + link + "</span></div>");
        } else {
            lines.push(pad + "    <div class=\"card-foot\">" + link + "</div>");
        }
    } else {
        lines.push(pad + "    <div class=\"card-foot\"><span class=\"sealed\">[ SEALED ]</span></div>");
    }
    lines.push(pad + "</li>");
    return lines.join("\n");
}

function displayName(title) {
    return String(title).toLowerCase().replace(/(^|[^a-z0-9'])([a-z])/g, function (_, sep, ch) {
        return sep + ch.toUpperCase();
    });
}

function mdCell(value) {
    return String(value).replace(/\|/g, "\\|");
}

function folderFromHref(href) {
    if (!href || /^https?:\/\//.test(href)) return "";
    var pathOnly = String(href).split("#")[0].split("?")[0];
    var slash = pathOnly.lastIndexOf("/");
    if (slash <= 0) return "";
    return pathOnly.slice(0, slash + 1);
}

function readmeRow(game) {
    var name = mdCell(displayName(game.title));
    var kind = mdCell(game.summary || game.kind);
    var folder = folderFromHref(game.href || "");
    var pathCell = "sealed";
    if (folder) pathCell = "[`" + folder + "`](" + encodeURI(folder) + ")";
    else if (game.href && /^https?:\/\//.test(game.href)) pathCell = game.href;
    return "| **" + name + "** | " + kind + " | " + pathCell + " |";
}

function liveLabel(list) {
    var n = 0;
    list.forEach(function (game) {
        if (live(game)) n += 1;
    });
    return n + " LIVE / " + list.length;
}

function replaceMarked(text, start, end, inner, nl) {
    var at = text.indexOf(start);
    var to = text.indexOf(end, at + start.length);
    if (at === -1 || to === -1) return null;
    var lineBreak = text.lastIndexOf(nl, to - 1);
    var prefix = "";
    if (lineBreak !== -1) {
        var lead = text.slice(lineBreak + nl.length, to);
        if (/^[ \t]*$/.test(lead)) prefix = lead;
    }
    var body = inner.replace(/\s+$/, "");
    return text.slice(0, at + start.length) + nl + body + nl + prefix + text.slice(to);
}

function replaceInline(text, start, end, inner) {
    var at = text.indexOf(start);
    var to = text.indexOf(end, at + start.length);
    if (at === -1 || to === -1) return null;
    return text.slice(0, at + start.length) + inner + text.slice(to);
}

function writeIfChanged(file, next) {
    var prev = fs.readFileSync(file, "utf8");
    if (prev === next) {
        console.log(path.basename(file) + " unchanged");
        return;
    }
    fs.writeFileSync(file, next);
    console.log(path.basename(file) + " updated");
}

var index = fs.readFileSync(indexPath, "utf8");
var indexNl = newline(index);
var cards = games.map(cardHtml).join("\n").replace(/\n/g, indexNl);
var nextIndex = replaceMarked(index, "<!-- games:start -->", "<!-- games:end -->", cards, indexNl);
if (!nextIndex) {
    console.error("REDUPLINK: missing game markers in index.html");
    process.exit(1);
}
nextIndex = replaceInline(nextIndex, "<!-- count:start -->", "<!-- count:end -->", liveLabel(games));
if (!nextIndex) {
    console.error("REDUPLINK: missing count markers in index.html");
    process.exit(1);
}

var readme = fs.readFileSync(readmePath, "utf8");
var readmeNl = newline(readme);
var table = ["| Game | Kind | Path |", "| --- | --- | --- |"].concat(games.map(readmeRow)).join(readmeNl);
var nextReadme = replaceMarked(readme, "<!-- games:start -->", "<!-- games:end -->", table, readmeNl);
if (!nextReadme) {
    console.error("REDUPLINK: missing game markers in README.md");
    process.exit(1);
}

writeIfChanged(indexPath, nextIndex);
writeIfChanged(readmePath, nextReadme);
