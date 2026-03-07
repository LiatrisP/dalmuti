import React, { useState, useEffect } from 'react';
import './CardDraw.css';
import { getCardImageSrc, getCardLabel } from '../utils/cardImage';

function CardDraw({ gameState, playerInfo, socket, onLeaveGame }) {
  const [hasDrawn, setHasDrawn] = useState(false);
  const [drawnCard, setDrawnCard] = useState(null);

  // 드로우 결과 표시 상태가 되면 4초 후에 게임 시작
  useEffect(() => {
    if (gameState.status === 'drawing-results') {
      const timer = setTimeout(() => {
        socket.emit('startGameAfterDrawing', playerInfo.gameId);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [gameState.status, socket, playerInfo.gameId]);

  const handleDrawCard = () => {
    console.log('카드 뽑기 버튼 클릭됨');
    socket.emit('drawCard', playerInfo.gameId, (result) => {
      console.log('drawCard 결과:', result);
      if (result.success) {
        setHasDrawn(true);
        setDrawnCard(result.card);
      } else {
        console.error('카드 뽑기 실패:', result.message);
      }
    });
  };

  const renderCardContent = (card, index, imageClassName) => {
    if (!card) return '?';

    const imageSrc = getCardImageSrc(card, index);
    if (imageSrc) {
      return <img src={imageSrc} alt={getCardLabel(card)} className={imageClassName} />;
    }

    return getCardLabel(card);
  };

  const getRoleFromPosition = (index) => {
    const roles = {
      0: '👑 Greater Dalmuti (대영주)',
      1: '🎭 Lesser Dalmuti (소영주)',
      'merchant': '🏪 Merchant (상인)',
      'last-1': '👨‍🌾 Greater Peon (대노예)',
      'last': '👩‍🌾 Lesser Peon (소노예)'
    };
    
    const playerCount = gameState.players.length;
    
    if (index === 0) return roles[0];
    if (index === 1) return roles[1];
    if (index === playerCount - 2) return roles['last-1'];
    if (index === playerCount - 1) return roles['last'];
    return roles['merchant'];
  };

  // 드로우 결과 표시 상태인지 확인
  const isShowingResults = gameState.status === 'drawing-results';
  const drawnPlayerIds = gameState.drawnPlayerIds || [];
  const drawnCount = isShowingResults ? gameState.drawOrder.length : (gameState.drawnCount || 0);
  const currentPlayerDrawn = isShowingResults
    ? gameState.drawOrder.some(d => d.id === playerInfo.id)
    : drawnPlayerIds.includes(playerInfo.id);
  const myTurnOrder = gameState.drawOrder.findIndex(d => d.id === playerInfo.id);

  return (
    <div className="card-draw-container">
      <h2>{isShowingResults ? '🎴 카드 드로우 결과!' : '🎴 카드를 뽑아 순서를 정하세요!'}</h2>
      
      {isShowingResults ? (
        <div className="draw-info">
          <p>4초 후에 게임이 시작됩니다...</p>
        </div>
      ) : (
        <div className="draw-info">
          <p>낮은 숫자 = 👑 Dalmuti (영주)</p>
          <p>높은 숫자 = 👨‍🌾 Peon (노예)</p>
        </div>
      )}

      <div className="draw-status">
        <p>{drawnCount} / {gameState.players.length} 플레이어가 카드를 뽑았습니다</p>
      </div>

      {!currentPlayerDrawn && !isShowingResults ? (
        <div className="draw-action">
          <button 
            className="draw-button"
            onClick={handleDrawCard}
            disabled={hasDrawn}
          >
            🎲 카드 뽑기
          </button>
          {hasDrawn && drawnCard && (
            <div className="drawn-card-display">
              <p>당신이 뽑은 카드:</p>
              <p className="turn-order-text">당신의 턴 순서는 계산 중입니다...</p>
              <div className="card-big">
                {renderCardContent(drawnCard, 0, 'card-big-image')}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="drawn-card-display">
          <p>당신이 뽑은 카드:</p>
          <p className="turn-order-text">
            {myTurnOrder >= 0
              ? `당신의 턴은 ${myTurnOrder + 1}번째 입니다!`
              : '당신의 턴 순서는 계산 중입니다...'}
          </p>
          <div className="card-big">
            {isShowingResults
              ? renderCardContent(gameState.drawOrder.find(d => d.id === playerInfo.id)?.card, myTurnOrder, 'card-big-image')
              : renderCardContent(drawnCard, 0, 'card-big-image')}
          </div>
        </div>
      )}

      {gameState.drawOrder.length > 0 && (
        <div className="draw-results">
          <h3>🎴 뽑은 카드 목록:</h3>
          <div className="draw-order-list">
            {gameState.drawOrder.map((entry, index) => (
              <div key={entry.id} className={`draw-entry ${index === 0 ? 'dalmuti' : index === gameState.drawOrder.length - 1 ? 'peon' : 'merchant'}`}>
                <div className="draw-rank">순위 #{index + 1}</div>
                <div className="player-name">{entry.name}</div>
                <div className="drawn-card">{renderCardContent(entry.card, index, 'drawn-card-image')}</div>
                <div className="role">{getRoleFromPosition(index)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isShowingResults && (
        <div className="game-starting">
          <p>✅ 모든 플레이어가 카드를 뽑았습니다!</p>
          <p>게임이 곧 시작됩니다...</p>
        </div>
      )}

      <div className="draw-actions">
        <button 
          onClick={onLeaveGame}
          className="leave-btn"
        >
          게임 나가기
        </button>
      </div>
    </div>
  );
}

export default CardDraw;
