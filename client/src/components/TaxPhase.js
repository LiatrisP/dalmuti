import React, { useEffect, useState } from 'react';
import '../styles/TaxPhase.css';
import { getCardImageSrc, getCardLabel } from '../utils/cardImage';

function TaxPhase({ gameState, playerInfo, playerHand, socket, gameId, onLeaveGame }) {
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const isDalmuti = playerInfo.id === gameState.dalmutiId;
  const isPeon = playerInfo.id === gameState.peonId;
  const peonCardsReady = Array.isArray(gameState.taxCardsFromPeon) && gameState.taxCardsFromPeon.length === 2;
  const dalmutiReceived = Array.isArray(gameState.dalmutiReceivedTaxCards)
    ? gameState.dalmutiReceivedTaxCards
    : [];
  const waitingForPeon = dalmutiReceived.length === 0;

  useEffect(() => {
    setSelectedIndices([]);
    setSubmitted(false);
  }, [gameState.round, gameState.status]);

  const handlePeonPass = () => {
    socket.emit('giveTaxCardsFromPeon', gameId);
  };

  const handleCardClick = (index) => {
    if (!isDalmuti || waitingForPeon || submitted) return;
    
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter(i => i !== index));
    } else if (selectedIndices.length < 2) {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const handleDalmutiSubmit = () => {
    if (selectedIndices.length === 2) {
      socket.emit('dalmutiChooseTaxCards', gameId, selectedIndices);
      setSubmitted(true);
    }
  };

  const renderCardFace = (card, index) => {
    if (!card) return '?';

    const imageSrc = getCardImageSrc(card, index);
    if (imageSrc) {
      return <img src={imageSrc} alt={getCardLabel(card)} className="tax-card-image" />;
    }

    return <div className="card-value">{getCardLabel(card)}</div>;
  };

  const getDalmutiBeneficiaryName = () => {
    return gameState.players.find(p => p.id === gameState.dalmutiId)?.name || '선순위 플레이어';
  };

  const getPeonBenefactorName = () => {
    return gameState.players.find(p => p.id === gameState.peonId)?.name || '후순위 플레이어';
  };

  // Peon 화면
  if (isPeon) {
    return (
      <div className="tax-phase-container">
        <div className="tax-phase-header">
          <h1>💰 세금 징수 페이즈</h1>
          <p>{getPeonBenefactorName()}님이 {getDalmutiBeneficiaryName()}님에게 가장 강한 카드 2장을 제공합니다.</p>
        </div>

        <div className="peon-view">
          <div className="tax-cards-display">
            <p className="instruction">제공할 카드:</p>
            <div className="cards-container">
              {(gameState.taxCardsFromPeon || []).map((card, idx) => (
                <div key={idx} className="card tax-card">
                  {renderCardFace(card, idx)}
                </div>
              ))}
            </div>
          </div>

          {peonCardsReady ? (
            <>
              <button className="pass-button" onClick={handlePeonPass}>
                넘기기
              </button>
              <p className="forced-text">어쩔 수 없는 상황입니다.</p>
            </>
          ) : (
            <p className="forced-text">카드를 넘겼습니다. 달무티가 반환 카드를 고르는 중입니다.</p>
          )}

          <button onClick={onLeaveGame} className="leave-button">
            게임 나가기
          </button>
        </div>
      </div>
    );
  }

  // Dalmuti 화면
  if (isDalmuti) {
    return (
      <div className="tax-phase-container">
        <div className="tax-phase-header">
          <h1>💰 세금 징수 페이즈</h1>
          <p>{getPeonBenefactorName()}님으로부터 받은 카드 2장을 확인하세요.</p>
        </div>

        <div className="dalmuti-view">
          <div className="received-cards-section">
            <p className="section-title">받은 카드:</p>
            <div className="cards-container">
              {dalmutiReceived.map((card, idx) => (
                <div key={idx} className="card tax-card received">
                  {renderCardFace(card, idx)}
                </div>
              ))}
            </div>
          </div>

          {waitingForPeon ? (
            <div className="selection-info">
              <p>후순위 플레이어가 카드를 넘기기를 기다리는 중입니다...</p>
            </div>
          ) : (
            <>
              <div className="hand-section">
                <p className="section-title">자신의 카드 패에서 2장을 선택하세요:</p>
                <div className="cards-container hand-cards">
                  {(playerHand || []).map((card, idx) => (
                    <div
                      key={`${card.value}-${idx}`}
                      className={`card hand-card ${selectedIndices.includes(idx) ? 'selected' : ''}`}
                      onClick={() => handleCardClick(idx)}
                    >
                      {renderCardFace(card, idx)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="selection-info">
                <p>반환할 카드 선택: {selectedIndices.length}/2</p>
              </div>

              <button
                className="submit-button"
                onClick={handleDalmutiSubmit}
                disabled={selectedIndices.length !== 2 || submitted}
              >
                {submitted ? '전송 완료' : '카드 2장 넘기기'}
              </button>
            </>
          )}

          <button onClick={onLeaveGame} className="leave-button">
            게임 나가기
          </button>
        </div>
      </div>
    );
  }

  // 다른 플레이어 화면
  return (
    <div className="tax-phase-container">
      <div className="tax-phase-header">
        <h1>💰 세금 징수 페이즈</h1>
        <p>{getPeonBenefactorName()}님이 {getDalmutiBeneficiaryName()}님에게 카드 2장을 제공 중입니다.</p>
      </div>

      <div className="spectator-view">
        <div className="waiting-message">
          <p>세금 징수 진행 중...</p>
          <p className="sub-text">
            {waitingForPeon
              ? `${getPeonBenefactorName()}님이 카드를 넘기는 중입니다.`
              : `${getDalmutiBeneficiaryName()}님이 반환 카드를 고르는 중입니다.`}
          </p>
        </div>

        <div className="players-info">
          <p><strong>{getPeonBenefactorName()}</strong>: 후순위 플레이어</p>
          <p><strong>{getDalmutiBeneficiaryName()}</strong>: 선순위 플레이어</p>
        </div>

        <button onClick={onLeaveGame} className="leave-button">
          게임 나가기
        </button>
      </div>
    </div>
  );
}

export default TaxPhase;
