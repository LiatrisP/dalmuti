import React, { useEffect, useMemo, useState } from 'react';
import './RevolutionPhase.css';
import { getCardImageSrc, getCardLabel } from '../utils/cardImage';

function RevolutionPhase({ gameState, playerInfo, playerHand, socket, gameId, onLeaveGame }) {
  const [secondsLeft, setSecondsLeft] = useState(30);

  const myName = useMemo(() => {
    const me = gameState.players.find(player => player.id === playerInfo.id);
    return me ? me.name : '플레이어';
  }, [gameState.players, playerInfo.id]);

  const isPeon = playerInfo.id === gameState.peonId;
  const jokerCount = playerHand.filter(card => card.value === 'JOKER').length;
  const canChooseRevolution = jokerCount === 2;
  const confirmedPlayerIds = gameState.revolutionConfirmedPlayerIds || [];
  const revolutionDeclaredBy = gameState.revolutionDeclaredBy || null;
  const isRevolutionDeclared = Boolean(revolutionDeclaredBy);
  const isRevolutionDeclarer = revolutionDeclaredBy === playerInfo.id;
  const hasConfirmed = confirmedPlayerIds.includes(playerInfo.id);
  const revolutionDeclarerName = gameState.players.find(player => player.id === revolutionDeclaredBy)?.name || '플레이어';

  const requiredConfirmCount = gameState.players.length - (isRevolutionDeclared ? 1 : 0);
  const confirmedCount = gameState.players.reduce((count, player) => {
    if (isRevolutionDeclared && player.id === revolutionDeclaredBy) {
      return count;
    }

    return count + (confirmedPlayerIds.includes(player.id) ? 1 : 0);
  }, 0);
  const remainingCount = Math.max(0, requiredConfirmCount - confirmedCount);

  const canSubmitRevolution = canChooseRevolution
    && !isRevolutionDeclared
    && !hasConfirmed
    && secondsLeft > 0;
  const canSubmitGreatRevolution = canSubmitRevolution && isPeon;
  const showGreatRevolutionOnly = canChooseRevolution && isPeon;
  const showNormalRevolutionOnly = canChooseRevolution && !isPeon;
  const canConfirmPass = !hasConfirmed
    && !isRevolutionDeclarer
    && secondsLeft > 0
    && gameState.status === 'revolution-check';

  useEffect(() => {
    setSecondsLeft(30);
  }, [gameState.round, gameState.status]);

  useEffect(() => {
    if (gameState.status !== 'revolution-check') return;

    const tick = () => {
      if (!gameState.revolutionCheckEndsAt) {
        setSecondsLeft(0);
        return;
      }

      const msLeft = gameState.revolutionCheckEndsAt - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(msLeft / 1000)));
    };

    tick();
    const timer = setInterval(tick, 120);
    return () => clearInterval(timer);
  }, [gameState.status, gameState.revolutionCheckEndsAt]);

  const renderCardFace = (card, index) => {
    const imageSrc = getCardImageSrc(card, index);
    if (imageSrc) {
      return <img src={imageSrc} alt={getCardLabel(card)} className="hand-card-image" />;
    }

    return getCardLabel(card);
  };

  const handleStartRevolution = () => {
    if (!canSubmitRevolution) return;
    socket.emit('startRevolution', gameId);
  };

  const handleStartGreatRevolution = () => {
    if (!canSubmitGreatRevolution) return;
    socket.emit('startGreatRevolution', gameId);
  };

  const handleConfirmDone = () => {
    if (!canConfirmPass) return;
    socket.emit('skipRevolution', gameId);
  };

  return (
    <div className="revolution-phase-container">
      <div className="revolution-header">
        <h1>🃏 혁명 확인 페이즈</h1>
        <p>{myName}님의 손패를 확인하세요. 최대 30초 후 자동으로 다음 단계로 이동합니다.</p>
      </div>

      <div className="countdown-box">
        <span className="label">남은 시간</span>
        <span className="count">{secondsLeft}</span>
      </div>

      <div className="my-hand-box">
        <h2>내 손패 ({playerHand.length}장)</h2>
        <div className="hand-cards">
          {playerHand.map((card, idx) => (
            <div key={`${card.value}-${idx}`} className="hand-card">
              {renderCardFace(card, idx)}
            </div>
          ))}
        </div>
      </div>

      <div className="revolution-wait-box">
        {isRevolutionDeclared ? (
          <>
            <p>🔥 {revolutionDeclarerName}님이 혁명을 선언했습니다.</p>
            <p>확인 완료: {confirmedCount}/{requiredConfirmCount} (남은 인원: {remainingCount}명)</p>
          </>
        ) : (
          <>
            <p>아직 혁명 선언이 없습니다.</p>
            <p>모든 플레이어가 확인 완료 넘기기를 누르면 세금 징수 페이즈로 이동합니다.</p>
          </>
        )}
      </div>

      {canChooseRevolution ? (
        <div className="revolution-action-box">
          <h3>
            {showGreatRevolutionOnly
              ? '🔥 선택 가능: 대혁명 / 확인 완료 넘기기'
              : '🔥 선택 가능: 혁명 / 확인 완료 넘기기'}
          </h3>
          <p>조커 2장을 확인했습니다. 원하는 행동을 선택하세요.</p>
          <p className="rule-hint">
            {isPeon
              ? '대혁명: 계급 역전 + 세금 없음'
              : '혁명: 계급 유지 + 세금 없음'}
          </p>
          <div className="revolution-action-buttons">
            {showNormalRevolutionOnly && (
              <button
                className="revolution-btn"
                onClick={handleStartRevolution}
                disabled={!canSubmitRevolution}
              >
                {isRevolutionDeclarer ? '혁명 선언 완료' : '혁명'}
              </button>
            )}

            {showGreatRevolutionOnly && (
              <button
                className="great-revolution-btn"
                onClick={handleStartGreatRevolution}
                disabled={!canSubmitGreatRevolution}
              >
                {isRevolutionDeclarer ? '대혁명 선언 완료' : '대혁명'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="revolution-action-box">
          <h3>혁명 선언 조건 없음</h3>
          <p>확인 완료 넘기기를 눌러 다음 단계로 진행하세요.</p>
        </div>
      )}

      <button
        className="confirm-btn"
        onClick={handleConfirmDone}
        disabled={!canConfirmPass}
      >
        {isRevolutionDeclarer
          ? '혁명 선언 완료'
          : hasConfirmed
            ? '확인 완료됨'
            : '확인 완료 넘기기'}
      </button>

      <button className="leave-button" onClick={onLeaveGame}>
        게임 나가기
      </button>
    </div>
  );
}

export default RevolutionPhase;
