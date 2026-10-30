/**
 * Cosmic Quiz — Power-ups
 *
 * Stardust economy and the four spends: Quantum 50, Life Pod, Gravity Shield, Time Warp.
 * Registers on window.CosmicQuiz and receives the shared match context from script.js.
 */
(function (root) {
    'use strict';

    const quiz = root.CosmicQuiz || (root.CosmicQuiz = {
        _modules: [],
        use(fn) { this._modules.push(fn); },
    });

    const STARDUST_PER_CORRECT = 2;
    const TIME_WARP_MS = 8000;
    const POWERUP_COSTS = {
        quantum50: 5,
        lifePod: 8,
        timeWarp: 6,
        shield: 7,
    };

    quiz.use(function (app) {
        function clearPowerupPending() {
            app.powerupSendPending = false;
            if (app.powerupUnlockTimer !== null) {
                clearTimeout(app.powerupUnlockTimer);
                app.powerupUnlockTimer = null;
            }
        }

        function canAffordPowerup(id, slot) {
            const cost = POWERUP_COSTS[id];
            if (!cost) return false;
            if (getStardust(slot) < cost) return false;
            if (id === 'timeWarp' && app.gameMode !== 'blitz') return false;
            if (id === 'lifePod') {
                const currentLives = app.isMultiplayer() ? app.playerLives[slot] : app.lives;
                if (currentLives >= app.MAX_LIVES_WITH_POD) return false;
            }
            if (id === 'shield') {
                const active = app.isMultiplayer() ? app.playerShieldActive[slot] : app.shieldActive;
                if (active) return false;
            }
            if (id === 'quantum50' && app.playerFiftyUsed[slot]) return false;
            return true;
        }

        function resetPowerupSession() {
            app.stardust = 0;
            app.playerStardust = [0, 0];
            app.shieldActive = false;
            app.playerShieldActive = [false, false];
            resetQuantum50State();
            updatePowerupBar();
        }

        function resetQuantum50State() {
            app.playerFiftyUsed = [false, false];
            app.hiddenAnswersBySlot = [[], []];
            app.answerOptions?.querySelectorAll('.answer-btn').forEach((btn) => {
                btn.classList.remove('is-eliminated');
            });
        }

        function restoreFiftyHidden() {
            const slot = app.getAnswerSlot();
            const hidden = app.hiddenAnswersBySlot[slot];
            if (app.playerFiftyUsed[slot] && hidden?.length) markFiftyHidden(hidden);
        }

        function getStardust(slot) {
            const who = typeof slot === 'number' ? slot : app.isMultiplayer() ? app.getAnswerSlot() : 0;
            return app.isMultiplayer() ? app.playerStardust[who] || 0 : app.stardust;
        }

        function spendStardust(slot, cost) {
            const cur = getStardust(slot);
            if (cur < cost) return false;
            if (app.isMultiplayer()) app.playerStardust[slot] = cur - cost;
            else app.stardust = cur - cost;
            return true;
        }

        function addStardustReward(slot) {
            if (app.isMultiplayer()) {
                app.playerStardust[slot] = (app.playerStardust[slot] || 0) + STARDUST_PER_CORRECT;
            } else {
                app.stardust += STARDUST_PER_CORRECT;
            }
            updatePowerupBar();
        }

        function canUsePowerups(slot) {
            if (!app.gameActive || app.answerRevealActive) return false;
            if (app.isMultiplayer()) return app.slotCanAnswer(slot);
            return true;
        }

        function markFiftyHidden(answerValues) {
            const hidden = new Set((answerValues || []).map((v) => app.normVal(v)));
            app.answerOptions.querySelectorAll('.answer-btn').forEach((btn) => {
                const val = app.normVal(btn.dataset.answer || btn.innerText);
                if (hidden.has(val)) {
                    btn.classList.add('is-eliminated');
                    btn.disabled = true;
                }
            });
            app.setAnswerInteractivity();
        }

        function applyQuantum50(slot) {
            const question = app.activeDeck[app.currentLevel];
            if (!question || app.playerFiftyUsed[slot]) return false;

            const correctNorm = app.normVal(question.a);
            const wrongBtns = [];
            app.answerOptions.querySelectorAll('.answer-btn').forEach((btn) => {
                const val = app.normVal(btn.dataset.answer || btn.innerText);
                if (val !== correctNorm) wrongBtns.push({ btn, val });
            });

            if (wrongBtns.length < 2) return false;

            const seed = (app.sessionSeed || 1) + app.currentLevel * 31 + slot * 13 + 99;
            const shuffled = CosmicDeck.shuffleWithSeed(
                wrongBtns.map((w) => w.val),
                seed
            );
            const picked = shuffled.slice(0, 2);
            app.hiddenAnswersBySlot[slot] = picked;
            app.playerFiftyUsed[slot] = true;

            if (!app.isMultiplayer() || slot === app.getAnswerSlot()) {
                markFiftyHidden(picked);
            }
            return true;
        }

        function applyPowerupEffect(slot, id) {
            if (id === 'quantum50') return applyQuantum50(slot);

            if (id === 'lifePod') {
                const currentLives = app.isMultiplayer() ? app.playerLives[slot] : app.lives;
                if (currentLives >= app.MAX_LIVES_WITH_POD) return false;

                if (app.isMultiplayer()) {
                    app.playerLives[slot] = Math.min(app.playerLives[slot] + 1, app.MAX_LIVES_WITH_POD);
                } else {
                    app.lives = Math.min(app.lives + 1, app.MAX_LIVES_WITH_POD);
                }
                app.renderLives();
                return true;
            }

            if (id === 'shield') {
                if (app.isMultiplayer()) {
                    if (app.playerShieldActive[slot]) return false;
                    app.playerShieldActive[slot] = true;
                } else {
                    if (app.shieldActive) return false;
                    app.shieldActive = true;
                }
                return true;
            }

            if (id === 'timeWarp') {
                if (app.gameMode !== 'blitz') return false;
                app.blitzDeadline += TIME_WARP_MS;
                app.startBlitzTimer();
                return true;
            }

            return false;
        }

        function tryUsePowerup(id, forceSlot, fromRemote) {
            const cost = POWERUP_COSTS[id];
            if (!cost || !app.gameActive) return false;

            const slot = typeof forceSlot === 'number' ? forceSlot : app.getAnswerSlot();

            if (!fromRemote && app.isOnlineMulti() && app.lobby.isGuest()) {
                if (app.powerupSendPending) return false;
                if (canUsePowerups(slot) && canAffordPowerup(id, slot)) {
                    app.powerupSendPending = true;
                    if (app.powerupUnlockTimer !== null) clearTimeout(app.powerupUnlockTimer);
                    app.powerupUnlockTimer = setTimeout(() => {
                        app.powerupSendPending = false;
                        app.powerupUnlockTimer = null;
                    }, 1200);
                    app.lobby.send({
                        type: 'powerup',
                        id,
                        slot,
                        nonce: app.remoteQuestionNonce,
                    });
                    if (!app.applyingRemote) app.sfx('powerup', id);
                }
                return false;
            }

            if (!canUsePowerups(slot)) return false;
            if (!canAffordPowerup(id, slot)) return false;

            if (!spendStardust(slot, cost)) return false;
            if (!applyPowerupEffect(slot, id)) {
                if (app.isMultiplayer()) app.playerStardust[slot] = (app.playerStardust[slot] || 0) + cost;
                else app.stardust += cost;
                updatePowerupBar();
                return false;
            }

            if (!fromRemote && !app.applyingRemote) app.sfx('powerup', id);
            updatePowerupBar();
            app.syncHudClearance();

            if (app.isOnlineMulti() && app.lobby.isHost()) {
                app.hostBroadcastState();
            }

            return true;
        }

        function updatePowerupBar() {
            if (!app.powerupBar) return;

            const slot = app.getAnswerSlot();
            const show = app.gameActive && !app.questionDisplay?.classList.contains('is-end');
            app.powerupBar.hidden = !show;

            if (app.stardustValEl) app.stardustValEl.textContent = String(getStardust(slot));

            app.powerupBar.querySelectorAll('.powerup-btn').forEach((btn) => {
                const id = btn.dataset.powerup;
                const cost = POWERUP_COSTS[id] || 0;
                let disabled = !show || !canUsePowerups(slot) || getStardust(slot) < cost;

                if (id === 'timeWarp') {
                    btn.hidden = app.gameMode !== 'blitz';
                    if (app.gameMode !== 'blitz') return;
                } else {
                    btn.hidden = false;
                }

                if (id === 'lifePod') {
                    const currentLives = app.isMultiplayer() ? app.playerLives[slot] : app.lives;
                    disabled = disabled || currentLives >= app.MAX_LIVES_WITH_POD;
                }
                if (id === 'shield') {
                    const active = app.isMultiplayer()
                        ? app.playerShieldActive[slot]
                        : app.shieldActive;
                    disabled = disabled || active;
                    btn.classList.toggle('is-active', !!active);
                } else {
                    btn.classList.remove('is-active');
                }
                if (id === 'quantum50') {
                    disabled = disabled || app.playerFiftyUsed[slot];
                }

                btn.disabled = disabled;
            });
        }

        app.clearPowerupPending = clearPowerupPending;
        app.resetPowerupSession = resetPowerupSession;
        app.resetQuantum50State = resetQuantum50State;
        app.restoreFiftyHidden = restoreFiftyHidden;
        app.addStardustReward = addStardustReward;
        app.markFiftyHidden = markFiftyHidden;
        app.tryUsePowerup = tryUsePowerup;
        app.updatePowerupBar = updatePowerupBar;
    });
})(window);
