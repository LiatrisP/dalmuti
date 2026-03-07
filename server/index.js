require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const configuredClientOrigins = (process.env.CLIENT_URLS || 'http://localhost:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowVercelPreviewOrigins = process.env.ALLOW_VERCEL_PREVIEW !== 'false';

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (configuredClientOrigins.includes(origin)) {
    return true;
  }

  // Support Vercel preview deploy URLs unless explicitly disabled.
  if (allowVercelPreviewOrigins && /^https:\/\/.*\.vercel\.app$/i.test(origin)) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ['GET', 'POST'],
  credentials: true
};

const io = socketIo(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

const games = {};
const players = {};
const gameCodeToInternalId = {};

const DISPLAY_GAME_CODE_PATTERN = /^[0-9A-Za-z가-힣 _-]{2,30}$/;

function normalizeDisplayGameCode(rawCode) {
  if (typeof rawCode !== 'string') return '';
  return rawCode.trim().normalize('NFC');
}

function getDisplayCodeLookupKey(displayCode) {
  if (!displayCode) return '';
  return displayCode.toLocaleLowerCase('ko-KR');
}

function normalizeInternalGameCode(rawCode) {
  if (typeof rawCode !== 'string') return '';
  return rawCode.trim().toUpperCase();
}

function generateInternalGameId(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  while (true) {
    let candidate = '';
    for (let i = 0; i < length; i++) {
      candidate += chars[Math.floor(Math.random() * chars.length)];
    }

    if (!games[candidate]) {
      return candidate;
    }
  }
}

function registerGameCodeMapping(displayCode, internalGameId) {
  const key = getDisplayCodeLookupKey(displayCode);
  if (!key) return;
  gameCodeToInternalId[key] = internalGameId;
}

function unregisterGameCodeMapping(game) {
  if (!game) return;

  const key = getDisplayCodeLookupKey(game.displayCode);
  if (!key) return;

  if (gameCodeToInternalId[key] === game.gameId) {
    delete gameCodeToInternalId[key];
  }
}

function resolveGameByInputCode(rawCode) {
  const normalizedDisplayCode = normalizeDisplayGameCode(rawCode);
  const displayKey = getDisplayCodeLookupKey(normalizedDisplayCode);

  if (displayKey && gameCodeToInternalId[displayKey]) {
    return games[gameCodeToInternalId[displayKey]] || null;
  }

  const normalizedInternalCode = normalizeInternalGameCode(rawCode);
  if (normalizedInternalCode && games[normalizedInternalCode]) {
    return games[normalizedInternalCode];
  }

  return null;
}

function getPublicGamesList() {
  return Object.values(games)
    .filter(game => game.isPublic)
    .map(game => ({
      gameId: game.gameId,
      gameCode: game.displayCode || game.gameId,
      status: game.status,
      currentPlayers: game.players.length,
      maxPlayers: game.maxPlayers,
      maxRounds: game.maxRounds,
      joinable: game.status === 'waiting' && game.players.length < game.maxPlayers,
      ownerName: game.players.find(player => player.id === game.ownerId)?.name || '방장'
    }))
    .sort((a, b) => {
      if (a.joinable !== b.joinable) return a.joinable ? -1 : 1;
      return a.gameId.localeCompare(b.gameId);
    });
}

function emitPublicGamesList(targetSocketId = null) {
  const payload = getPublicGamesList();
  if (targetSocketId) {
    io.to(targetSocketId).emit('publicGamesList', payload);
    return;
  }

  io.emit('publicGamesList', payload);
}

function clearRevolutionTimer(game) {
  if (game && game.revolutionTimer) {
    clearTimeout(game.revolutionTimer);
    game.revolutionTimer = null;
  }
}

function clearTurnTimer(game) {
  if (game && game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }

  if (game) {
    game.turnEndsAt = null;
  }
}

function scheduleTurnTimeout(gameId) {
  const game = games[gameId];
  if (!game) return;

  clearTurnTimer(game);

  if (game.status !== 'playing') return;

  const currentPlayer = game.players[game.currentPlayerIndex];
  if (!currentPlayer || !currentPlayer.isActive) return;

  game.turnEndsAt = Date.now() + 30000;
  game.turnTimer = setTimeout(() => {
    const currentGame = games[gameId];
    if (!currentGame) return;

    currentGame.turnTimer = null;

    if (currentGame.status !== 'playing') {
      currentGame.turnEndsAt = null;
      return;
    }

    const timeoutPlayer = currentGame.players[currentGame.currentPlayerIndex];
    if (!timeoutPlayer || !timeoutPlayer.isActive) {
      scheduleTurnTimeout(gameId);
      return;
    }

    const result = currentGame.passCard(timeoutPlayer.id);
    if (!result.success) {
      io.to(timeoutPlayer.id).emit('error', result.message);
      emitGameStateAndHands(currentGame);
      return;
    }

    io.to(gameId).emit('cardPlayed', {
      playerId: timeoutPlayer.id,
      playerName: timeoutPlayer.name,
      action: 'timeout-pass'
    });
    emitGameStateAndHands(currentGame);
  }, 30000);
}

function emitGameStateAndHands(game) {
  if (!game) return;

  if (game.status === 'playing') {
    scheduleTurnTimeout(game.gameId);
  } else {
    clearTurnTimer(game);
  }

  io.to(game.gameId).emit('gameState', game.getGameState());
  game.players.forEach(player => {
    io.to(player.id).emit('playerHand', { hand: player.hand });
  });
}

function scheduleRevolutionCheckTransition(gameId) {
  const game = games[gameId];
  if (!game) return;

  clearRevolutionTimer(game);
  game.revolutionTimer = setTimeout(() => {
    const currentGame = games[gameId];
    if (!currentGame) return;

    currentGame.revolutionTimer = null;
    if (currentGame.status !== 'revolution-check') return;

    currentGame.finalizeRevolutionCheck(true);
    emitGameStateAndHands(currentGame);
  }, 30000);
}

class DalmutiGame {
  constructor(gameId, maxPlayers = 8, ownerId = null, maxRounds = 3, isPublic = false, displayCode = '') {
    this.gameId = gameId;
    this.maxPlayers = maxPlayers;
    this.ownerId = ownerId;
    this.isPublic = Boolean(isPublic);
    this.displayCode = displayCode || gameId;
    this.createdAt = Date.now();
    this.players = [];
    this.currentRound = 0;
    this.maxRounds = maxRounds;
    this.status = 'waiting'; // waiting, drawing, drawing-results, revolution-check, tax-phase, playing, round-finished, game-finished
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.lastPlayerId = null;
    this.passCount = 0;
    this.tableState = { value: null, count: 0 };
    this.roundFinishOrder = [];
    this.drawOrder = []; // 카드 드로우로 결정한 순서
    this.dalmutiId = null;
    this.peonId = null;
    this.taxCardsFromPeon = [];
    this.dalmutiReceivedTaxCards = [];
    this.revolutionEligiblePlayerId = null;
    this.revolutionCheckEndsAt = null;
    this.revolutionInfo = null;
    this.revolutionTimer = null;
    this.turnTimer = null;
    this.turnEndsAt = null;
    this.skipTaxThisRound = false;
    this.revolutionConfirmedPlayerIds = [];
    this.revolutionDeclaredBy = null;
    this.revolutionDeclaredType = null;
    this.lastRoundScores = [];
    this.lastGameScoreRanking = [];
    this.restartRequested = false;
    this.waitingRoomEnteredPlayerIds = [];
  }

  createDeck() {
    const deck = [];
    for (let value = 1; value <= 12; value++) {
      for (let i = 0; i < value; i++) {
        deck.push({ value });
      }
    }
    deck.push({ value: 'JOKER', jokerVariant: 'J' });
    deck.push({ value: 'JOKER', jokerVariant: 'J2' });
    return this.shuffleDeck(deck);
  }

  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  getHandSize(playerCount) {
    const sizes = { 2: 40, 3: 26, 4: 20, 5: 16, 6: 13, 7: 11, 8: 10 };
    return sizes[playerCount] || Math.floor(80 / playerCount);
  }

  addPlayer(playerId, playerName) {
    if (this.players.length < this.maxPlayers && this.status === 'waiting') {
      this.players.push({ id: playerId, name: playerName, hand: [], rank: null, isActive: true, totalScore: 0 });

      if (this.restartRequested && !this.waitingRoomEnteredPlayerIds.includes(playerId)) {
        this.waitingRoomEnteredPlayerIds.push(playerId);
      }

      return true;
    }
    return false;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    this.waitingRoomEnteredPlayerIds = this.waitingRoomEnteredPlayerIds.filter(id => id !== playerId);

    if (this.restartRequested) {
      const allEntered = this.players.every(player => this.waitingRoomEnteredPlayerIds.includes(player.id));
      if (allEntered) {
        this.restartRequested = false;
        this.waitingRoomEnteredPlayerIds = [];
        this.lastGameScoreRanking = [];
      }
    }
  }

  startDrawing() {
    if (this.players.length < 2) return false;
    this.status = 'drawing';
    this.drawOrder = [];
    this.players.forEach(p => {
      p.drawnCard = null;
    });
    return true;
  }

  drawCard(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.drawnCard !== null) return { success: false, message: '이미 카드를 뽑았습니다' };
    
    const drawDeck = this.createDeck();
    player.drawnCard = drawDeck[0];
    
    // 모든 플레이어가 카드를 뽑았는지 확인
    if (this.players.every(p => p.drawnCard !== null)) {
      this.finishDrawing();
    }
    
    return { success: true, card: player.drawnCard };
  }

  finishDrawing() {
    // 카드 값으로 정렬 (낮은 값이 Dalmuti, 높은 값이 Peon)
    const sorted = [...this.players].sort((a, b) => {
      const aVal = a.drawnCard.value === 'JOKER' ? 13 : a.drawnCard.value;
      const bVal = b.drawnCard.value === 'JOKER' ? 13 : b.drawnCard.value;
      return aVal - bVal;
    });

    this.drawOrder = sorted.map(p => ({ id: p.id, name: p.name, card: p.drawnCard }));

    // 플레이어 순서를 drawOrder에 따라 재배치
    this.players = sorted;

    // 결과를 보여주는 상태로 변경
    this.status = 'drawing-results';
  }

  startGameAfterDrawing() {
    console.log(`게임 ${this.gameId} 실제 게임 시작`);
    this.dealCards();
    this.discardPile = [];
    this.lastPlayerId = null;
    this.passCount = 0;
    this.tableState = { value: null, count: 0 };
    this.currentPlayerIndex = 0;
    this.roundFinishOrder = [];

    this.players.forEach(player => {
      player.rank = null;
      player.isActive = true;
      player.totalScore = 0;
    });

    this.lastRoundScores = [];
    this.lastGameScoreRanking = [];
    this.restartRequested = false;
    this.waitingRoomEnteredPlayerIds = [];

    this.startRevolutionCheckPhase();
    
    // 게임 상태와 플레이어 손패 전송
    const gameState = this.getGameState();
    console.log(`게임 ${this.gameId} 상태 전송:`, gameState.status);
    io.to(this.gameId).emit('gameState', gameState);
    
    this.players.forEach(player => {
      io.to(player.id).emit('playerHand', { hand: player.hand });
    });
  }

  startGame() {
    if (this.players.length < 2) return false;
    this.status = 'playing';
    this.dealCards();
    this.currentPlayerIndex = 0;
    this.roundFinishOrder = [];
    return true;
  }

  dealCards() {
    const deck = this.createDeck();
    const handSize = this.getHandSize(this.players.length);
    let deckIndex = 0;

    for (let i = 0; i < handSize; i++) {
      for (let player of this.players) {
        if (deckIndex < deck.length) {
          player.hand.push(deck[deckIndex++]);
        }
      }
    }

    this.players.forEach(player => {
      player.hand.sort((a, b) => {
        const aVal = a.value === 'JOKER' ? 0 : a.value;
        const bVal = b.value === 'JOKER' ? 0 : b.value;
        return aVal - bVal;
      });
    });
  }

  isStronger(newCard, oldCard) {
    if (newCard.value === 'JOKER') return oldCard.value !== 'JOKER';
    if (oldCard.value === 'JOKER') return false;
    return newCard.value < oldCard.value;
  }

  canPlayCards(cards) {
    if (cards.length === 0) return false;

    const jokerCount = cards.filter(c => c.value === 'JOKER').length;
    const regularCards = cards.filter(c => c.value !== 'JOKER');

    // 조커만으로 내는 것은 불가능
    if (jokerCount > 0 && regularCards.length === 0) {
      return false;
    }

    if (this.tableState.value === null) {
      // 첫 패: 같은 숫자 카드들 + 조커(옵션)
      if (regularCards.length > 0) {
        const firstValue = regularCards[0].value;
        return regularCards.every(c => c.value === firstValue);
      }
      return false; // 조커만으로는 낼 수 없음
    }

    // 테이블에 카드가 있는 경우
    if (cards.length !== this.tableState.count) return false;

    if (jokerCount === 0) {
      // 조커 없이: 같은 숫자이고 테이블 카드보다 강해야 함
      const firstValue = regularCards[0].value;
      if (!regularCards.every(c => c.value === firstValue)) return false;
      return this.isStronger(regularCards[0], { value: this.tableState.value });
    }

    if (regularCards.length > 0) {
      // 조커 포함: 정규 카드는 모두 같은 숫자여야 함
      const firstValue = regularCards[0].value;
      if (!regularCards.every(c => c.value === firstValue)) return false;
      // 정규 카드가 필요한 개수를 충족하면 조커로 채울 수 있음
      if (regularCards.length === this.tableState.count) {
        return this.isStronger(regularCards[0], { value: this.tableState.value });
      } else if (regularCards.length < this.tableState.count && jokerCount === this.tableState.count - regularCards.length) {
        // 정규 카드 + 조커로 정확히 필요한 개수를 맞춤
        return this.isStronger(regularCards[0], { value: this.tableState.value });
      }
    }

    return false;
  }

  playCards(playerId, cards) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.isActive) {
      return { success: false, message: '플레이어를 찾을 수 없습니다' };
    }

    // 정확한 개수까지 손에 있는지 확인
    const handCounts = {};
    for (const h of player.hand) {
      const key = String(h.value);
      handCounts[key] = (handCounts[key] || 0) + 1;
    }
    const playCounts = {};
    for (const c of cards) {
      const key = String(c.value);
      playCounts[key] = (playCounts[key] || 0) + 1;
    }
    for (const key of Object.keys(playCounts)) {
      if (!handCounts[key] || handCounts[key] < playCounts[key]) {
        return { success: false, message: '손에 없는 카드입니다' };
      }
    }

    if (!this.canPlayCards(cards)) {
      return { success: false, message: '불가능한 카드 조합입니다' };
    }

    for (let card of cards) {
      const idx = player.hand.findIndex(h => {
        if (h.value !== card.value) return false;

        if (card.value === 'JOKER' && card.jokerVariant) {
          return h.jokerVariant === card.jokerVariant;
        }

        return true;
      });
      if (idx !== -1) {
        player.hand.splice(idx, 1);
      }
    }

    this.discardPile = cards;
    const regularCards = cards.filter(c => c.value !== 'JOKER');
    const jokerCount = cards.length - regularCards.length;
    const playedSingleOne = (
      cards.length === 1 &&
      jokerCount === 0 &&
      regularCards.length === 1 &&
      regularCards[0].value === 1
    );
    if (regularCards.length > 0) {
      this.tableState.value = regularCards[0].value;
    }
    this.tableState.count = cards.length;
    this.lastPlayerId = playerId;
    this.passCount = 0;

    const playerJustFinished = player.hand.length === 0;

    if (playerJustFinished) {
      player.isActive = false;
      this.roundFinishOrder.push(player.id);
    }

    // 활성 플레이어 확인 (손패가 있는 플레이어 수)
    const activePlayers = this.players.filter(p => p.isActive);

    if (activePlayers.length === 0) {
      // 모든 플레이어가 탈락했으면 라운드 종료
      this.endRound();
    } else if (activePlayers.length === 1) {
      // 활성 플레이어가 1명만 남으면 그 플레이어가 꼴등
      const lastPlayer = activePlayers[0];
      lastPlayer.isActive = false;
      this.roundFinishOrder.push(lastPlayer.id);
      this.endRound();
    } else {
      // 1등으로 빠진 플레이어의 마지막 카드에 다음 플레이어가 묶이지 않도록 트릭 리셋
      if (playerJustFinished) {
        this.tableState = { value: null, count: 0 };
        this.discardPile = [];
        this.passCount = 0;
        this.lastPlayerId = null;
      }

      // 숫자 1 한 장은 누구도 이길 수 없으므로 즉시 같은 플레이어 턴으로 복귀
      if (!playerJustFinished && playedSingleOne) {
        this.tableState = { value: null, count: 0 };
        this.discardPile = [];
        this.passCount = 0;
        this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
      } else {
        // 일반 진행 - 다음 활성 플레이어 찾기
        this.nextTurn();
      }
    }

    return { success: true };
  }

  passCard(playerId) {
    if (this.status !== 'playing') {
      return { success: false, message: '현재 스킵할 수 없는 상태입니다' };
    }

    const currentPlayer = this.players[this.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { success: false, message: '현재 턴이 아닙니다' };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.isActive) {
      return { success: false, message: '스킵할 수 없는 플레이어입니다' };
    }

    const activePlayers = this.players.filter(p => p.isActive);
    if (activePlayers.length <= 1) {
      return { success: false, message: '스킵할 수 있는 대상이 없습니다' };
    }

    this.passCount++;

    if (this.passCount >= activePlayers.length - 1) {
      // 모두 패스하여 트릭이 리셋되면 마지막으로 낸 플레이어에게 선턴이 돌아간다.
      this.tableState = { value: null, count: 0 };
      this.discardPile = [];
      this.passCount = 0;

      if (this.lastPlayerId) {
        const lastPlayerIndex = this.players.findIndex(
          p => p.id === this.lastPlayerId && p.isActive
        );
        if (lastPlayerIndex !== -1) {
          this.currentPlayerIndex = lastPlayerIndex;
          return { success: true };
        }
      }
    }

    this.nextTurn();
    return { success: true };
  }

  nextTurn() {
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (!this.players[this.currentPlayerIndex].isActive);
  }

  applyRoundScores() {
    const playerCount = this.players.length;

    this.lastRoundScores = this.roundFinishOrder.map((playerId, index) => {
      const player = this.players.find(p => p.id === playerId);
      const points = playerCount - index;

      if (player) {
        if (typeof player.totalScore !== 'number') {
          player.totalScore = 0;
        }
        player.totalScore += points;
      }

      return {
        playerId,
        rank: index + 1,
        points,
        totalScore: player ? player.totalScore : points
      };
    });
  }

  getScoreRanking() {
    const latestRoundRankByPlayerId = new Map(
      this.roundFinishOrder.map((playerId, index) => [playerId, index + 1])
    );

    return [...this.players]
      .sort((a, b) => {
        const scoreDiff = (b.totalScore || 0) - (a.totalScore || 0);
        if (scoreDiff !== 0) return scoreDiff;

        const aRoundRank = latestRoundRankByPlayerId.get(a.id) || Number.MAX_SAFE_INTEGER;
        const bRoundRank = latestRoundRankByPlayerId.get(b.id) || Number.MAX_SAFE_INTEGER;
        if (aRoundRank !== bRoundRank) return aRoundRank - bRoundRank;

        return a.name.localeCompare(b.name, 'ko-KR');
      })
      .map((player, index) => ({
        playerId: player.id,
        name: player.name,
        totalScore: player.totalScore || 0,
        rank: index + 1
      }));
  }

  endRound() {
    // 라운드 종료 - 플레이어 순위 설정
    this.roundFinishOrder.forEach((playerId, index) => {
      const player = this.players.find(p => p.id === playerId);
      if (player) {
        player.rank = index + 1;
      }
    });

    // 라운드 점수 반영 (n명일 때 1등 n점, 2등 n-1점 ... n등 1점)
    this.applyRoundScores();

    // 현재 라운드 증가
    this.currentRound++;

    // 모든 라운드가 끝났는지 확인
    if (this.currentRound >= this.maxRounds) {
      this.status = 'game-finished';
      this.lastGameScoreRanking = this.getScoreRanking();
    } else {
      // 다음 라운드 준비
      this.status = 'round-finished';
    }
  }

  prepareNextRound() {
    // 라운드 종료 순서에 따라 플레이어 재배치
    const sortedByRank = this.players.sort((a, b) => {
      const aRank = a.rank || 999;
      const bRank = b.rank || 999;
      return aRank - bRank;
    });

    this.players = sortedByRank;

    // 다음 라운드 초기화 (이전 라운드 순위 기반으로 카드 분배)
    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.lastPlayerId = null;
    this.passCount = 0;
    this.tableState = { value: null, count: 0 };
    this.roundFinishOrder = [];
    this.lastRoundScores = [];

    // 플레이어 초기화
    this.players.forEach(p => {
      p.hand = [];
      p.rank = null;
      p.isActive = true;
      p.drawnCard = null;
    });

    // 이전 라운드의 순위를 기반으로 카드 분배
    this.dealCards();

    // 혁명 체크 페이즈 시작 (혁명 미발생 시 세금 징수로 이동)
    this.startRevolutionCheckPhase();
  }

  startRevolutionCheckPhase() {
    this.status = 'revolution-check';
    this.revolutionInfo = null;
    this.revolutionCheckEndsAt = Date.now() + 30000;
    this.skipTaxThisRound = false;
    this.revolutionConfirmedPlayerIds = [];
    this.revolutionDeclaredBy = null;
    this.revolutionDeclaredType = null;

    this.discardPile = [];
    this.lastPlayerId = null;
    this.passCount = 0;
    this.tableState = { value: null, count: 0 };
    this.currentPlayerIndex = 0;

    this.taxCardsFromPeon = [];
    this.dalmutiReceivedTaxCards = [];

    this.dalmutiId = this.players[0]?.id || null;
    this.peonId = this.players[this.players.length - 1]?.id || null;

    const eligiblePlayer = this.players.find(
      player => player.hand.filter(card => card.value === 'JOKER').length === 2
    );
    this.revolutionEligiblePlayerId = eligiblePlayer ? eligiblePlayer.id : null;
  }

  buildRevolutionInfo(initiator, isGreatRevolution) {
    return {
      happened: true,
      initiatorId: initiator.id,
      initiatorName: initiator.name,
      type: isGreatRevolution ? 'great-reverse' : 'tax-free',
      message: isGreatRevolution
        ? `${initiator.name}님이 조커 2장을 공개해 대혁명을 선언했습니다! 계급이 역전되며 이번 라운드는 세금이 없습니다.`
        : `${initiator.name}님이 조커 2장을 공개해 혁명을 선언했습니다! 계급은 유지되며 이번 라운드는 세금이 없습니다.`
    };
  }

  finalizeRevolutionCheck(force = false) {
    if (this.status !== 'revolution-check') {
      return { completed: false };
    }

    const confirmedSet = new Set(this.revolutionConfirmedPlayerIds);
    const everyoneConfirmed = this.players.every(player => {
      if (this.revolutionDeclaredBy && player.id === this.revolutionDeclaredBy) {
        return true;
      }

      return confirmedSet.has(player.id);
    });

    if (!force && !everyoneConfirmed) {
      return { completed: false };
    }

    if (this.revolutionDeclaredBy) {
      const initiator = this.players.find(player => player.id === this.revolutionDeclaredBy);
      const isGreatRevolution = this.revolutionDeclaredType === 'great';

      if (initiator) {
        if (isGreatRevolution) {
          this.players.reverse();
        }

        this.dalmutiId = this.players[0]?.id || null;
        this.peonId = this.players[this.players.length - 1]?.id || null;

        this.skipTaxThisRound = true;
        this.status = 'playing';
        this.currentPlayerIndex = 0;
        this.discardPile = [];
        this.tableState = { value: null, count: 0 };
        this.lastPlayerId = null;
        this.passCount = 0;
        this.revolutionInfo = this.buildRevolutionInfo(initiator, isGreatRevolution);
      } else {
        this.startTaxPhase();
      }
    } else {
      this.startTaxPhase();
    }

    this.revolutionCheckEndsAt = null;
    this.revolutionEligiblePlayerId = null;
    this.revolutionConfirmedPlayerIds = [];
    this.revolutionDeclaredBy = null;
    this.revolutionDeclaredType = null;

    return { completed: true, nextStatus: this.status, revolutionInfo: this.revolutionInfo };
  }

  skipRevolution(playerId) {
    if (this.status !== 'revolution-check') {
      return { success: false, message: '넘기기를 진행할 수 없는 시점입니다' };
    }

    const player = this.players.find(currentPlayer => currentPlayer.id === playerId);
    if (!player) {
      return { success: false, message: '플레이어를 찾을 수 없습니다' };
    }

    if (this.revolutionDeclaredBy && this.revolutionDeclaredBy === playerId) {
      return { success: false, message: '혁명 선언 플레이어는 확인완료 대상이 아닙니다' };
    }

    if (!this.revolutionConfirmedPlayerIds.includes(playerId)) {
      this.revolutionConfirmedPlayerIds.push(playerId);
    }

    const finalizeResult = this.finalizeRevolutionCheck(false);

    return { success: true, completed: finalizeResult.completed };
  }

  triggerRevolution(playerId, revolutionType = 'normal') {
    if (this.status !== 'revolution-check') {
      return { success: false, message: '혁명을 진행할 수 없는 시점입니다' };
    }

    if (!this.revolutionEligiblePlayerId || this.revolutionEligiblePlayerId !== playerId) {
      return { success: false, message: '혁명을 일으킬 조건이 아닙니다' };
    }

    if (this.revolutionConfirmedPlayerIds.includes(playerId)) {
      return { success: false, message: '이미 확인완료를 선택했습니다' };
    }

    const initiator = this.players.find(player => player.id === playerId);
    if (!initiator) {
      return { success: false, message: '플레이어를 찾을 수 없습니다' };
    }

    const isPeon = playerId === this.peonId;
    const isGreatRevolution = revolutionType === 'great';

    if (isPeon && !isGreatRevolution) {
      return { success: false, message: '대혁명이 가능한 상태에서는 대혁명만 선택할 수 있습니다' };
    }

    if (isGreatRevolution && !isPeon) {
      return { success: false, message: '대혁명은 꼴등 플레이어만 선택할 수 있습니다' };
    }

    if (this.revolutionDeclaredBy) {
      return { success: false, message: '이미 혁명이 선언되었습니다' };
    }

    this.revolutionDeclaredBy = playerId;
    this.revolutionDeclaredType = isGreatRevolution ? 'great' : 'normal';

    const revolutionInfo = this.buildRevolutionInfo(initiator, isGreatRevolution);
    const finalizeResult = this.finalizeRevolutionCheck(false);

    return { success: true, revolutionInfo, completed: finalizeResult.completed };
  }

  startTaxPhase() {
    // 세금 징수 페이즈 시작
    this.status = 'tax-phase';
    this.revolutionCheckEndsAt = null;
    this.revolutionEligiblePlayerId = null;
    this.revolutionConfirmedPlayerIds = [];
    this.revolutionDeclaredBy = null;
    this.revolutionDeclaredType = null;
    this.dalmutiReceivedTaxCards = [];
    this.taxCardsFromPeon = [];

    if (this.players.length < 2) {
      this.status = 'playing';
      return;
    }
    
    // Dalmuti: 첫 번째 플레이어 (가장 낮은 순위)
    this.dalmutiId = this.players[0].id;
    
    // Peon: 마지막 플레이어 (가장 높은 순위)
    this.peonId = this.players[this.players.length - 1].id;
    
    // Peon의 손패에서 강한 카드(낮은 숫자) 우선으로 세금 2장을 고름
    // Joker는 세금 카드에서 제외한다.
    const peonPlayer = this.players.find(p => p.id === this.peonId);
    if (peonPlayer) {
      const nonJokerCards = peonPlayer.hand.filter(card => card.value !== 'JOKER');
      const sortedByStrength = [...nonJokerCards].sort((a, b) => a.value - b.value);

      if (sortedByStrength.length < 2) {
        // 예외 상황: 세금 대상 카드가 부족하면 세금 페이즈를 건너뛴다.
        this.status = 'playing';
        return;
      }
      
      // 강한 카드 2장을 세금 카드로 선택
      this.taxCardsFromPeon = sortedByStrength.slice(0, 2);
    }
  }

  giveTaxCardsFromPeon() {
    // Peon이 Dalmuti에게 세금 카드 2장을 넘김
    const peonPlayer = this.players.find(p => p.id === this.peonId);
    const dalmutiPlayer = this.players.find(p => p.id === this.dalmutiId);

    if (!peonPlayer || !dalmutiPlayer) {
      return { success: false, message: '플레이어를 찾을 수 없습니다' };
    }

    if (this.taxCardsFromPeon.length !== 2) {
      return { success: false, message: '넘길 세금 카드가 준비되지 않았습니다' };
    }

    if (this.dalmutiReceivedTaxCards.length > 0) {
      return { success: false, message: '이미 세금 카드가 전달되었습니다' };
    }
    
    const movedCards = [];
    for (const taxCard of this.taxCardsFromPeon) {
      const idx = peonPlayer.hand.findIndex(h => h.value === taxCard.value);
      if (idx === -1) {
        return { success: false, message: '세금 카드 이동 중 오류가 발생했습니다' };
      }
      movedCards.push(peonPlayer.hand.splice(idx, 1)[0]);
    }

    dalmutiPlayer.hand.push(...movedCards);

    peonPlayer.hand.sort((a, b) => {
      const aVal = a.value === 'JOKER' ? 0 : a.value;
      const bVal = b.value === 'JOKER' ? 0 : b.value;
      return aVal - bVal;
    });

    dalmutiPlayer.hand.sort((a, b) => {
      const aVal = a.value === 'JOKER' ? 0 : a.value;
      const bVal = b.value === 'JOKER' ? 0 : b.value;
      return aVal - bVal;
    });

    this.dalmutiReceivedTaxCards = movedCards;
    this.taxCardsFromPeon = [];

    return { success: true };
  }

  dalmutiChooseTaxCards(cardIndices) {
    // Dalmuti가 Peon에게 넘길 2장 선택
    if (!Array.isArray(cardIndices) || cardIndices.length !== 2) {
      return { success: false, message: '정확히 2장을 선택해야 합니다' };
    }

    const uniqueIndices = [...new Set(cardIndices)];
    if (uniqueIndices.length !== 2) {
      return { success: false, message: '서로 다른 카드 2장을 선택해야 합니다' };
    }
    
    const dalmutiPlayer = this.players.find(p => p.id === this.dalmutiId);
    const peonPlayer = this.players.find(p => p.id === this.peonId);
    
    if (!dalmutiPlayer || !peonPlayer) {
      return { success: false, message: '플레이어를 찾을 수 없습니다' };
    }

    const hasInvalidIndex = uniqueIndices.some(
      idx => !Number.isInteger(idx) || idx < 0 || idx >= dalmutiPlayer.hand.length
    );
    if (hasInvalidIndex) {
      return { success: false, message: '잘못된 카드 선택입니다' };
    }
    
    // 인덱스 변화를 피하려고 큰 인덱스부터 제거
    const sortedIndices = [...uniqueIndices].sort((a, b) => b - a);
    const cardsToGive = sortedIndices.map(idx => dalmutiPlayer.hand[idx]);
    for (const idx of sortedIndices) {
      dalmutiPlayer.hand.splice(idx, 1);
    }
    
    // Peon 손패에 Dalmuti 카드 추가
    peonPlayer.hand = peonPlayer.hand.concat(cardsToGive);
    
    // 손패 정렬
    dalmutiPlayer.hand.sort((a, b) => {
      const aVal = a.value === 'JOKER' ? 0 : a.value;
      const bVal = b.value === 'JOKER' ? 0 : b.value;
      return aVal - bVal;
    });
    
    peonPlayer.hand.sort((a, b) => {
      const aVal = a.value === 'JOKER' ? 0 : a.value;
      const bVal = b.value === 'JOKER' ? 0 : b.value;
      return aVal - bVal;
    });
    
    // 세금 징수 완료 - 게임 시작
    this.status = 'playing';
    this.currentPlayerIndex = 0;
    this.taxCardsFromPeon = [];
    this.dalmutiReceivedTaxCards = [];
    
    return { success: true };
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  resetToWaitingRoom() {
    this.status = 'waiting';
    this.currentRound = 0;

    this.discardPile = [];
    this.currentPlayerIndex = 0;
    this.lastPlayerId = null;
    this.passCount = 0;
    this.tableState = { value: null, count: 0 };

    this.roundFinishOrder = [];
    this.drawOrder = [];
    this.lastRoundScores = [];

    this.dalmutiId = null;
    this.peonId = null;
    this.taxCardsFromPeon = [];
    this.dalmutiReceivedTaxCards = [];

    this.revolutionEligiblePlayerId = null;
    this.revolutionCheckEndsAt = null;
    this.revolutionInfo = null;
    this.revolutionConfirmedPlayerIds = [];
    this.revolutionDeclaredBy = null;
    this.revolutionDeclaredType = null;
    this.skipTaxThisRound = false;

    this.restartRequested = true;
    this.waitingRoomEnteredPlayerIds = this.ownerId ? [this.ownerId] : [];

    this.players.forEach(player => {
      player.hand = [];
      player.rank = null;
      player.isActive = true;
      player.drawnCard = null;
      player.totalScore = 0;
    });
  }

  joinRestartWaitingRoom(playerId) {
    if (this.status !== 'waiting' || !this.restartRequested) {
      return { success: false, message: '현재 입장 가능한 대기방이 없습니다' };
    }

    const playerExists = this.players.some(player => player.id === playerId);
    if (!playerExists) {
      return { success: false, message: '플레이어를 찾을 수 없습니다' };
    }

    if (!this.waitingRoomEnteredPlayerIds.includes(playerId)) {
      this.waitingRoomEnteredPlayerIds.push(playerId);
    }

    const allEntered = this.players.every(player => this.waitingRoomEnteredPlayerIds.includes(player.id));
    if (allEntered) {
      this.restartRequested = false;
      this.waitingRoomEnteredPlayerIds = [];
      this.lastGameScoreRanking = [];
    }

    return { success: true };
  }

  getGameState() {
    const drawnPlayers = this.players.filter(p => p.drawnCard !== null);

    return {
      gameId: this.gameId,
      gameCode: this.displayCode,
      ownerId: this.ownerId,
      isPublic: this.isPublic,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        handSize: p.hand.length,
        isActive: p.isActive,
        rank: p.rank,
        totalScore: p.totalScore || 0
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      currentPlayerId: this.players[this.currentPlayerIndex]?.id,
      lastPlayerId: this.lastPlayerId,
      status: this.status,
      discardPile: this.discardPile,
      tableState: this.tableState,
      round: this.currentRound,
      currentRound: this.currentRound,
      maxRounds: this.maxRounds,
      maxPlayers: this.maxPlayers,
      roundFinishOrder: this.roundFinishOrder,
      drawOrder: this.drawOrder,
      lastRoundScores: this.lastRoundScores,
      scoreRanking: this.getScoreRanking(),
      lastGameScoreRanking: this.lastGameScoreRanking,
      restartRequested: this.restartRequested,
      waitingRoomEnteredPlayerIds: this.waitingRoomEnteredPlayerIds,
      drawnCount: drawnPlayers.length,
      drawnPlayerIds: drawnPlayers.map(p => p.id),
      dalmutiId: this.dalmutiId,
      peonId: this.peonId,
      revolutionCheckEndsAt: this.revolutionCheckEndsAt,
      revolutionDeclaredBy: this.revolutionDeclaredBy,
      revolutionDeclaredType: this.revolutionDeclaredType,
      revolutionConfirmedPlayerIds: this.revolutionConfirmedPlayerIds,
      revolutionInfo: this.revolutionInfo,
      turnEndsAt: this.turnEndsAt,
      taxCardsFromPeon: this.taxCardsFromPeon,
      dalmutiReceivedTaxCards: this.dalmutiReceivedTaxCards
    };
  }
}

io.on('connection', (socket) => {
  console.log('사용자 연결:', socket.id);

  emitPublicGamesList(socket.id);

  socket.on('requestPublicGames', () => {
    emitPublicGamesList(socket.id);
  });

  socket.on('createGame', (payloadOrName, maybeRounds, maybeCallback) => {
    const callback = typeof maybeCallback === 'function'
      ? maybeCallback
      : (typeof maybeRounds === 'function' ? maybeRounds : () => {});

    const payload = (payloadOrName && typeof payloadOrName === 'object')
      ? payloadOrName
      : { playerName: payloadOrName, rounds: maybeRounds };

    const playerName = String(payload.playerName || '').trim();
    const displayCode = normalizeDisplayGameCode(payload.gameCode || '');
    const parsedRounds = Number(payload.rounds) || 3;
    const rounds = Math.min(20, Math.max(1, parsedRounds));
    const visibility = payload.visibility === 'public' ? 'public' : 'private';
    const isPublic = visibility === 'public';

    if (!playerName) {
      callback({ success: false, message: '플레이어 이름을 입력해주세요' });
      return;
    }

    if (!displayCode) {
      callback({ success: false, message: '게임 코드를 입력해주세요' });
      return;
    }

    if (!DISPLAY_GAME_CODE_PATTERN.test(displayCode)) {
      callback({
        success: false,
        message: '게임 코드는 2~30자의 한글, 영문 대소문자, 숫자, 공백, -, _ 만 사용할 수 있습니다'
      });
      return;
    }

    const displayCodeKey = getDisplayCodeLookupKey(displayCode);
    if (displayCodeKey && gameCodeToInternalId[displayCodeKey]) {
      callback({ success: false, message: '이미 사용 중인 게임 코드입니다' });
      return;
    }

    const gameId = generateInternalGameId();

    const game = new DalmutiGame(gameId, 8, socket.id, rounds, isPublic, displayCode);
    game.addPlayer(socket.id, playerName);
    games[gameId] = game;
    registerGameCodeMapping(displayCode, gameId);
    players[socket.id] = { gameId, playerName };

    socket.join(gameId);
    callback({ gameId, displayCode, success: true });
    emitGameStateAndHands(game);
    emitPublicGamesList();
  });

  socket.on('joinGame', (rawGameId, playerName, callback) => {
    const inputCode = normalizeDisplayGameCode(rawGameId);
    const normalizedName = String(playerName || '').trim();
    const game = resolveGameByInputCode(inputCode);
    if (!game) {
      callback({ success: false, message: '게임을 찾을 수 없습니다' });
      return;
    }

    if (!normalizedName) {
      callback({ success: false, message: '플레이어 이름을 입력해주세요' });
      return;
    }

    if (game.status !== 'waiting') {
      callback({ success: false, message: '현재 참가할 수 없는 게임 상태입니다' });
      return;
    }

    if (!game.addPlayer(socket.id, normalizedName)) {
      callback({ success: false, message: '게임이 가득 찼습니다' });
      return;
    }

    players[socket.id] = { gameId: game.gameId, playerName: normalizedName };
    socket.join(game.gameId);
    callback({ success: true, gameId: game.gameId, displayCode: game.displayCode });
    emitGameStateAndHands(game);
    emitPublicGamesList();
  });

  socket.on('startGame', (gameId) => {
    const game = games[gameId];
    
    if (!game || game.ownerId !== socket.id) {
      socket.emit('error', '방장만 게임을 시작할 수 있습니다');
      return;
    }

    if (game.restartRequested) {
      socket.emit('error', '다시하기 입장 대기 중입니다. 모든 플레이어가 대기방에 입장한 뒤 시작할 수 있습니다');
      return;
    }

    // 카드 드로우 페이즈 시작
    if (game.startDrawing()) {
      emitGameStateAndHands(game);
      emitPublicGamesList();
    }
  });

  socket.on('startGameAfterDrawing', (gameId) => {
    const game = games[gameId];
    if (!game || game.status !== 'drawing-results') return;

    game.startGameAfterDrawing();

    // 30초 혁명 체크 후 (혁명 없으면) 세금 징수 페이즈로 이동
    scheduleRevolutionCheckTransition(gameId);

    game.players.forEach(player => {
      io.to(player.id).emit('playerHand', { hand: player.hand });
    });

    emitPublicGamesList();
  });

  socket.on('prepareNextRound', (gameId) => {
    const game = games[gameId];
    if (!game) return;

    if (game.status === 'round-finished' && game.currentRound < game.maxRounds) {
      game.prepareNextRound();
      emitGameStateAndHands(game);

      // 30초 혁명 체크 후 (혁명 없으면) 세금 징수 페이즈로 이동
      scheduleRevolutionCheckTransition(gameId);
      emitPublicGamesList();
    }
  });

  socket.on('restartGame', (gameId) => {
    const game = games[gameId];
    if (!game) return;

    if (game.ownerId !== socket.id) {
      socket.emit('error', '방장만 다시하기를 시작할 수 있습니다');
      return;
    }

    if (game.status !== 'game-finished') {
      socket.emit('error', '게임 종료 후에만 다시하기가 가능합니다');
      return;
    }

    clearRevolutionTimer(game);
    clearTurnTimer(game);
    game.resetToWaitingRoom();
    emitGameStateAndHands(game);
    emitPublicGamesList();
  });

  socket.on('joinRestartWaitingRoom', (gameId) => {
    const game = games[gameId];
    if (!game) return;

    const result = game.joinRestartWaitingRoom(socket.id);
    if (!result.success) {
      socket.emit('error', result.message);
      return;
    }

    emitGameStateAndHands(game);
    emitPublicGamesList();
  });

  socket.on('startRevolution', (gameId) => {
    const game = games[gameId];
    if (!game || game.status !== 'revolution-check') return;

    const result = game.triggerRevolution(socket.id, 'normal');
    if (result.success) {
      if (game.status !== 'revolution-check') {
        clearRevolutionTimer(game);
      }

      emitGameStateAndHands(game);
      io.to(gameId).emit('revolutionAnnounced', result.revolutionInfo);
      emitPublicGamesList();
    } else {
      socket.emit('error', result.message);
    }
  });

  socket.on('startGreatRevolution', (gameId) => {
    const game = games[gameId];
    if (!game || game.status !== 'revolution-check') return;

    const result = game.triggerRevolution(socket.id, 'great');
    if (result.success) {
      if (game.status !== 'revolution-check') {
        clearRevolutionTimer(game);
      }

      emitGameStateAndHands(game);
      io.to(gameId).emit('revolutionAnnounced', result.revolutionInfo);
      emitPublicGamesList();
    } else {
      socket.emit('error', result.message);
    }
  });

  socket.on('skipRevolution', (gameId) => {
    const game = games[gameId];
    if (!game || game.status !== 'revolution-check') return;

    const result = game.skipRevolution(socket.id);
    if (!result.success) {
      socket.emit('error', result.message);
      return;
    }

    if (game.status !== 'revolution-check') {
      clearRevolutionTimer(game);
    }

    emitGameStateAndHands(game);
    emitPublicGamesList();
  });

  socket.on('drawCard', (gameId, callback) => {
    console.log(`drawCard 이벤트 수신: gameId=${gameId}, socketId=${socket.id}`);
    const game = games[gameId];
    if (!game) {
      console.log('게임을 찾을 수 없음');
      callback({ success: false, message: '게임을 찾을 수 없습니다' });
      return;
    }

    const result = game.drawCard(socket.id);
    console.log('drawCard 결과:', result);
    callback(result);
    
    emitGameStateAndHands(game);
    emitPublicGamesList();
  });

  socket.on('playCards', (gameId, cards) => {
    const game = games[gameId];
    if (!game) return;

    if (!Array.isArray(cards)) {
      socket.emit('error', '잘못된 카드 요청 형식입니다');
      return;
    }

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    console.log(`playCards from ${socket.id} in game ${gameId}:`, cards);
    let result;
    if (cards.length === 0) {
      result = game.passCard(socket.id);
      if (!result.success) {
        socket.emit('error', result.message);
        return;
      }

      emitGameStateAndHands(game);
      emitPublicGamesList();
      io.to(gameId).emit('cardPlayed', {
        playerId: socket.id,
        playerName: player.name,
        action: 'pass'
      });
    } else {
      result = game.playCards(socket.id, cards);
      if (result.success) {
        emitGameStateAndHands(game);
        emitPublicGamesList();
        
        io.to(gameId).emit('cardPlayed', {
          playerId: socket.id,
          playerName: player.name,
          cardCount: cards.length,
          cards: cards
        });

        if (game.status === 'finished') {
          io.to(gameId).emit('gameFinished', {
            ranking: game.roundFinishOrder.map((pId, idx) => {
              const p = game.players.find(pl => pl.id === pId);
              return { name: p.name, rank: idx + 1 };
            })
          });
        }
      } else {
        socket.emit('error', result.message);
      }
    }
  });

  socket.on('giveTaxCardsFromPeon', (gameId) => {
    const game = games[gameId];
    if (game && game.peonId === socket.id && game.status === 'tax-phase') {
      const result = game.giveTaxCardsFromPeon();
      if (result.success) {
        emitGameStateAndHands(game);
        emitPublicGamesList();
      } else {
        socket.emit('error', result.message);
      }
    }
  });

  socket.on('dalmutiChooseTaxCards', (gameId, cardIndices) => {
    const game = games[gameId];
    if (game && game.dalmutiId === socket.id && game.status === 'tax-phase') {
      const result = game.dalmutiChooseTaxCards(cardIndices);
      if (result.success) {
        emitGameStateAndHands(game);
        emitPublicGamesList();
      } else {
        socket.emit('error', result.message);
      }
    }
  });

  socket.on('leaveGame', (gameId) => {
    const game = games[gameId];
    if (game) {
      game.removePlayer(socket.id);
      if (game.players.length === 0) {
        clearRevolutionTimer(game);
        clearTurnTimer(game);
        unregisterGameCodeMapping(game);
        delete games[gameId];
      } else {
        emitGameStateAndHands(game);
      }

      emitPublicGamesList();
    }
    delete players[socket.id];
    console.log('사용자 게임 나감:', socket.id);
  });

  socket.on('disconnect', () => {
    const playerInfo = players[socket.id];
    if (!playerInfo) return;

    const game = games[playerInfo.gameId];
    if (game) {
      game.removePlayer(socket.id);
      if (game.players.length === 0) {
        clearRevolutionTimer(game);
        clearTurnTimer(game);
        unregisterGameCodeMapping(game);
        delete games[playerInfo.gameId];
      } else {
        emitGameStateAndHands(game);
      }

      emitPublicGamesList();
    }

    delete players[socket.id];
    console.log('사용자 연결 종료:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다`);
});
