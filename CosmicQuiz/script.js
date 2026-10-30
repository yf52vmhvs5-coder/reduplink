/**
 * Cosmic Quiz — Match controller
 *
 * Screens, single-player flow, Blitz clock, and input.
 * Deck, power-ups, HUD, and online sync live in their own files and register
 * on window.CosmicQuiz. Load order is fixed in index.html.
 */
document.addEventListener('DOMContentLoaded', () => {
    const startScreen = document.getElementById('start-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const modeScreen = document.getElementById('mode-screen');
    const quizScreen = document.getElementById('quiz-screen');
    const questionDisplay = document.getElementById('question-display');
    const answerOptions = document.getElementById('answer-options');
    const endActions = document.getElementById('end-actions');
    const backMenuBtn = document.getElementById('back-menu-btn');
    const playAgainBtn = document.getElementById('play-again-btn');
    const modeBackBtn = document.getElementById('mode-back-btn');
    const lobbyBackBtn = document.getElementById('lobby-back-btn');
    const lobbyStatus = document.getElementById('lobby-status');
    const lobbyIdle = document.getElementById('lobby-idle');
    const lobbyActive = document.getElementById('lobby-active');
    const lobbyCodeDisplay = document.getElementById('lobby-code-display');
    const lobbyWaitingText = document.getElementById('lobby-waiting-text');
    const lobbyCodeInput = document.getElementById('lobby-code-input');
    const modeHostHint = document.getElementById('mode-host-hint');
    const scoreVal = document.getElementById('score-val');
    const livesDisplay = document.getElementById('lives-display');
    const playerTurnEl = document.getElementById('player-turn');
    const modeBadgeEl = document.getElementById('mode-badge');
    const timerDisplay = document.getElementById('timer-display');
    const sessionProgressEl = document.getElementById('session-progress');
    const progressCurrentEl = document.getElementById('progress-current');
    const progressTotalEl = document.getElementById('progress-total');
    const questionMetaEl = document.getElementById('question-meta');
    const questionFactEl = document.getElementById('question-fact');
    const questionContainer = document.querySelector('.question-container');
    const powerupBar = document.getElementById('powerup-bar');
    const stardustValEl = document.getElementById('stardust-val');
    const aboutScreen = document.getElementById('about-screen');
    const audio = window.CosmicAudio;
    const lobby = window.CosmicLobby;
    const baseTriviaData = window.TRIVIA_DATA || [];

    const MAX_LIVES = 3;
    const MAX_LIVES_WITH_POD = 4;
    const BLITZ_SECONDS = 15;
    const screens = [startScreen, lobbyScreen, modeScreen, quizScreen];

    const app = {
        startScreen,
        lobbyScreen,
        modeScreen,
        quizScreen,
        questionDisplay,
        answerOptions,
        endActions,
        playAgainBtn,
        lobbyStatus,
        lobbyIdle,
        lobbyActive,
        lobbyCodeDisplay,
        lobbyWaitingText,
        modeHostHint,
        scoreVal,
        livesDisplay,
        playerTurnEl,
        modeBadgeEl,
        timerDisplay,
        sessionProgressEl,
        progressCurrentEl,
        progressTotalEl,
        questionMetaEl,
        questionFactEl,
        powerupBar,
        stardustValEl,
        audio,
        lobby,
        baseTriviaData,
        MAX_LIVES,
        MAX_LIVES_WITH_POD,
        playType: 'single',
        activeDeck: baseTriviaData,
        sessionSeed: 0,
        gameMode: 'classic',
        currentLevel: 0,
        score: 0,
        lives: MAX_LIVES,
        playerLives: [MAX_LIVES, MAX_LIVES],
        playerScores: [0, 0],
        currentPlayer: 0,
        roundAnswers: [null, null],
        gameActive: false,
        questionIndex: 0,
        blitzRemaining: 0,
        blitzTimerId: null,
        blitzDeadline: 0,
        blitzTickSecond: -1,
        applyingRemote: false,
        sessionLength: 0,
        answerRevealActive: false,
        revealTimerId: null,
        stardust: 0,
        playerStardust: [0, 0],
        shieldActive: false,
        playerShieldActive: [false, false],
        playerFiftyUsed: [false, false],
        hiddenAnswersBySlot: [[], []],
        suppressStateBroadcast: false,
        pendingRemoteState: null,
        questionNonce: 0,
        remoteQuestionNonce: -1,
        onlineSession: false,
        myOnlineSlot: 0,
        replayBlocked: false,
        solvedThisQuestion: [false, false],
        roundBlitzBonus: [0, 0],
        pendingBlitzBonus: 0,
        powerupSendPending: false,
        powerupUnlockTimer: null,
        hudSyncQueued: false,
    };

    function sfx(id, detail) {
        const pending = audio?.play(id, detail);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    }

    function normVal(value) {
        return String(value).toUpperCase().trim();
    }

    function resetQuestionScroll() {
        if (questionContainer) questionContainer.scrollTop = 0;
    }

    function blitzPointsBonus() {
        const remaining = app.blitzDeadline
            ? Math.max(0, Math.ceil((app.blitzDeadline - Date.now()) / 1000))
            : app.blitzRemaining;
        return Math.max(0, Math.floor(remaining * 0.5));
    }

    function closeAbout(immediate) {
        if (!aboutScreen || aboutScreen.hidden) {
            startScreen?.removeAttribute('inert');
            return;
        }
        aboutScreen.classList.remove('is-open');
        let settled = false;
        const release = () => {
            if (settled || aboutScreen.classList.contains('is-open')) return;
            settled = true;
            aboutScreen.hidden = true;
            startScreen?.removeAttribute('inert');
        };
        if (immediate) {
            release();
            return;
        }
        const finish = (ev) => {
            if (ev && ev.target !== aboutScreen) return;
            if (ev && ev.propertyName !== 'opacity') return;
            aboutScreen.removeEventListener('transitionend', finish);
            release();
        };
        aboutScreen.addEventListener('transitionend', finish);
        window.setTimeout(() => {
            aboutScreen.removeEventListener('transitionend', finish);
            release();
        }, 460);
    }

    function openAbout() {
        if (!aboutScreen) return;
        startScreen?.setAttribute('inert', '');
        aboutScreen.hidden = false;
        window.requestAnimationFrame(() => aboutScreen.classList.add('is-open'));
    }

    function showScreen(screen) {
        if (screen === startScreen && startScreen.classList.contains('intro-played')) {
            startScreen.classList.add('is-returning');
        }
        closeAbout(true);
        screens.forEach((el) => {
            if (el) el.classList.toggle('active', el === screen);
        });
        if (screen === quizScreen) app.syncHudClearance();
    }

    function isOnlineMulti() {
        return app.playType === 'online' && lobby?.isConnected();
    }

    function isMultiplayer() {
        return isOnlineMulti();
    }

    function usesMultiScore() {
        return app.onlineSession || isOnlineMulti();
    }

    function mySlot() {
        if (isOnlineMulti()) return lobby.isHost() ? 0 : 1;
        if (app.onlineSession) return app.myOnlineSlot;
        return app.currentPlayer;
    }

    function getAnswerSlot() {
        return mySlot();
    }

    function slotCanAnswer(slot) {
        if (!isMultiplayer()) return true;
        if (app.playerLives[slot] <= 0) return false;
        if (app.solvedThisQuestion[slot]) return false;
        return app.roundAnswers[slot] === null;
    }

    function livingPlayers() {
        return [0, 1].filter((slot) => app.playerLives[slot] > 0);
    }

    function allLivingAnswered() {
        return livingPlayers().every((slot) => app.solvedThisQuestion[slot] || app.roundAnswers[slot] !== null);
    }

    function resetRound() {
        app.roundAnswers = [null, null];
        app.roundBlitzBonus = [0, 0];
    }

    function clearBlitzTimer() {
        if (app.blitzTimerId !== null) {
            clearTimeout(app.blitzTimerId);
            app.blitzTimerId = null;
        }
        app.blitzTickSecond = -1;
    }

    function updateModeScreenForRole() {
        const guest = isOnlineMulti() && lobby.isGuest();
        modeScreen?.classList.toggle('is-guest', guest);
        if (modeHostHint) modeHostHint.hidden = !guest;
    }

    function openModeSelect(type) {
        app.playType = type;
        updateModeScreenForRole();
        showScreen(modeScreen);
    }

    function goToHostModeSelect() {
        if (!lobby?.isHost()) return;
        setLobbyStatus('Friend connected — choose a mode');
        if (lobbyWaitingText) lobbyWaitingText.textContent = 'Friend is in the room';
        openModeSelect('online');
    }

    function goToGuestModeSelect() {
        if (!lobby?.isGuest()) return;
        setLobbyStatus('Connected — waiting for host to choose a mode');
        openModeSelect('online');
    }

    function openLobby() {
        app.playType = 'online';
        if (location.protocol === 'file:') {
            setLobbyStatus('Use a local server (Live Server), not the file directly');
        } else {
            setLobbyStatus('Create a room or join with a code (max 2 players)');
        }
        showLobbyPanels(false);
        showScreen(lobbyScreen);
    }

    function setLobbyStatus(text) {
        if (lobbyStatus) lobbyStatus.textContent = text;
    }

    function showLobbyPanels(active) {
        if (lobbyIdle) lobbyIdle.hidden = active;
        if (lobbyActive) lobbyActive.hidden = !active;
    }

    function returnToMenu() {
        app.gameActive = false;
        app.onlineSession = false;
        app.replayBlocked = false;
        app.pendingRemoteState = null;
        app.clearPowerupPending();
        clearBlitzTimer();
        app.clearAnswerFeedback();
        app.hideEndScreen();
        answerOptions.style.display = 'none';
        answerOptions.innerHTML = '';
        questionDisplay.innerText = 'WAITING FOR QUESTIONS...';
        app.activeDeck = baseTriviaData;
        app.resetPowerupSession();
        app.updateHud();

        if (lobby) lobby.leave();
        app.playType = 'single';
        modeScreen?.classList.remove('is-guest');
        if (modeHostHint) modeHostHint.hidden = true;
        showScreen(startScreen);
    }

    function adoptDeck(seed) {
        const built = CosmicDeck.build(seed);
        app.activeDeck = built.deck;
        app.sessionLength = built.sessionLength;
    }

    function endGame(won, headline) {
        app.gameActive = false;
        clearBlitzTimer();
        app.clearAnswerFeedback();
        answerOptions.style.display = 'none';
        app.showEndScreen(won);
        app.updateHud();
        app.setAnswerInteractivity();

        app.replayBlocked = headline === 'OPPONENT LEFT';
        app.updateQuestionMeta(null);
        questionDisplay?.classList.add('is-end');
        questionDisplay.innerHTML = app.buildEndDisplayHtml(won, headline);
        app.syncQuestionLength();
        resetQuestionScroll();

        if (won && !headline && !app.applyingRemote) sfx('victory');

        app.updateEndScreenButtons();

        if (isOnlineMulti() && lobby.isHost()) {
            lobby.send({
                type: 'state',
                gameMode: app.gameMode,
                currentLevel: app.currentLevel,
                sessionLength: app.sessionLength,
                playerLives: app.playerLives.slice(),
                playerScores: app.playerScores.slice(),
                roundAnswers: [null, null],
                gameActive: false,
                questionIndex: app.questionIndex,
                end: { won, headline: headline || null },
                question: null,
                blitzDeadline: null,
            });
        }
    }

    function startBlitzTimer() {
        clearBlitzTimer();
        if (app.gameMode !== 'blitz' || !app.gameActive || app.answerRevealActive) return;

        if (!app.blitzDeadline) {
            app.blitzDeadline = Date.now() + BLITZ_SECONDS * 1000;
        }

        const tick = () => {
            app.blitzTimerId = null;
            if (!app.gameActive || app.gameMode !== 'blitz' || app.answerRevealActive) return;

            const msLeft = app.blitzDeadline - Date.now();
            app.blitzRemaining = Math.max(0, Math.ceil(msLeft / 1000));
            if (timerDisplay) {
                timerDisplay.textContent = `TIME ${String(app.blitzRemaining).padStart(2, '0')}s`;
                timerDisplay.classList.toggle('is-urgent', app.blitzRemaining <= 5);
            }

            if (app.blitzRemaining !== app.blitzTickSecond) {
                if (app.blitzTickSecond !== -1 && app.blitzRemaining > 0 && !app.applyingRemote) {
                    const pending = audio?.playBlitzTick(app.blitzRemaining, BLITZ_SECONDS);
                    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
                }
                app.blitzTickSecond = app.blitzRemaining;
            }

            if (app.blitzRemaining <= 0) {
                clearBlitzTimer();
                if (isMultiplayer()) {
                    if (!isOnlineMulti() || lobby.isHost()) app.resolveRound();
                } else {
                    handleWrongAnswer(true);
                }
                return;
            }

            const delay = (msLeft % 1000) || 1000;
            app.blitzTimerId = setTimeout(tick, delay);
        };

        tick();
    }

    function advanceAfterAnswer() {
        app.currentLevel++;
    }

    function shakeQuiz() {
        quizScreen.classList.add('error-shake');
        setTimeout(() => quizScreen.classList.remove('error-shake'), 400);
    }

    function handleWrongAnswer(fromTimeout, fromReveal) {
        if (!app.gameActive) return;

        if (!fromReveal && fromTimeout) {
            const question = app.activeDeck[app.currentLevel];
            if (!question) return;
            if (!app.applyingRemote) sfx('wrong');
            shakeQuiz();
            app.beginAnswerReveal(question, null, () => handleWrongAnswer(fromTimeout, true));
            return;
        }

        if (!fromTimeout && !fromReveal && !app.applyingRemote) {
            sfx('wrong');
        }

        if (app.shieldActive) {
            app.shieldActive = false;
            if (!fromReveal) shakeQuiz();
            app.updatePowerupBar();
        } else {
            app.lives--;
            if (!app.applyingRemote) sfx('lifeLost');
            app.renderLives();
            if (!fromReveal) shakeQuiz();
        }

        if (app.lives <= 0) {
            if (!app.applyingRemote) sfx('gameOver');
            endGame(false);
            return;
        }

        if (app.gameMode === 'classic' || app.gameMode === 'blitz') {
            advanceAfterAnswer();
            if (app.currentLevel >= app.sessionLength) {
                endGame(true);
                return;
            }
            renderQuestion();
        } else {
            // Same question, same choices. A spent 50-50 stays spent.
            app.restoreFiftyHidden();
            app.setAnswerInteractivity();
            app.updateHud();
        }
    }

    function handleCorrectAnswer(fromReveal) {
        if (!app.gameActive) return;

        if (!fromReveal) clearBlitzTimer();
        if (!fromReveal && !app.applyingRemote) sfx('correct');

        let points = 10;
        if (app.gameMode === 'blitz') points += app.pendingBlitzBonus;
        app.score += points;
        app.updateScoreDisplay();
        app.addStardustReward(0);

        advanceAfterAnswer();
        if (app.currentLevel >= app.sessionLength) {
            endGame(true);
            return;
        }
        renderQuestion();
    }

    function processAnswer(selectedAnswer) {
        if (!app.gameActive || isMultiplayer() || app.answerRevealActive) return;

        const question = app.activeDeck[app.currentLevel];
        if (!question) return;

        app.pendingBlitzBonus = app.gameMode === 'blitz' ? blitzPointsBonus() : 0;
        clearBlitzTimer();

        const isCorrect = normVal(selectedAnswer) === normVal(question.a);

        if (isCorrect && !app.applyingRemote) sfx('correct');
        else if (!app.applyingRemote) sfx('wrong');

        if (!isCorrect) shakeQuiz();

        app.beginAnswerReveal(question, selectedAnswer, () => {
            if (isCorrect) {
                handleCorrectAnswer(true);
            } else {
                handleWrongAnswer(false, true);
            }
        });
    }

    function handleAnswerSelection(selectedAnswer) {
        if (!app.gameActive || app.answerRevealActive) return;

        if (isMultiplayer()) {
            app.registerAnswer(getAnswerSlot(), selectedAnswer);
            return;
        }

        sfx('click');
        processAnswer(selectedAnswer);
    }

    function getAnswerChoices(questionData, level) {
        const wrongChoices = Array.isArray(questionData.wrong) ? questionData.wrong.slice(0, 3) : [];
        const correctAnswer = questionData.a;
        const options = [correctAnswer, ...wrongChoices];

        if (isOnlineMulti()) {
            return CosmicDeck.shuffleWithSeed(options, app.sessionSeed + level * 31 + 7);
        }
        return CosmicDeck.shuffleArray(options);
    }

    function renderChoiceButtons(choices) {
        answerOptions.innerHTML = '';
        choices.forEach((choice) => {
            const button = document.createElement('button');
            button.className = 'answer-btn';
            button.type = 'button';
            button.dataset.answer = choice;
            button.innerText = choice;
            button.onclick = () => handleAnswerSelection(choice);
            answerOptions.appendChild(button);
        });
        app.setAnswerInteractivity();
    }

    function startGame(mode) {
        app.gameMode = mode;
        app.currentLevel = 0;
        app.questionIndex = 0;
        app.questionNonce = 0;
        app.remoteQuestionNonce = -1;
        app.score = 0;
        app.lives = MAX_LIVES;
        app.playerLives = [MAX_LIVES, MAX_LIVES];
        app.playerScores = [0, 0];
        app.currentPlayer = 0;
        app.solvedThisQuestion = [false, false];
        app.pendingBlitzBonus = 0;
        app.replayBlocked = false;
        app.clearPowerupPending();
        resetRound();
        app.gameActive = true;
        app.blitzDeadline = 0;
        app.resetPowerupSession();
        app.suppressStateBroadcast = true;
        app.onlineSession = isOnlineMulti();
        if (app.onlineSession) app.myOnlineSlot = lobby.isHost() ? 0 : 1;

        if (isOnlineMulti() && lobby.isHost()) {
            app.sessionSeed = (Date.now() ^ (Math.random() * 0x7fffffff)) % 1000000000;
            if (app.sessionSeed <= 0) app.sessionSeed = 1;
            adoptDeck(app.sessionSeed);
        } else if (!isOnlineMulti()) {
            adoptDeck();
        }

        app.updateScoreDisplay();

        showScreen(quizScreen);
        answerOptions.style.display = 'flex';
        app.hideEndScreen();
        app.updateHud();
        app.renderLives();
        if (!app.applyingRemote) sfx('start');
        renderQuestion();
        app.suppressStateBroadcast = false;

        if (isOnlineMulti() && lobby.isHost()) {
            app.hostBroadcastStart(mode);
        }
    }

    function renderQuestion() {
        if (!app.gameActive) return;

        if (app.currentLevel < app.sessionLength) {
            const currentQuestion = app.activeDeck[app.currentLevel];
            if (!currentQuestion) {
                endGame(app.currentLevel > 0);
                return;
            }

            app.questionNonce += 1;
            app.solvedThisQuestion = [false, false];
            resetRound();
            const choices = getAnswerChoices(currentQuestion, app.currentLevel);

            CosmicDeck.remember(currentQuestion.q);

            app.clearAnswerFeedback();
            app.resetQuantum50State();

            if (app.questionIndex > 0 && !app.applyingRemote) sfx('question');
            app.questionIndex++;

            questionDisplay.classList.remove('is-end');
            questionDisplay.innerText = currentQuestion.q;
            resetQuestionScroll();
            questionDisplay.style.animation = 'none';
            questionDisplay.offsetHeight;
            questionDisplay.style.animation = '';
            app.updateQuestionMeta(currentQuestion);
            renderChoiceButtons(choices);

            if (app.gameMode === 'blitz') {
                app.blitzDeadline = Date.now() + BLITZ_SECONDS * 1000;
            }

            app.syncQuestionLength();
            app.updateHud();
            app.updatePowerupBar();
            startBlitzTimer();
            app.setAnswerInteractivity();

            if (isOnlineMulti() && lobby.isHost() && !app.applyingRemote && !app.suppressStateBroadcast) {
                app.hostBroadcastState(app.questionPayload(currentQuestion, app.currentLevel));
            }
        } else {
            endGame(true);
        }
    }

    async function playAgain() {
        if (!app.gameMode) return;
        if (isOnlineMulti() && !lobby?.isHost()) return;

        sfx('click');
        await audio?.unlock();
        questionDisplay?.classList.remove('is-end');
        startGame(app.gameMode);
    }

    app.sfx = sfx;
    app.normVal = normVal;
    app.resetQuestionScroll = resetQuestionScroll;
    app.blitzPointsBonus = blitzPointsBonus;
    app.showScreen = showScreen;
    app.isOnlineMulti = isOnlineMulti;
    app.isMultiplayer = isMultiplayer;
    app.usesMultiScore = usesMultiScore;
    app.mySlot = mySlot;
    app.getAnswerSlot = getAnswerSlot;
    app.slotCanAnswer = slotCanAnswer;
    app.livingPlayers = livingPlayers;
    app.allLivingAnswered = allLivingAnswered;
    app.resetRound = resetRound;
    app.clearBlitzTimer = clearBlitzTimer;
    app.startBlitzTimer = startBlitzTimer;
    app.setLobbyStatus = setLobbyStatus;
    app.showLobbyPanels = showLobbyPanels;
    app.goToHostModeSelect = goToHostModeSelect;
    app.goToGuestModeSelect = goToGuestModeSelect;
    app.shakeQuiz = shakeQuiz;
    app.endGame = endGame;
    app.getAnswerChoices = getAnswerChoices;
    app.renderChoiceButtons = renderChoiceButtons;
    app.renderQuestion = renderQuestion;
    app.adoptDeck = adoptDeck;

    (window.CosmicQuiz?._modules || []).forEach((fn) => fn(app));

    const required = [
        'updateHud',
        'tryUsePowerup',
        'applyRemoteState',
        'onLobbyMessage',
        'renderLives',
        'beginAnswerReveal',
        'hostBroadcastStart',
        'resetPowerupSession',
        'restoreFiftyHidden',
    ];
    required.forEach((name) => {
        if (typeof app[name] !== 'function') {
            throw new Error('Cosmic Quiz module missing: ' + name);
        }
    });

    if (lobby) {
        lobby.onMessage(app.onLobbyMessage);
        lobby.onStatus(app.onLobbyStatus);
    }

    document.getElementById('single-btn').onclick = async () => {
        sfx('click');
        await audio?.unlock();
        openModeSelect('single');
    };

    document.getElementById('multi-btn').onclick = async () => {
        sfx('click');
        await audio?.unlock();
        if (typeof Peer === 'undefined') {
            setLobbyStatus('Online play unavailable — check your connection');
            openLobby();
            return;
        }
        openLobby();
    };

    document.getElementById('about-btn')?.addEventListener('click', async () => {
        sfx('click');
        await audio?.unlock();
        openAbout();
    });

    document.getElementById('about-back-btn')?.addEventListener('click', async () => {
        sfx('click');
        await audio?.unlock();
        closeAbout(false);
    });

    document.getElementById('lobby-create-btn')?.addEventListener('click', async () => {
        sfx('click');
        await audio?.unlock();
        if (typeof Peer === 'undefined') {
            setLobbyStatus('PeerJS failed to load');
            return;
        }
        try {
            const code = await lobby.createRoom();
            if (lobbyCodeDisplay) lobbyCodeDisplay.textContent = code;
        } catch (_) { /* status handler shows error */ }
    });

    document.getElementById('lobby-join-btn')?.addEventListener('click', async () => {
        sfx('click');
        await audio?.unlock();
        if (typeof Peer === 'undefined') {
            setLobbyStatus('PeerJS failed to load');
            return;
        }
        try {
            await lobby.joinRoom(lobbyCodeInput?.value || '');
        } catch (_) { /* status handler shows error */ }
    });

    lobbyCodeInput?.addEventListener('input', () => {
        lobbyCodeInput.value = lobbyCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    lobbyCodeInput?.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        document.getElementById('lobby-join-btn')?.click();
    });

    if (lobbyBackBtn) {
        lobbyBackBtn.addEventListener('click', async () => {
            sfx('click');
            await audio?.unlock();
            if (lobby) lobby.leave();
            showScreen(startScreen);
        });
    }

    if (modeBackBtn) {
        modeBackBtn.addEventListener('click', async () => {
            sfx('click');
            await audio?.unlock();
            if (isOnlineMulti()) {
                if (lobby) lobby.leave();
                openLobby();
            } else {
                showScreen(startScreen);
            }
        });
    }

    document.querySelectorAll('.mode-option').forEach((btn) => {
        btn.addEventListener('click', async () => {
            if (isOnlineMulti() && lobby.isGuest()) return;

            sfx('click');
            await audio?.unlock();
            startGame(btn.dataset.mode || 'classic');
        });
    });

    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => playAgain());
    }

    if (backMenuBtn) {
        backMenuBtn.addEventListener('click', async () => {
            sfx('click');
            await audio?.unlock();
            returnToMenu();
        });
    }

    powerupBar?.querySelectorAll('.powerup-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.powerup;
            if (id) app.tryUsePowerup(id);
        });
    });

    document.addEventListener('keydown', (ev) => {
        if (ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        const target = ev.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        if (!quizScreen?.classList.contains('active')) return;
        if (ev.key < '1' || ev.key > '4') return;

        const buttons = answerOptions.querySelectorAll('.answer-btn');
        const button = buttons[Number(ev.key) - 1];
        if (!button || button.disabled) return;
        ev.preventDefault();
        button.click();
    });

    const soundBtn = document.getElementById('sound-toggle-btn');

    function updateSoundButton() {
        if (!soundBtn) return;
        const on = audio?.isEnabled() !== false;
        soundBtn.classList.toggle('is-active', on);
        soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
    }

    if (soundBtn && audio) {
        updateSoundButton();
        soundBtn.addEventListener('click', async () => {
            await audio.unlock();
            const on = audio.toggle();
            updateSoundButton();
            if (on) audio.play('click');
        });
    }

    const fullscreenBtn = document.getElementById('fullscreen-toggle-btn');

    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function updateFullscreenButton() {
        if (!fullscreenBtn) return;

        const active = isFullscreen();
        fullscreenBtn.classList.toggle('is-active', active);
        fullscreenBtn.setAttribute(
            'aria-label',
            active ? 'Exit fullscreen' : 'Fullscreen'
        );
    }

    async function toggleFullscreen() {
        try {
            if (isFullscreen()) {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            } else {
                const root = document.documentElement;
                if (root.requestFullscreen) {
                    await root.requestFullscreen();
                } else if (root.webkitRequestFullscreen) {
                    root.webkitRequestFullscreen();
                }
            }
        } catch (err) {
            console.warn('Fullscreen unavailable:', err);
        }
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            sfx('click');
            toggleFullscreen();
        });
        document.addEventListener('fullscreenchange', updateFullscreenButton);
        document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
        updateFullscreenButton();
    }

    window.addEventListener('resize', () => app.syncHudClearance());
    document.addEventListener('fullscreenchange', () => app.syncHudClearance());
    document.addEventListener('webkitfullscreenchange', () => app.syncHudClearance());

    const brandZone = startScreen?.querySelector('.brand-zone');
    const signalTintBtn = document.getElementById('signal-tint-btn');
    const SIGNAL_TINTS = [
        { color: '#ff2d2d', label: 'Blood rift' },
        { color: '#ff2ed1', label: 'Void signal' },
        { color: '#c86bff', label: 'Phase glow' },
        { color: '#8a2be2', label: 'Shifter' },
        { color: '#3da5ff', label: 'Phase cage' },
        { color: '#00e5ff', label: 'Velocity' },
        { color: '#ffdd22', label: 'Bounty' },
    ];
    const SIGNAL_TINT_KEY = 'cosmic-quiz-signal';

    function readSignalTint() {
        try {
            const saved = localStorage.getItem(SIGNAL_TINT_KEY);
            const match = SIGNAL_TINTS.find((entry) => entry.color === saved);
            if (match) return match;
        } catch (_) { /* ignore */ }
        return SIGNAL_TINTS[0];
    }

    const _signalCursorCache = {};

    function makeSignalCursor(color) {
        const key = color || '#ff2d2d';
        if (_signalCursorCache[key]) return _signalCursorCache[key];
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
            '<g stroke-linecap="butt" fill="none">' +
            '<g stroke="rgba(0,0,0,0.6)" stroke-width="5">' +
            '<line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/>' +
            '</g>' +
            '<g stroke="' + key + '" stroke-width="3">' +
            '<line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/>' +
            '</g>' +
            '</g></svg>';
        const value = "url('data:image/svg+xml;utf8," + encodeURIComponent(svg) + "') 10 10, cell";
        _signalCursorCache[key] = value;
        return value;
    }

    function updateSignalCursor(color) {
        const hex = typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
            ? color.toLowerCase()
            : '#ff2d2d';
        document.documentElement.style.setProperty('--app-cursor', makeSignalCursor(hex));
    }

    function applySignalTint(entry) {
        document.documentElement.style.setProperty('--signal', entry.color);
        updateSignalCursor(entry.color);
        if (signalTintBtn) {
            signalTintBtn.setAttribute('aria-label', `Signal tint, ${entry.label}`);
        }
    }

    function pulseSignalLogo() {
        if (!signalTintBtn) return;
        signalTintBtn.classList.remove('is-pulse');
        void signalTintBtn.offsetWidth;
        signalTintBtn.classList.add('is-pulse');
    }

    applySignalTint(readSignalTint());

    if (signalTintBtn) {
        signalTintBtn.addEventListener('animationend', () => {
            signalTintBtn.classList.remove('is-pulse');
        });
        signalTintBtn.addEventListener('click', () => {
            const current = (document.documentElement.style.getPropertyValue('--signal') || '').trim().toLowerCase();
            const index = SIGNAL_TINTS.findIndex((entry) => entry.color === current);
            const next = SIGNAL_TINTS[(index + 1) % SIGNAL_TINTS.length];
            applySignalTint(next);
            try {
                localStorage.setItem(SIGNAL_TINT_KEY, next.color);
            } catch (_) { /* ignore */ }
            pulseSignalLogo();
            sfx('click');
        });
    }

    function playStartIntro() {
        if (!startScreen || !brandZone) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            startScreen.classList.add('intro-ready', 'hub-title-settled', 'hub-actions-ready', 'intro-played');
            return;
        }
        const rect = brandZone.getBoundingClientRect();
        const dy = (window.innerHeight / 2) - (rect.top + rect.height / 2);
        brandZone.style.transition = 'none';
        brandZone.style.transform = `translateY(${Math.round(dy)}px)`;
        void brandZone.offsetWidth;
        brandZone.style.transition = '';
        startScreen.classList.add('intro-ready');
        window.setTimeout(() => {
            startScreen.classList.add('hub-title-settled');
            brandZone.style.transform = 'translateY(0)';
        }, 520);
        window.setTimeout(() => {
            startScreen.classList.add('hub-actions-ready', 'intro-played');
        }, 1650);
    }

    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(playStartIntro);
    });
});
