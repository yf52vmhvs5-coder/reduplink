/* ───────────────────────────────────────────────────────────────────────────
 *  REDUPLINK SIGNAL — shared tint with studio deck (RU mark)
 * ─────────────────────────────────────────────────────────────────────────── */

const SJ_SIGNAL_KEY = 'spacejunkStudioTint';
const SJ_SIGNAL_FALLBACK_KEYS = ['nebulaVoidHubTitleColor', 'cosmic-quiz-signal'];
const SJ_SIGNAL_DEFAULT = '#ff2d2d';
const SJ_SIGNAL_CYCLE = ['#ff2d2d', '#ff2ed1', '#c86bff', '#8a2be2', '#00e5ff', '#3da5ff', '#39ff14', '#ffdd22'];

function sjIsHex(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function sjReadSignalTint() {
    const keys = [SJ_SIGNAL_KEY].concat(SJ_SIGNAL_FALLBACK_KEYS);
    try {
        for (let i = 0; i < keys.length; i++) {
            const saved = localStorage.getItem(keys[i]);
            if (saved && sjIsHex(saved)) return saved.toLowerCase();
        }
    } catch (_) { /* private mode */ }
    return SJ_SIGNAL_DEFAULT;
}

function sjApplySignalTint() {
    document.documentElement.style.setProperty('--sj-signal', sjReadSignalTint());
}

function driftNick() {
    const input = document.getElementById('nick-input');
    const name = input && input.value.trim();
    return name || 'You';
}

function driftRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
}

function openDriftRoom() {
    resetDriftRoom();
    const name = document.getElementById('room-name');
    if (name) name.textContent = driftNick();
    screens.show('room');
}

function showDriftRoomCode(code) {
    const idle = document.getElementById('room-idle');
    const wait = document.getElementById('room-wait');
    const shown = document.getElementById('room-code');
    if (idle) idle.hidden = true;
    if (shown) shown.textContent = code;
    if (wait) wait.hidden = false;
}

function joinDriftRoom() {
    const input = document.getElementById('room-code-input');
    const code = (input && input.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (code.length !== 6) return;
    if (input) input.value = code;
    showDriftRoomCode(code);
}

function resetDriftRoom() {
    const idle = document.getElementById('room-idle');
    const wait = document.getElementById('room-wait');
    const input = document.getElementById('room-code-input');
    if (idle) idle.hidden = false;
    if (wait) wait.hidden = true;
    if (input) input.value = '';
}

function sjCycleSignalTint() {
    const current = sjReadSignalTint();
    const at = SJ_SIGNAL_CYCLE.indexOf(current);
    const next = SJ_SIGNAL_CYCLE[(at + 1) % SJ_SIGNAL_CYCLE.length];
    try {
        localStorage.setItem(SJ_SIGNAL_KEY, next);
    } catch (_) { /* private mode */ }
    sjApplySignalTint();
}

function sjOnSignalStorage(ev) {
    if (!ev.key) return;
    if (ev.key === SJ_SIGNAL_KEY || SJ_SIGNAL_FALLBACK_KEYS.indexOf(ev.key) !== -1) {
        sjApplySignalTint();
    }
}

/* ───────────────────────────────────────────────────────────────────────────
 *  SCREEN FLOW — Intro · Menu · Navigation
 * ─────────────────────────────────────────────────────────────────────────── */

const screens = {
    show(id) {
        document.querySelectorAll('.screen').forEach(s => {
            const on = s.id === 'screen-' + id;
            s.classList.toggle('active', on);
            s.inert = !on;
        });
    },

    goMenu() { this.show('menu'); },

    init() {
        sjApplySignalTint();
        window.addEventListener('storage', sjOnSignalStorage);

        options.loadUI();
        options.bind();

        document.getElementById('btn-play').addEventListener('click', () => { Sfx.play('click'); openDriftRoom(); });
        document.getElementById('nick-input').addEventListener('keydown', e => { if (e.key === 'Enter') { Sfx.play('click'); openDriftRoom(); } });
        document.getElementById('btn-room-create').addEventListener('click', () => { Sfx.play('click'); showDriftRoomCode(driftRoomCode()); });
        document.getElementById('btn-room-join').addEventListener('click', () => { Sfx.play('click'); joinDriftRoom(); });
        document.getElementById('room-code-input').addEventListener('keydown', e => { if (e.key === 'Enter') { Sfx.play('click'); joinDriftRoom(); } });
        document.getElementById('btn-room-back').addEventListener('click', () => {
            Sfx.play('menuBack');
            resetDriftRoom();
            screens.show('menu');
        });
        document.getElementById('btn-options').addEventListener('click', () => {
            options.loadUI();
            Sfx.play('menuOpen');
            screens.show('options');
        });
        document.getElementById('btn-about').addEventListener('click', () => {
            Sfx.play('menuOpen');
            screens.show('about');
        });
        document.getElementById('btn-about-back').addEventListener('click', () => {
            Sfx.play('menuBack');
            screens.show('menu');
        });
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            Sfx.play('menuBack');
            screens.show('menu');
        });
        document.getElementById('btn-signal-tint').addEventListener('click', () => {
            Sfx.play('click');
            sjCycleSignalTint();
        });
        document.getElementById('nick-input').value = 'You';

        this.show('menu');
        startDriftField();
    }
};

function startDriftField() {
    const canvas = document.getElementById('drift-field');
    if (!canvas || canvas.dataset.live === '1') return;
    canvas.dataset.live = '1';
    const ctx = canvas.getContext('2d');
    const shapes = [
        [[1, 1, 1, 1]],
        [[1, 1], [1, 1]],
        [[0, 1, 0], [1, 1, 1]],
        [[0, 1, 1], [1, 1, 0]],
        [[1, 1, 0], [0, 1, 1]],
        [[1, 0, 0], [1, 1, 1]],
        [[0, 0, 1], [1, 1, 1]]
    ];
    const colors = ['#3ec6ff', '#f0c14a', '#c86bff', '#3dff8a', '#ff5b7a', '#6aa4ff', '#ff8a3d'];
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars = [];
    let pieces = [];
    let last = 0;

    function rot90(matrix) {
        const h = matrix.length;
        const w = matrix[0].length;
        const next = [];
        for (let x = 0; x < w; x++) {
            next[x] = [];
            for (let y = 0; y < h; y++) next[x][y] = matrix[h - 1 - y][x];
        }
        return next;
    }

    function oriented(shape, turns) {
        let matrix = shape;
        const n = ((turns % 4) + 4) % 4;
        for (let i = 0; i < n; i++) matrix = rot90(matrix);
        return matrix;
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        stars = [];
        for (let i = 0; i < 64; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                s: Math.random() * 1.4 + 0.4,
                a: Math.random() * 0.28 + 0.06
            });
        }
    }

    function makePiece(fromTop) {
        const kind = Math.floor(Math.random() * shapes.length);
        return {
            kind,
            x: Math.random() * canvas.width,
            y: fromTop ? -30 - Math.random() * 80 : Math.random() * canvas.height,
            cell: 6 + Math.random() * 5,
            vy: calm ? 8 : 16 + Math.random() * 26,
            vx: (Math.random() - 0.5) * (calm ? 2 : 10),
            rot: Math.floor(Math.random() * 4),
            spin: calm || Math.random() > 0.4 ? 0 : (Math.random() < 0.5 ? -1 : 1),
            spinT: 0,
            alpha: 0.28 + Math.random() * 0.38
        };
    }

    function seed() {
        pieces = [];
        for (let i = 0; i < 20; i++) pieces.push(makePiece(false));
    }

    function drawPiece(piece) {
        const matrix = oriented(shapes[piece.kind], piece.rot);
        const h = matrix.length;
        const w = matrix[0].length;
        const s = piece.cell;
        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.globalAlpha = piece.alpha;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!matrix[y][x]) continue;
                const px = (x - w / 2) * s;
                const py = (y - h / 2) * s;
                ctx.fillStyle = colors[piece.kind];
                ctx.fillRect(px, py, s - 1, s - 1);
                ctx.fillStyle = 'rgba(255,255,255,0.28)';
                ctx.fillRect(px, py, s - 1, 1);
            }
        }
        ctx.restore();
    }

    resize();
    seed();
    window.addEventListener('resize', resize);

    function frame(now) {
        requestAnimationFrame(frame);
        const fieldOn = ['screen-menu', 'screen-options', 'screen-about', 'screen-room'].some((id) => {
            const el = document.getElementById(id);
            return el && el.classList.contains('active');
        });
        canvas.style.visibility = fieldOn ? 'visible' : 'hidden';
        if (!fieldOn) return;
        const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
        last = now;
        ctx.fillStyle = '#05060d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#d7e4ff';
        for (let i = 0; i < stars.length; i++) {
            const star = stars[i];
            ctx.globalAlpha = star.a;
            ctx.fillRect(star.x, star.y, star.s, star.s);
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < pieces.length; i++) {
            const piece = pieces[i];
            piece.y += piece.vy * dt;
            piece.x += piece.vx * dt;
            if (piece.x < -40) piece.x = canvas.width + 20;
            if (piece.x > canvas.width + 40) piece.x = -20;
            if (piece.spin) {
                piece.spinT += dt;
                if (piece.spinT > 1.6) {
                    piece.rot = (piece.rot + piece.spin + 4) % 4;
                    piece.spinT = 0;
                }
            }
            if (piece.y > canvas.height + 48) {
                const next = makePiece(true);
                pieces[i] = next;
            } else {
                const dx = Math.abs(piece.x - canvas.width / 2) / 230;
                const inStack = piece.y > canvas.height * 0.18 && piece.y < canvas.height * 0.9;
                piece.hold = piece.alpha;
                if (inStack && dx < 1) piece.alpha *= dx;
                drawPiece(piece);
                piece.alpha = piece.hold;
            }
        }
    }

    requestAnimationFrame(frame);
}

const settings = {
    fullscreen: false,
    sounds: true
};

const options = {
    isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    },

    async applyFullscreen(on) {
        try {
            if (on) {
                if (!this.isFullscreen()) {
                    const el = document.documentElement;
                    const req = el.requestFullscreen || el.webkitRequestFullscreen;
                    if (req) await req.call(el);
                }
            } else if (this.isFullscreen()) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) await exit.call(document);
            }
        } catch (_) { /* browser refused fullscreen */ }
    },

    paint() {
        const sound = document.getElementById('opt-sound');
        const full = document.getElementById('opt-fullscreen');
        if (sound) {
            sound.setAttribute('aria-pressed', settings.sounds ? 'true' : 'false');
            sound.classList.toggle('is-on', settings.sounds);
        }
        if (full) {
            full.setAttribute('aria-pressed', settings.fullscreen ? 'true' : 'false');
            full.classList.toggle('is-on', settings.fullscreen);
        }
    },

    bind() {
        document.getElementById('opt-sound').addEventListener('click', () => {
            settings.sounds = !settings.sounds;
            Sfx.setEnabled(settings.sounds);
            Sfx.play('click');
            this.paint();
        });
        document.getElementById('opt-fullscreen').addEventListener('click', () => {
            settings.fullscreen = !this.isFullscreen();
            Sfx.play('click');
            this.applyFullscreen(settings.fullscreen);
            this.paint();
        });
        document.addEventListener('fullscreenchange', () => {
            settings.fullscreen = this.isFullscreen();
            this.paint();
        });
    },

    loadUI() {
        settings.fullscreen = this.isFullscreen();
        Sfx.setEnabled(settings.sounds);
        this.paint();
    }
};

window.onload = () => {
    screens.init();
};
