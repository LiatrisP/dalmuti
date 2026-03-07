import React, { useEffect, useMemo, useState } from 'react';
import './RevolutionPhase.css';
import { getCardImageSrc, getCardLabel } from '../utils/cardImage';

function RevolutionPhase({ gameState, playerInfo, playerHand, socket, gameId, onLeaveGame }) {
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [submittedAction, setSubmittedAction] = useState('');

  const myName = useMemo(() => {
    const me = gameState.players.find(player => player.id === playerInfo.id);
    return me ? me.name : '플레이어';
  }, [gameState.players, playerInfo.id]);

  const isPeon = playerInfo.id === gameState.peonId;
  const jokerCount = playerHand.filter(card => card.value === 'JOKER').length;
  const canChooseRevolution = jokerCount === 2;

  useEffect(() => {
    setSubmittedAction('');
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
    if (!canChooseRevolution || submittedAction || secondsLeft === 0) return;
    socket.emit('startRevolution', gameId);
    setSubmittedAction('revolution');
  };

  const handleStartGreatRevolution = () => {
    if (!canChooseRevolution || !isPeon || submittedAction || secondsLeft === 0) return;
    socket.emit('startGreatRevolution', gameId);
    setSubmittedAction('great-revolution');
  };

  const handleConfirmDone = () => {
    if (!canChooseRevolution || submittedAction || secondsLeft === 0) return;
    socket.emit('skipRevolution', gameId);
    setSubmittedAction('confirmed');
  };

  return (
    <div className="revolution-phase-container">
      <div className="revolution-header">
        <h1>🃏 혁명 확인 페이즈</h1>
        <p>{myName}님의 손패를 확인하세요. 최대 30초 후 다음 단계로 이동합니다.</p>
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

      {canChooseRevolution ? (
        <div className="revolution-action-box">
          <h3>🔥 선택 가능: 혁명 / 확인완료</h3>
          <p>조커 2장을 확인했습니다. 원하는 행동을 선택하세요.</p>
          <p className="rule-hint">
            {isPeon
              ? '혁명: 계급 유지 + 세금 없음 / 대혁명: 계급 역전 + 세금 없음'
              : '혁명: 계급 유지 + 세금 없음'}
          </p>
          <div className="revolution-action-buttons">
            <button
              className="revolution-btn"
              onClick={handleStartRevolution}
              disabled={Boolean(submittedAction) || secondsLeft === 0}
            >
              {submittedAction === 'revolution' ? '혁명 요청 전송됨' : '혁명'}
            </button>

            {isPeon && (
              <button
                className="great-revolution-btn"
                onClick={handleStartGreatRevolution}
                disabled={Boolean(submittedAction) || secondsLeft === 0}
              >
                {submittedAction === 'great-revolution' ? '대혁명 요청 전송됨' : '대혁명'}
              </button>
            )}

            <button
              className="confirm-btn"
              onClick={handleConfirmDone}
              disabled={Boolean(submittedAction) || secondsLeft === 0}
            >
              {submittedAction === 'confirmed' ? '확인완료 전송됨' : '확인완료'}
            </button>
          </div>
        </div>
      ) : (
        <div className="revolution-wait-box">
          <p>손패 확인 중입니다. 시간이 끝나면 다음 단계로 이동합니다.</p>
        </div>
      )}

      <button className="leave-button" onClick={onLeaveGame}>
        게임 나가기
      </button>
    </div>
  );
}

export default RevolutionPhase;
