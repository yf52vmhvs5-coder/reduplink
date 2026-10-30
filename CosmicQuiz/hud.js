/**
 * Cosmic Quiz — HUD and answer presentation
 *
 * Progress, timer badge, lives, reveal highlights, facts, and the end-screen score.
 * Best scores stay in localStorage under the same key as before.
 * Registers on window.CosmicQuiz and receives the shared match context from script.js.
 */
(function (root) {
    'use strict';

    const quiz = root.CosmicQuiz || (root.CosmicQuiz = {
        _modules: [],
        use(fn) { this._modules.push(fn); },
    });

    const REVEAL_MS = 1700;
    const BEST_SCORE_KEY = 'cosmic-quiz-best';
    const LIFE_ICON =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="4.2" ry="6.5"/></svg>';

    const MODE_LABELS = {
        classic: 'CLASSIC',
        survival: 'SURVIVAL',
        blitz: 'BLITZ',
    };

    const CATEGORY_LABELS = {
        planet: 'Planets',
        space: 'Space',
        number: 'Numbers',
        scientist: 'Space Science',
        chemistry: 'Stellar Matter',
        physics: 'Physics',
        tech: 'Technology',
        weird: 'Strange',
    };

    const DIFFICULTY_LABELS = ['', 'EASY', 'NORMAL', 'MEDIUM', 'HARD', 'EXPERT'];

    quiz.use(function (app) {
        function clearRevealTimer() {
            if (app.revealTimerId !== null) {
                clearTimeout(app.revealTimerId);
                app.revealTimerId = null;
            }
        }

        function clearAnswerFeedback() {
            app.answerRevealActive = false;
            clearRevealTimer();
            if (app.questionFactEl) {
                app.questionFactEl.hidden = true;
                app.questionFactEl.textContent = '';
            }
            app.answerOptions.querySelectorAll('.answer-btn').forEach((btn) => {
                btn.classList.remove('is-correct', 'is-wrong', 'is-dim', 'is-pending', 'is-eliminated');
            });
        }

        function formatQuestionMeta(question) {
            if (!question) return '';
            const cat = CATEGORY_LABELS[question.category] || question.category || '';
            const diff = DIFFICULTY_LABELS[question.difficulty] || '';
            if (cat && diff) return `${cat} · ${diff}`;
            return cat || diff || '';
        }

        function updateSessionProgress() {
            if (!app.sessionProgressEl || !app.progressCurrentEl || !app.progressTotalEl) return;

            if (app.gameActive && app.sessionLength > 0) {
                app.sessionProgressEl.hidden = false;
                app.progressCurrentEl.textContent = String(Math.min(app.currentLevel + 1, app.sessionLength));
                app.progressTotalEl.textContent = String(app.sessionLength);
            } else {
                app.sessionProgressEl.hidden = true;
            }
        }

        function updateQuestionMeta(question) {
            if (!app.questionMetaEl) return;
            const text = formatQuestionMeta(question);
            if (app.gameActive && text) {
                app.questionMetaEl.hidden = false;
                app.questionMetaEl.textContent = text;
            } else {
                app.questionMetaEl.hidden = true;
                app.questionMetaEl.textContent = '';
            }
        }

        function showQuestionFact(fact) {
            if (!app.questionFactEl) return;
            if (fact && String(fact).trim()) {
                app.questionFactEl.hidden = false;
                app.questionFactEl.textContent = fact;
            } else {
                app.questionFactEl.hidden = true;
                app.questionFactEl.textContent = '';
            }
        }

        function applyAnswerHighlights(selectedAnswer, correctAnswer) {
            const correctNorm = app.normVal(correctAnswer);
            const selectedNorm = selectedAnswer ? app.normVal(selectedAnswer) : '';
            const wasCorrect = !!(selectedNorm && selectedNorm === correctNorm);

            app.answerOptions.querySelectorAll('.answer-btn').forEach((btn) => {
                const val = app.normVal(btn.dataset.answer || btn.innerText);
                btn.classList.remove('is-correct', 'is-wrong', 'is-dim', 'is-pending', 'is-eliminated');
                btn.disabled = true;

                if (val === correctNorm) {
                    btn.classList.add('is-correct');
                } else if (!wasCorrect && selectedNorm && val === selectedNorm) {
                    btn.classList.add('is-wrong');
                } else {
                    btn.classList.add('is-dim');
                }
            });
        }

        function markPendingAnswer(choice) {
            const choiceNorm = app.normVal(choice);
            app.answerOptions.querySelectorAll('.answer-btn').forEach((btn) => {
                if (app.normVal(btn.dataset.answer || btn.innerText) === choiceNorm) {
                    btn.classList.add('is-pending');
                }
            });
        }

        function beginAnswerReveal(question, selectedAnswer, onComplete) {
            if (!question) {
                if (onComplete) onComplete();
                return;
            }
            app.answerRevealActive = true;
            applyAnswerHighlights(selectedAnswer, question.a);
            updateQuestionMeta(question);
            showQuestionFact(question.fact);
            setAnswerInteractivity();
            updateHud();

            clearRevealTimer();
            app.revealTimerId = setTimeout(() => {
                app.revealTimerId = null;
                app.answerRevealActive = false;
                clearAnswerFeedback();
                if (onComplete) onComplete();
                flushPendingRemoteState();
            }, REVEAL_MS);
        }

        function flushPendingRemoteState() {
            if (!app.pendingRemoteState) return;
            const payload = app.pendingRemoteState;
            app.pendingRemoteState = null;
            app.applyRemoteState(payload);
        }

        function updateScoreDisplay() {
            if (!app.scoreVal) return;
            if (app.usesMultiScore()) {
                app.scoreVal.innerText = `P1 ${app.playerScores[0]} · P2 ${app.playerScores[1]}`;
            } else {
                app.scoreVal.innerText = app.score.toString().padStart(4, '0');
            }
        }

        function updateHud() {
            const multi = app.isMultiplayer();

            if (app.playerTurnEl) {
                app.playerTurnEl.hidden = !multi || !app.gameActive;
                if (multi && app.gameActive) {
                    const slot = app.mySlot();
                    if (app.playerLives[slot] <= 0) {
                        app.playerTurnEl.textContent = 'NO LIVES LEFT';
                    } else if (app.roundAnswers[slot] !== null || app.solvedThisQuestion[slot]) {
                        app.playerTurnEl.textContent = 'WAITING FOR OPPONENT…';
                    } else {
                        app.playerTurnEl.textContent = 'ANSWER WHEN READY';
                    }
                }
            }

            if (app.modeBadgeEl) {
                app.modeBadgeEl.hidden = !app.gameActive;
                if (app.gameActive) {
                    app.modeBadgeEl.textContent = MODE_LABELS[app.gameMode] || '';
                }
            }

            if (app.timerDisplay) {
                const showTimer = app.gameActive && app.gameMode === 'blitz' && !app.answerRevealActive;
                app.timerDisplay.hidden = !showTimer;
                if (!showTimer) app.timerDisplay.classList.remove('is-urgent');
            }

            updateSessionProgress();
            const inPlay =
                app.gameActive && !app.questionDisplay?.classList.contains('is-end');
            app.quizScreen?.classList.toggle('is-playing', inPlay);
            syncHudClearance();
            app.updatePowerupBar();
        }

        function syncHudClearance() {
            if (!app.quizScreen?.classList.contains('active') || app.hudSyncQueued) return;

            app.hudSyncQueued = true;
            requestAnimationFrame(() => {
                app.hudSyncQueued = false;
                if (!app.quizScreen?.classList.contains('active')) return;
                const hud = document.querySelector('.game-hud');
                if (!hud) return;
                const bottom = hud.getBoundingClientRect().bottom;
                app.quizScreen.style.setProperty('--hud-clearance', `${Math.ceil(bottom + 20)}px`);
            });
        }

        function syncQuestionLength() {
            if (!app.questionDisplay) return;

            if (app.questionDisplay.classList.contains('is-end')) {
                app.questionDisplay.classList.remove('is-long', 'is-very-long');
                return;
            }

            const len = app.questionDisplay.innerText.trim().length;
            app.questionDisplay.classList.toggle('is-long', len > 95);
            app.questionDisplay.classList.toggle('is-very-long', len > 155);
        }

        function setAnswerInteractivity() {
            let canPlay = app.gameActive && !app.answerRevealActive;
            if (app.isMultiplayer()) canPlay = canPlay && app.slotCanAnswer(app.getAnswerSlot());
            app.answerOptions.querySelectorAll('.answer-btn').forEach((btn) => {
                if (btn.classList.contains('is-eliminated')) {
                    btn.disabled = true;
                    return;
                }
                btn.disabled = !canPlay;
            });
        }

        function lifeSlotCount() {
            const peak = app.isMultiplayer() ? Math.max(app.playerLives[0], app.playerLives[1]) : app.lives;
            return peak > app.MAX_LIVES ? app.MAX_LIVES_WITH_POD : app.MAX_LIVES;
        }

        function renderLives() {
            if (!app.livesDisplay) return;

            app.livesDisplay.innerHTML = '';
            const slots = lifeSlotCount();

            if (app.isMultiplayer()) {
                [0, 1].forEach((slot) => {
                    const row = document.createElement('div');
                    row.className = 'lives-row';
                    const label = document.createElement('span');
                    label.className = 'lives-label' + (slot === app.getAnswerSlot() ? ' is-you' : '');
                    label.textContent = `P${slot + 1}`;
                    row.appendChild(label);

                    for (let i = 0; i < slots; i++) {
                        const mark = document.createElement('span');
                        mark.className = 'life-mark' + (i < app.playerLives[slot] ? '' : ' is-lost');
                        mark.innerHTML = LIFE_ICON;
                        row.appendChild(mark);
                    }
                    app.livesDisplay.appendChild(row);
                });
                app.livesDisplay.setAttribute('aria-label', 'Player lives');
                return;
            }

            for (let i = 0; i < slots; i++) {
                const mark = document.createElement('span');
                mark.className = 'life-mark' + (i < app.lives ? '' : ' is-lost');
                mark.innerHTML = LIFE_ICON;
                app.livesDisplay.appendChild(mark);
            }

            app.livesDisplay.setAttribute(
                'aria-label',
                `${app.lives} ${app.lives === 1 ? 'life remaining' : 'lives remaining'}`
            );

            syncHudClearance();
        }

        function setEndLossUi(active) {
            app.quizScreen?.classList.toggle('is-end-loss', !!active);
        }

        function hideEndScreen() {
            if (app.endActions) app.endActions.hidden = true;
            setEndLossUi(false);
        }

        function showEndScreen(won) {
            if (app.endActions) app.endActions.hidden = false;
            setEndLossUi(won === false);
            updateEndScreenButtons();
        }

        function updateEndScreenButtons() {
            if (!app.playAgainBtn) return;
            const canReplay = !!app.gameMode && !app.replayBlocked && (!app.isOnlineMulti() || app.lobby?.isHost());
            app.playAgainBtn.hidden = !canReplay;
            app.playAgainBtn.disabled = !canReplay;
        }

        function bestScoreStorageKey(mode) {
            const m = mode || app.gameMode || 'classic';
            return app.usesMultiScore() ? `online-${m}` : m;
        }

        function loadBestScores() {
            try {
                const raw = localStorage.getItem(BEST_SCORE_KEY);
                if (raw) return JSON.parse(raw);
            } catch (_) { /* ignore */ }
            return {};
        }

        function saveBestScores(data) {
            try {
                localStorage.setItem(BEST_SCORE_KEY, JSON.stringify(data));
            } catch (_) { /* ignore */ }
        }

        function formatEndScore() {
            if (app.usesMultiScore()) {
                return `P1: ${app.playerScores[0]} · P2: ${app.playerScores[1]}`;
            }
            return String(app.score).padStart(4, '0');
        }

        function getSessionScoreValue() {
            if (app.usesMultiScore()) return app.playerScores[app.mySlot()] || 0;
            return app.score;
        }

        function formatBestScoreValue(value) {
            if (app.usesMultiScore()) return String(value);
            return String(value).padStart(4, '0');
        }

        function recordBestScore() {
            const mode = app.gameMode || 'classic';
            const key = bestScoreStorageKey(mode);
            const sessionScore = getSessionScoreValue();
            const all = loadBestScores();
            const previous = all[key] || 0;
            const isNewRecord = sessionScore > previous;

            if (isNewRecord) {
                all[key] = sessionScore;
                saveBestScores(all);
            }

            return {
                best: isNewRecord ? sessionScore : previous,
                isNewRecord,
                sessionScore,
            };
        }

        function buildEndDisplayHtml(won, headlineOverride) {
            const scoreLine = formatEndScore();
            const headline = headlineOverride || (won ? 'MISSION COMPLETE' : 'SIGNAL LOST');
            const best = recordBestScore();

            let stats =
                `<span class="end-stat end-score"><span class="end-stat-label">SCORE</span> <span class="end-stat-value">${scoreLine}</span></span>`;

            if (best.isNewRecord && best.sessionScore > 0) {
                stats += `<span class="end-stat end-best is-new"><span class="end-stat-label">NEW BEST</span> <span class="end-stat-value">${formatBestScoreValue(best.best)}</span></span>`;
            } else if (best.best > 0) {
                stats += `<span class="end-stat end-best"><span class="end-stat-label">BEST</span> <span class="end-stat-value">${formatBestScoreValue(best.best)}</span></span>`;
            }

            return `${headline}<div class="end-stats">${stats}</div>`;
        }

        app.clearAnswerFeedback = clearAnswerFeedback;
        app.updateQuestionMeta = updateQuestionMeta;
        app.markPendingAnswer = markPendingAnswer;
        app.beginAnswerReveal = beginAnswerReveal;
        app.updateScoreDisplay = updateScoreDisplay;
        app.updateHud = updateHud;
        app.syncHudClearance = syncHudClearance;
        app.syncQuestionLength = syncQuestionLength;
        app.setAnswerInteractivity = setAnswerInteractivity;
        app.renderLives = renderLives;
        app.hideEndScreen = hideEndScreen;
        app.showEndScreen = showEndScreen;
        app.updateEndScreenButtons = updateEndScreenButtons;
        app.buildEndDisplayHtml = buildEndDisplayHtml;
    });
})(window);
