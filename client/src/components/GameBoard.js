import React, { useState, useEffect } from 'react';
import './GameBoard.css';
import { getCardImageSrc, getCardLabel } from '../utils/cardImage';

const TURN_LIMIT_SECONDS = 30;

function GameBoard({ gameState, playerInfo, playerHand, onPlayCards, onLeaveGame }) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [turnJustStarted, setTurnJustStarted] = useState(false);
  const [turnTimeLeft, setTurnTimeLeft] = useState(TURN_LIMIT_SECONDS);
  const [turnTimeProgress, setTurnTimeProgress] = useState(1);
  const gameStatus = gameState?.status;
  const turnEndsAt = gameState?.turnEndsAt;

  const isCurrentPlayer = gameState && gameState.currentPlayerId === playerInfo.id;

  // 내 차례가 되면 인디케이터 표시
  useEffect(() => {
    if (isCurrentPlayer) {
      setTurnJustStarted(true);
      const timer = setTimeout(() => setTurnJustStarted(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isCurrentPlayer]);

  // 턴이 넘어가면 이전 선택은 초기화
  useEffect(() => {
    if (!isCurrentPlayer) {
      setSelectedCards([]);
    }
  }, [isCurrentPlayer, gameState?.currentPlayerId]);

  useEffect(() => {
    if (gameStatus !== 'playing' || !turnEndsAt) {
      setTurnTimeLeft(TURN_LIMIT_SECONDS);
      setTurnTimeProgress(1);
      return;
    }

    const tick = () => {
      const msLeft = turnEndsAt - Date.now();
      const clampedMs = Math.max(0, msLeft);
      setTurnTimeLeft(Math.ceil(clampedMs / 1000));
      setTurnTimeProgress(Math.max(0, Math.min(1, clampedMs / (TURN_LIMIT_SECONDS * 1000))));
    };

    tick();
    const timer = setInterval(tick, 120);
    return () => clearInterval(timer);
  }, [gameStatus, turnEndsAt]);

  if (!gameState) {
    return <div className="game-board">게임 로딩 중...</div>;
  }

  const isGameFinished = gameState.status === 'finished';

  const toCardPayload = (cardsWithIndex) => {
    return cardsWithIndex.map(cardWithIndex => {
      const { _index, ...card } = cardWithIndex;
      return card;
    });
  };

  const canPlayCardsLocally = (cards) => {
    if (cards.length === 0) return false;

    const jokerCount = cards.filter(c => c.value === 'JOKER').length;
    const regularCards = cards.filter(c => c.value !== 'JOKER');

    // 조커 단독 플레이 불가
    if (jokerCount > 0 && regularCards.length === 0) {
      return false;
    }

    // 새 트릭(선턴)
    if (gameState.tableState.value === null) {
      if (regularCards.length === 0) return false;
      const firstValue = regularCards[0].value;
      return regularCards.every(c => c.value === firstValue);
    }

    // 이어치기
    const requiredCount = gameState.tableState.count;
    const requiredValue = gameState.tableState.value;

    if (cards.length !== requiredCount) return false;
    if (regularCards.length === 0) return false;

    const firstValue = regularCards[0].value;
    if (!regularCards.every(c => c.value === firstValue)) return false;
    if (firstValue >= requiredValue) return false;

    // 조커 포함 시에도 정규 카드 기준이 유효하면 허용
    return true;
  };

  const canExtendToValidPlay = (cardsWithIndex) => {
    if (!isCurrentPlayer || isGameFinished) return false;

    const cards = toCardPayload(cardsWithIndex);
    if (cards.length === 0) return false;

    const regularCards = cards.filter(c => c.value !== 'JOKER');

    // 조커 단독 선택 불가
    if (regularCards.length === 0) return false;

    // 선턴: 정규 카드는 같은 숫자여야 함 (조커는 보조 가능)
    if (gameState.tableState.value === null) {
      const firstValue = regularCards[0].value;
      return regularCards.every(c => c.value === firstValue);
    }

    // 이어치기: 부분 선택도 '완성 가능' 여부로 하이라이트
    const requiredCount = gameState.tableState.count;
    const requiredValue = gameState.tableState.value;

    if (cards.length > requiredCount) return false;

    const firstValue = regularCards[0].value;
    if (!regularCards.every(c => c.value === firstValue)) return false;
    if (firstValue >= requiredValue) return false;

    if (cards.length === requiredCount) {
      return canPlayCardsLocally(cards);
    }

    const selectedIndexSet = new Set(cardsWithIndex.map(c => c._index));
    const remainCompatibleCount = playerHand.filter((handCard, idx) => {
      if (selectedIndexSet.has(idx)) return false;
      return handCard.value === firstValue || handCard.value === 'JOKER';
    }).length;

    return cards.length + remainCompatibleCount >= requiredCount;
  };

  const isCardSelected = (cardIndex) => {
    return selectedCards.some(c => c._index === cardIndex);
  };

  // 낼 수 있는 카드인지 판단
  const canPlayCard = (card, cardIndex) => {
    if (!isCurrentPlayer || isGameFinished) return false;

    // 선택된 카드는 항상 다시 클릭해서 해제 가능
    if (isCardSelected(cardIndex)) return true;

    const nextSelection = [...selectedCards, { ...card, _index: cardIndex }];
    return canExtendToValidPlay(nextSelection);
  };

  const handleCardClick = (card, index) => {
    const isSelected = isCardSelected(index);

    if (!isCurrentPlayer || isGameFinished) return;

    if (isSelected) {
      setSelectedCards(selectedCards.filter(
        (c) => c._index !== index
      ));
      return;
    }

    // 새 트릭 시작 시에는 같은 숫자 카드를 가능한 만큼 한 번에 선택한다.
    if (
      selectedCards.length === 0 &&
      gameState.tableState.value === null &&
      card.value !== 'JOKER'
    ) {
      const sameValueCards = playerHand
        .map((handCard, idx) => ({ ...handCard, _index: idx }))
        .filter(handCard => handCard.value === card.value);

      if (sameValueCards.length > 0 && canPlayCardsLocally(toCardPayload(sameValueCards))) {
        setSelectedCards(sameValueCards);
        return;
      }
    }

    // 이어치기 시작 시, 같은 숫자 + 조커를 자동으로 채워 필요한 장수를 한 번에 선택
    if (
      selectedCards.length === 0 &&
      gameState.tableState.value !== null &&
      card.value !== 'JOKER'
    ) {
      const requiredCount = gameState.tableState.count;
      const sameValueCards = playerHand
        .map((handCard, idx) => ({ ...handCard, _index: idx }))
        .filter(handCard => handCard.value === card.value);

      const jokerCards = playerHand
        .map((handCard, idx) => ({ ...handCard, _index: idx }))
        .filter(handCard => handCard.value === 'JOKER');

      const autoSelected = [];
      for (let i = 0; i < sameValueCards.length && autoSelected.length < requiredCount; i++) {
        autoSelected.push(sameValueCards[i]);
      }
      for (let i = 0; i < jokerCards.length && autoSelected.length < requiredCount; i++) {
        autoSelected.push(jokerCards[i]);
      }

      if (
        autoSelected.length === requiredCount &&
        canPlayCardsLocally(toCardPayload(autoSelected))
      ) {
        setSelectedCards(autoSelected);
        return;
      }
    }

    if (!canPlayCard(card, index)) {
      return;
    }

    setSelectedCards([...selectedCards, { ...card, _index: index }]);
  };

  const selectedCardPayload = toCardPayload(selectedCards);
  const isSelectionPlayable = canPlayCardsLocally(selectedCardPayload);

  const handlePlayCards = () => {
    if (isSelectionPlayable && isCurrentPlayer) {
      onPlayCards(selectedCardPayload);
      setSelectedCards([]);
    }
  };

  const handlePass = () => {
    if (isCurrentPlayer) {
      onPlayCards([]);
      setSelectedCards([]);
    }
  };

  const getCurrentPlayerName = () => {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    return currentPlayer ? currentPlayer.name : '알 수 없음';
  };

  const getLastPlayerName = () => {
    if (!gameState.lastPlayerId) return '준비 중';
    const lastPlayer = gameState.players.find(p => p.id === gameState.lastPlayerId);
    return lastPlayer ? lastPlayer.name : '알 수 없음';
  };

  const renderCardFace = (card, index, imageClassName = 'card-face-image') => {
    const imageSrc = getCardImageSrc(card, index);
    if (imageSrc) {
      return <img src={imageSrc} alt={getCardLabel(card)} className={imageClassName} />;
    }

    return getCardLabel(card);
  };

  const me = gameState.players.find(player => player.id === playerInfo.id);
  const myHandSize = me ? me.handSize : playerHand.length;
  const roundWinnerId = gameState.roundFinishOrder && gameState.roundFinishOrder.length > 0
    ? gameState.roundFinishOrder[0]
    : null;
  const isRoundWinner = roundWinnerId === playerInfo.id;
  const isSpectating = myHandSize === 0;
  const activePlayersLeft = gameState.players.filter(player => player.isActive).length;
  const revolutionMessage = gameState.revolutionInfo?.message;
  const showRevolutionIndicator = Boolean(revolutionMessage) && gameState.status === 'playing';

  return (
    <div className="game-board">
      {turnJustStarted && isCurrentPlayer && (
        <div className="turn-indicator">
          🎯 당신의 차례입니다!
        </div>
      )}

      {isRoundWinner && gameState.status === 'playing' && (
        <div className="winner-indicator">
          🏆 당신은 1등(달무티) 입니다. 축하합니다.
        </div>
      )}

      {showRevolutionIndicator && (
        <div className="revolution-indicator">
          🔥 혁명 발생: {revolutionMessage}
        </div>
      )}

      <div className="game-header">
        <h1>🎴 Dalmuti 게임</h1>
        <div className="game-info">
          <div className="info-item">
            <span className="label">현재 턴:</span>
            <span className={`value ${isCurrentPlayer ? 'current-player' : ''}`}>
              {getCurrentPlayerName()}
              {isCurrentPlayer && ' 👈'}
            </span>
          </div>
          <div className="info-item">
            <span className="label">라운드:</span>
            <span className="value">{gameState.round + 1}</span>
          </div>
          {isGameFinished && (
            <div className="info-item finish-status">
              <span className="label">🎉 라운드 종료!</span>
            </div>
          )}
        </div>
      </div>

      {gameState.status === 'playing' && gameState.turnEndsAt && (
        <div className={`turn-time-wrap ${isCurrentPlayer ? 'my-turn' : ''}`}>
          <div className="turn-time-text">
            <span>턴 제한시간</span>
            <span>{turnTimeLeft}s</span>
          </div>
          <div className="turn-time-track">
            <div
              className="turn-time-fill"
              style={{ width: `${Math.max(0, turnTimeProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="game-content">
        <div className="players-section">
          <h2>플레이어들</h2>
          <div className={`players-grid players-grid-${Math.min(gameState.players.length, 4)}`}>
            {gameState.players.map((player, index) => (
              <div 
                key={player.id} 
                className={`player-card ${
                  index === gameState.currentPlayerIndex ? 'active' : ''
                } ${player.id === playerInfo.id ? 'self' : ''} ${
                  !player.isActive ? 'inactive' : ''
                } ${
                  player.id === roundWinnerId ? 'winner' : ''
                }`}
              >
                <div className="player-name">{player.name}</div>
                {player.id === roundWinnerId && (
                  <div className="player-winner">🥇 달무티</div>
                )}
                {player.rank && (
                  <div className="player-rank">
                    🏆 {player.rank}등
                  </div>
                )}
                <div className="player-stat">손패: {player.handSize}장</div>
              </div>
            ))}
          </div>
        </div>

        <div className="discard-section">
          <h2>버려진 카드</h2>
          <div className="discard-pile">
            {gameState.discardPile.length > 0 ? (
              <div>
                <div className="last-player-info">
                  <span className="player-name-badge">{getLastPlayerName()}</span>
                  <span className="card-count">({gameState.tableState.count}장)</span>
                </div>
                <div className="cards-display">
                  {gameState.discardPile.map((card, idx) => (
                    <div key={idx} className="card discard-card">
                      {renderCardFace(card, idx, 'discard-card-image')}
                    </div>
                  ))}
                </div>
                <div className="table-info">
                  {gameState.tableState.value ? 
                    `${gameState.tableState.value - 1} 이상 ${gameState.tableState.count}장 필요` 
                    : 
                    '다음 플레이어: 자유롭게 선택'
                  }
                </div>
              </div>
            ) : (
              <div className="empty-message">아직 버려진 카드가 없습니다</div>
            )}
          </div>
        </div>
      </div>

      {!isSpectating ? (
        <div className="player-hand-section">
          <h2>내 손패 ({myHandSize}장)</h2>
          <div className="hand-cards">
            {playerHand.map((card, idx) => (
              <div
                key={`${card.value}-${idx}`}
                className={`card hand-card ${
                  isCardSelected(idx)
                    ? 'selected'
                    : ''
                } ${canPlayCard(card, idx) ? 'playable' : 'not-playable'}`}
                onClick={() => handleCardClick(card, idx)}
              >
                {renderCardFace(card, idx, 'hand-card-image')}
              </div>
            ))}
          </div>
          <div className="card-actions">
            <button 
              onClick={handlePlayCards}
              disabled={!isSelectionPlayable || !isCurrentPlayer || isGameFinished}
              className="play-btn"
            >
              카드 사용 ({selectedCards.length})
            </button>
            <button 
              onClick={handlePass}
              disabled={!isCurrentPlayer || isGameFinished}
              className="pass-btn"
            >
              스킵
            </button>
            <button 
              onClick={() => setSelectedCards([])}
              className="clear-btn"
            >
              선택 해제
            </button>
            <button 
              onClick={onLeaveGame}
              className="leave-btn"
            >
              게임 나가기
            </button>
          </div>
        </div>
      ) : (
        <div className="spectator-section">
          <h2>{isRoundWinner ? '👑 달무티 관전 모드' : '👀 관전 모드'}</h2>
          <p className="spectator-message">
            {isRoundWinner
              ? '당신은 이번 라운드 1등입니다! 다른 플레이어들의 진행 상황을 지켜보세요.'
              : '당신은 이번 라운드에서 손패를 모두 소진했습니다. 남은 플레이를 관전할 수 있습니다.'}
          </p>

          <div className="spectator-summary">
            <span>현재 턴: {getCurrentPlayerName()}</span>
            <span>남은 활성 플레이어: {activePlayersLeft}명</span>
          </div>

          <div className="spectator-players-grid">
            {gameState.players.map(player => (
              <div key={player.id} className={`spectator-player-card ${player.isActive ? 'active' : 'out'}`}>
                <div className="name">{player.name}</div>
                <div className="cards">손패: {player.handSize}장</div>
                <div className="state">{player.isActive ? '진행 중' : '라운드 종료'}</div>
              </div>
            ))}
          </div>

          <button 
            onClick={onLeaveGame}
            className="leave-btn"
          >
            게임 나가기
          </button>
        </div>
      )}
    </div>
  );
}

export default GameBoard;
