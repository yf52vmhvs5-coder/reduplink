/**
 * Cosmic Quiz — Online match sync
 *
 * Host payloads, guest apply, reveal, and the two-player round.
 * PeerJS itself stays in multiplayer.js. This file is the match protocol.
 * Registers on window.CosmicQuiz and receives the shared match context from script.js.
 */
(function (root) {
    'use strict';

    const quiz = root.CosmicQuiz || (root.CosmicQuiz = {
        _modules: [],
        use(fn) { this._modules.push(fn); },
    });

    quiz.use(function (app) {
        function questionPayload(question, level) {
            return {
                q: question.q,
                choices: app.getAnswerChoices(question, level),
                category: question.category,
                difficulty: question.difficulty,
            };
        }

        function buildStatePayload(questionOverride) {
            let question = questionOverride || null;
            if (!question && app.gameActive && app.currentLevel < app.activeDeck.length) {
                const q = app.activeDeck[app.currentLevel];
                if (q) question = questionPayload(q, app.currentLevel);
            }

            return {
                type: 'state',
                gameMode: app.gameMode,
                currentLevel: app.currentLevel,
                sessionLength: app.sessionLength,
                questionNonce: app.questionNonce,
                playerLives: app.playerLives.slice(),
                playerScores: app.playerScores.slice(),
                // The guest already knows their own pick. The host's text stays here.
                roundAnswers: app.roundAnswers.map((choice, slot) => (
                    slot === 1 || choice === null ? choice : true
                )),
                gameActive: app.gameActive,
                questionIndex: app.questionIndex,
                end: null,
                question,
                blitzDeadline: app.gameMode === 'blitz' && app.gameActive ? app.blitzDeadline : null,
                blitzRemainingMs: app.gameMode === 'blitz' && app.gameActive && app.blitzDeadline
                    ? Math.max(0, app.blitzDeadline - Date.now())
                    : null,
                playerStardust: app.playerStardust.slice(),
                playerShieldActive: app.playerShieldActive.slice(),
                playerFiftyUsed: app.playerFiftyUsed.slice(),
                solvedThisQuestion: app.solvedThisQuestion.slice(),
                hiddenAnswersBySlot: app.hiddenAnswersBySlot.map((list, slot) => (
                    slot === 1 && Array.isArray(list) ? list.slice() : []
                )),
            };
        }

        function hostBroadcastReveal(question, answers) {
            if (!app.isOnlineMulti() || !app.lobby.isHost()) return;
            app.lobby.send({
                type: 'reveal',
                correct: question.a,
                fact: question.fact || null,
                mine: answers[1] ?? null,
                nonce: app.questionNonce,
                category: question.category,
                difficulty: question.difficulty,
                lives: app.playerLives.slice(),
                scores: app.playerScores.slice(),
                stardust: app.playerStardust.slice(),
                shields: app.playerShieldActive.slice(),
                solved: app.solvedThisQuestion.slice(),
            });
        }

        function hostBroadcastState(questionOverride) {
            if (!app.isOnlineMulti() || !app.lobby.isHost()) return;
            app.lobby.send(buildStatePayload(questionOverride));
        }

        function hostBroadcastStart(mode) {
            if (!app.isOnlineMulti() || !app.lobby.isHost()) return;
            app.lobby.send({
                type: 'start',
                mode,
                seed: app.sessionSeed,
                state: buildStatePayload(),
            });
        }

        function copyPair(list, fallback) {
            if (!Array.isArray(list) || list.length < 2) return fallback;
            return list.slice(0, 2);
        }

        function applyRemoteBlitz(payload) {
            if (app.gameMode !== 'blitz' || !app.gameActive) {
                app.blitzDeadline = 0;
                app.clearBlitzTimer();
                return;
            }

            // Host timestamps don't match a guest clock. Keep the duration, start it here.
            const hasRemaining = typeof payload.blitzRemainingMs === 'number' && Number.isFinite(payload.blitzRemainingMs);
            if (!hasRemaining && !payload.blitzDeadline) {
                app.blitzDeadline = 0;
                app.clearBlitzTimer();
                return;
            }

            const nextDeadline = hasRemaining
                ? Date.now() + Math.max(0, payload.blitzRemainingMs)
                : payload.blitzDeadline;
            const drifted = Math.abs(nextDeadline - (app.blitzDeadline || 0)) > 400;
            app.blitzDeadline = nextDeadline;
            if (app.blitzTimerId === null || drifted) app.startBlitzTimer();
        }

        function applyRemoteState(payload) {
            if (!payload) return;

            if (app.answerRevealActive) {
                app.pendingRemoteState = payload;
                return;
            }

            app.applyingRemote = true;
            app.clearPowerupPending();

            if (payload.gameMode) app.gameMode = payload.gameMode;
            if (typeof payload.currentLevel === 'number') app.currentLevel = payload.currentLevel;
            if (typeof payload.sessionLength === 'number') app.sessionLength = payload.sessionLength;
            const incomingNonce = typeof payload.questionNonce === 'number' ? payload.questionNonce : null;
            const isNewQuestion = !!(
                payload.question &&
                incomingNonce !== null &&
                incomingNonce !== app.remoteQuestionNonce
            );

            const nextLives = copyPair(payload.playerLives, null);
            const nextScores = copyPair(payload.playerScores, null);
            if (nextLives) app.playerLives = nextLives;
            if (nextScores) app.playerScores = nextScores;
            if (Array.isArray(payload.roundAnswers)) app.roundAnswers = payload.roundAnswers.slice(0, 2);
            if (typeof payload.gameActive === 'boolean') app.gameActive = payload.gameActive;
            if (typeof payload.questionIndex === 'number') app.questionIndex = payload.questionIndex;
            const nextDust = copyPair(payload.playerStardust, null);
            const nextShield = copyPair(payload.playerShieldActive, null);
            const nextFifty = copyPair(payload.playerFiftyUsed, null);
            const nextSolved = copyPair(payload.solvedThisQuestion, null);
            if (nextDust) app.playerStardust = nextDust;
            if (nextShield) app.playerShieldActive = nextShield;
            if (nextFifty) app.playerFiftyUsed = nextFifty;
            if (nextSolved) app.solvedThisQuestion = nextSolved.map((flag) => !!flag);
            if (Array.isArray(payload.hiddenAnswersBySlot)) {
                app.hiddenAnswersBySlot = [0, 1].map((slot) => (
                    Array.isArray(payload.hiddenAnswersBySlot[slot])
                        ? payload.hiddenAnswersBySlot[slot].slice()
                        : []
                ));
            }
            app.updateScoreDisplay();

            if (payload.end) {
                app.gameActive = false;
                app.onlineSession = true;
                app.replayBlocked = payload.end.headline === 'OPPONENT LEFT';
                app.clearBlitzTimer();
                app.answerOptions.style.display = 'none';
                app.showEndScreen(payload.end.won);
                app.questionDisplay?.classList.add('is-end');
                app.questionDisplay.innerHTML = app.buildEndDisplayHtml(payload.end.won, payload.end.headline);
                app.syncQuestionLength();
                app.resetQuestionScroll();
                app.updateEndScreenButtons();
            } else if (payload.question && isNewQuestion) {
                app.remoteQuestionNonce = incomingNonce;
                app.hideEndScreen();
                app.clearAnswerFeedback();
                app.answerOptions.style.display = 'flex';
                app.questionDisplay?.classList.remove('is-end');
                app.questionDisplay.innerText = payload.question.q;
                app.syncQuestionLength();
                app.resetQuestionScroll();
                app.renderChoiceButtons(payload.question.choices || []);
                app.updateQuestionMeta(payload.question);
                const slot = app.getAnswerSlot();
                if (app.playerFiftyUsed[slot] && app.hiddenAnswersBySlot[slot]?.length) {
                    app.markFiftyHidden(app.hiddenAnswersBySlot[slot]);
                }
                applyRemoteBlitz(payload);
            } else if (payload.question) {
                const slot = app.getAnswerSlot();
                if (app.playerFiftyUsed[slot] && app.hiddenAnswersBySlot[slot]?.length) {
                    app.markFiftyHidden(app.hiddenAnswersBySlot[slot]);
                } else {
                    app.answerOptions.querySelectorAll('.answer-btn.is-eliminated').forEach((btn) => {
                        btn.classList.remove('is-eliminated');
                    });
                }
                if (typeof app.roundAnswers[slot] === 'string') app.markPendingAnswer(app.roundAnswers[slot]);
                app.updateQuestionMeta(payload.question);
                applyRemoteBlitz(payload);
            }

            app.renderLives();
            app.updateHud();
            app.setAnswerInteractivity();
            app.updatePowerupBar();
            app.applyingRemote = false;
        }

        function allPlayersEliminated() {
            return app.playerLives[0] <= 0 && app.playerLives[1] <= 0;
        }

        function resolvePlayerSlot(slot, choice, fromTimeout) {
            if (app.playerLives[slot] <= 0) return;
            const question = app.activeDeck[app.currentLevel];
            if (!question) return;

            const correctVal = app.normVal(question.a);
            const selectedVal = choice ? app.normVal(choice) : '';
            const correct = !!(choice && selectedVal === correctVal);
            const isMe = !app.isMultiplayer() || slot === app.getAnswerSlot();

            if (correct) {
                let points = 10;
                if (app.gameMode === 'blitz' && !fromTimeout) points += app.roundBlitzBonus[slot] || 0;
                app.playerScores[slot] += points;
                app.addStardustReward(slot);
                if (isMe && !app.applyingRemote) app.sfx('correct');
            } else {
                if (app.playerShieldActive[slot]) {
                    app.playerShieldActive[slot] = false;
                    if (isMe) app.updatePowerupBar();
                    if (isMe && !app.applyingRemote && !fromTimeout) app.sfx('wrong');
                } else {
                    app.playerLives[slot]--;
                    if (isMe && !app.applyingRemote) {
                        if (!fromTimeout) app.sfx('wrong');
                        app.sfx('lifeLost');
                    }
                }
            }
        }

        function finishRoundAfterReveal() {
            app.resetRound();

            if (allPlayersEliminated()) {
                if (!app.applyingRemote) app.sfx('gameOver');
                app.endGame(false);
                return;
            }

            const retrySurvival = app.gameMode === 'survival'
                && app.livingPlayers().some((slot) => !app.solvedThisQuestion[slot]);

            if (retrySurvival) {
                app.restoreFiftyHidden();
                app.renderLives();
                app.updateScoreDisplay();
                app.updateHud();
                app.setAnswerInteractivity();
                app.updatePowerupBar();
                if (app.isOnlineMulti() && app.lobby.isHost()) hostBroadcastState();
                return;
            }

            app.currentLevel++;

            if (app.currentLevel >= app.sessionLength) {
                app.endGame(true);
                return;
            }

            app.renderQuestion();
        }

        function roundHadWrongAnswer(question, answers, livesBefore) {
            const correctNorm = app.normVal(question.a);
            for (let slot = 0; slot < 2; slot++) {
                if (livesBefore[slot] <= 0) continue;
                if (app.solvedThisQuestion[slot] && answers[slot] == null) continue;
                const choice = answers[slot];
                if (!choice || app.normVal(choice) !== correctNorm) return true;
            }
            return false;
        }

        function resolveRound() {
            if (!app.gameActive || !app.isMultiplayer()) return;
            if (app.isOnlineMulti() && !app.lobby.isHost()) return;
            if (app.answerRevealActive) return;

            app.clearBlitzTimer();

            const question = app.activeDeck[app.currentLevel];
            if (!question) return;
            const answersSnapshot = app.roundAnswers.slice();
            const livesBefore = app.playerLives.slice();

            for (let slot = 0; slot < 2; slot++) {
                if (livesBefore[slot] <= 0 || app.solvedThisQuestion[slot]) continue;
                const choice = app.roundAnswers[slot];
                resolvePlayerSlot(slot, choice, choice === null);
                if (choice && app.normVal(choice) === app.normVal(question.a)) app.solvedThisQuestion[slot] = true;
            }

            app.updateScoreDisplay();
            app.renderLives();
            const localSlot = app.getAnswerSlot();
            const localSatOut = livesBefore[localSlot] <= 0
                || (answersSnapshot[localSlot] == null && !!app.solvedThisQuestion[localSlot]);
            if (roundHadWrongAnswer(question, answersSnapshot, livesBefore) && !localSatOut) app.shakeQuiz();

            if (app.isOnlineMulti() && app.lobby.isHost()) {
                hostBroadcastReveal(question, answersSnapshot);
            }

            const myAnswer = answersSnapshot[app.getAnswerSlot()];
            app.beginAnswerReveal(question, myAnswer, finishRoundAfterReveal);
        }

        const BLITZ_BONUS_CAP = 90;

        function takeBlitzBonus(remoteBonus) {
            if (typeof remoteBonus === 'number' && Number.isFinite(remoteBonus)) {
                return Math.max(0, Math.min(BLITZ_BONUS_CAP, Math.floor(remoteBonus)));
            }
            return app.blitzPointsBonus();
        }

        function registerAnswer(slot, choice, remoteBonus) {
            if (!app.gameActive || !app.isMultiplayer() || app.answerRevealActive) return;
            if (typeof choice !== 'string' || !choice) return;
            if (!app.slotCanAnswer(slot)) return;

            app.roundAnswers[slot] = choice;
            if (app.gameMode === 'blitz') app.roundBlitzBonus[slot] = takeBlitzBonus(remoteBonus);

            if (slot === app.getAnswerSlot()) {
                app.sfx('click');
                app.markPendingAnswer(choice);
                app.setAnswerInteractivity();
                app.updateHud();
            }

            if (app.isOnlineMulti() && app.lobby.isGuest() && slot === 1) {
                app.lobby.send({
                    type: 'answer',
                    choice,
                    nonce: app.remoteQuestionNonce,
                    blitzBonus: app.gameMode === 'blitz' ? app.roundBlitzBonus[slot] : undefined,
                });
                return;
            }

            if (app.allLivingAnswered()) {
                resolveRound();
            } else if (app.isOnlineMulti() && app.lobby.isHost()) {
                hostBroadcastState();
            }
        }

        function onLobbyMessage(data) {
            if (!data || !data.type) return;

            if (data.type === 'hello' && app.lobby.isHost()) {
                app.goToHostModeSelect();
            }

            if (data.type === 'reveal' && app.lobby.isGuest()) {
                if (
                    typeof data.nonce === 'number' &&
                    app.remoteQuestionNonce !== -1 &&
                    data.nonce !== app.remoteQuestionNonce
                ) {
                    return;
                }

                const localQuestion = app.activeDeck[app.currentLevel];
                const picked = typeof data.mine === 'string'
                    ? data.mine
                    : (Array.isArray(data.roundAnswers) ? data.roundAnswers[1] : null);
                const pickedText = typeof picked === 'string' ? picked : null;
                const correct = !!(pickedText && app.normVal(pickedText) === app.normVal(data.correct || ''));
                const satOut = pickedText == null && (
                    app.playerLives[1] <= 0 ||
                    (Array.isArray(data.solved) && !!data.solved[1])
                );
                if (!satOut) {
                    if (correct) app.sfx('correct');
                    else app.sfx('wrong');
                    if (!correct) app.shakeQuiz();
                }

                const prevLives = app.playerLives[1];
                const nextLives = copyPair(data.lives, null);
                const nextScores = copyPair(data.scores, null);
                const nextDust = copyPair(data.stardust, null);
                const nextShields = copyPair(data.shields, null);
                const nextSolved = copyPair(data.solved, null);
                if (nextLives) app.playerLives = nextLives;
                if (nextScores) app.playerScores = nextScores;
                if (nextDust) app.playerStardust = nextDust;
                if (nextShields) app.playerShieldActive = nextShields;
                if (nextSolved) app.solvedThisQuestion = nextSolved.map((flag) => !!flag);
                app.updateScoreDisplay();
                app.renderLives();
                app.updatePowerupBar();
                if (app.playerLives[1] < prevLives) app.sfx('lifeLost');

                app.beginAnswerReveal(
                    {
                        a: data.correct || localQuestion?.a,
                        fact: data.fact || localQuestion?.fact || null,
                        category: data.category || localQuestion?.category,
                        difficulty: data.difficulty || localQuestion?.difficulty,
                    },
                    pickedText,
                    null
                );
            }

            if (data.type === 'start' && app.lobby.isGuest()) {
                app.sessionSeed = data.seed;
                app.adoptDeck(app.sessionSeed);
                app.playType = 'online';
                app.onlineSession = true;
                app.myOnlineSlot = 1;
                app.replayBlocked = false;
                app.remoteQuestionNonce = -1;
                app.clearPowerupPending();
                app.clearAnswerFeedback();
                app.gameMode = data.mode;
                app.hideEndScreen();
                app.questionDisplay?.classList.remove('is-end');
                applyRemoteState(data.state);
                app.showScreen(app.quizScreen);
                if (!app.applyingRemote) app.sfx('start');
            }

            if (data.type === 'state' && app.lobby.isGuest()) {
                applyRemoteState(data);
            }

            if (data.type === 'answer' && app.lobby.isHost() && app.gameActive) {
                if (app.answerRevealActive) return;
                if (typeof data.nonce === 'number' && data.nonce !== app.questionNonce) return;
                registerAnswer(1, data.choice, data.blitzBonus);
            }

            if (data.type === 'powerup' && app.lobby.isHost() && app.gameActive) {
                if (app.answerRevealActive) return;
                if (typeof data.nonce === 'number' && data.nonce !== app.questionNonce) return;
                if (data.slot !== 1) return;
                const applied = app.tryUsePowerup(data.id, 1, true);
                if (!applied) hostBroadcastState();
            }
        }

        function onLobbyStatus(status, detail) {
            if (status === 'hosting') {
                app.showLobbyPanels(true);
                if (app.lobbyCodeDisplay) app.lobbyCodeDisplay.textContent = detail.roomCode || '------';
                app.setLobbyStatus('Share this code with your friend');
                if (app.lobbyWaitingText) app.lobbyWaitingText.textContent = 'Waiting for friend to join…';
            }

            if (status === 'connecting') {
                app.setLobbyStatus(detail.message || 'Connecting…');
                if (detail.hidePanels) app.showLobbyPanels(false);
            }

            if (status === 'connected') {
                if (app.lobby.isHost()) {
                    app.goToHostModeSelect();
                } else if (app.lobby.isGuest()) {
                    app.goToGuestModeSelect();
                }
            }

            if (status === 'peer_left') {
                if (app.gameActive) {
                    app.endGame(false, 'OPPONENT LEFT');
                    app.lobby.leave();
                    return;
                }
                if (app.quizScreen?.classList.contains('active')) {
                    app.replayBlocked = true;
                    app.updateEndScreenButtons();
                    app.lobby.leave();
                    return;
                }
                if (app.lobby.isHost()) {
                    app.showLobbyPanels(true);
                    const code = app.lobby.getRoomCode();
                    if (app.lobbyCodeDisplay && code) app.lobbyCodeDisplay.textContent = code;
                    app.setLobbyStatus('Friend left — share the code to invite them back');
                    if (app.lobbyWaitingText) app.lobbyWaitingText.textContent = 'Waiting for friend to join…';
                    app.showScreen(app.lobbyScreen);
                    return;
                }
                app.lobby.leave();
                app.setLobbyStatus('Host left the room');
                app.showLobbyPanels(false);
                app.showScreen(app.lobbyScreen);
            }

            if (status === 'idle') {
                app.showLobbyPanels(false);
            }

            if (status === 'error') {
                app.setLobbyStatus(detail.message || 'Connection error');
                app.showLobbyPanels(false);
                if (app.lobbyIdle) app.lobbyIdle.hidden = false;
            }
        }

        app.questionPayload = questionPayload;
        app.hostBroadcastState = hostBroadcastState;
        app.hostBroadcastStart = hostBroadcastStart;
        app.applyRemoteState = applyRemoteState;
        app.resolveRound = resolveRound;
        app.registerAnswer = registerAnswer;
        app.onLobbyMessage = onLobbyMessage;
        app.onLobbyStatus = onLobbyStatus;
    });
})(window);
