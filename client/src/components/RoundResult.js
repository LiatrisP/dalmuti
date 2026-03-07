import React, { useEffect, useMemo, useState } from 'react';
import './RoundResult.css';

function RoundResult({ gameState, playerInfo, socket, onLeaveGame }) {
  const [nextRoundIn, setNextRoundIn] = useState(5);
  const isRoundFinished = gameState.status === 'round-finished';
  const isGameFinished = gameState.status === 'game-finished';
  const isRestartJoinMode = gameState.status === 'waiting' && Boolean(gameState.restartRequested);
  const showFinalRanking = isGameFinished || isRestartJoinMode;
  const waitingRoomEnteredIds = gameState.waitingRoomEnteredPlayerIds || [];
  const isInWaitingRoom = waitingRoomEnteredIds.includes(playerInfo.id);
  const canRequestRestart = isGameFinished && playerInfo.isOwner;
  const canJoinRestartWaitingRoom = isRestartJoinMode && !playerInfo.isOwner && !isInWaitingRoom;
  const playerCount = gameState.players.length;

  useEffect(() => {
    if (!isRoundFinished) return;

    setNextRoundIn(5);
    let remaining = 5;
    const timer = setInterval(() => {
      remaining -= 1;

      if (remaining <= 0) {
        clearInterval(timer);
        setNextRoundIn(0);
        socket.emit('prepareNextRound', playerInfo.gameId);
        return;
      }

      setNextRoundIn(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [socket, playerInfo.gameId, gameState.round, isRoundFinished]);

  const roundScoreMap = useMemo(() => {
    const map = new Map();
    (gameState.lastRoundScores || []).forEach(entry => {
      map.set(entry.playerId, entry);
    });
    return map;
  }, [gameState.lastRoundScores]);

  const finalScoreRanking = useMemo(() => {
    if (isRestartJoinMode && Array.isArray(gameState.lastGameScoreRanking) && gameState.lastGameScoreRanking.length > 0) {
      return gameState.lastGameScoreRanking;
    }

    if (Array.isArray(gameState.scoreRanking) && gameState.scoreRanking.length > 0) {
      return gameState.scoreRanking;
    }

    return [...gameState.players]
      .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
      .map((player, index) => ({
        playerId: player.id,
        name: player.name,
        totalScore: player.totalScore || 0,
        rank: index + 1
      }));
  }, [isRestartJoinMode, gameState.lastGameScoreRanking, gameState.scoreRanking, gameState.players]);

  const getRoleTitle = (rank) => {
    if (rank === 1) return '👑 Greater Dalmuti (대영주)';
    if (rank === 2) return '🎭 Lesser Dalmuti (소영주)';
    if (rank === playerCount - 1) return '👨‍🌾 Greater Peon (대노예)';
    if (rank === playerCount) return '👩‍🌾 Lesser Peon (소노예)';
    return '🏪 Merchant (상인)';
  };

  const handleRestartAction = () => {
    if (canJoinRestartWaitingRoom) {
      socket.emit('joinRestartWaitingRoom', playerInfo.gameId);
      return;
    }

    if (canRequestRestart) {
      socket.emit('restartGame', playerInfo.gameId);
    }
  };

  return (
    <div className="round-result-container">
      <h2>
        {isRestartJoinMode
          ? '🎴 게임 재시작 대기'
          : isGameFinished
            ? `🎉 라운드 ${gameState.round} 종료!`
            : `🎴 라운드 ${gameState.round} 종료!`}
      </h2>

      <div className="result-ranking">
        <h3>{showFinalRanking ? '최종 순위 (누적 점수 기준):' : '이번 라운드 순위:'}</h3>
        <div className="ranking-list">
          {showFinalRanking
            ? finalScoreRanking.map(entry => {
                const rank = entry.rank;
                const isYou = entry.playerId === playerInfo.id;

                return (
                  <div
                    key={entry.playerId}
                    className={`ranking-item rank-${rank} ${isYou ? 'current-player' : ''}`}
                  >
                    <div className="ranking-position">순위 #{rank}</div>
                    <div className="player-info">
                      <span className="player-name">{entry.name}</span>
                      {isYou && <span className="you-badge">👤 나</span>}
                    </div>
                    <div className="role-title">{getRoleTitle(rank)}</div>
                    <div className="score-badge">총 {entry.totalScore}점</div>
                  </div>
                );
              })
            : gameState.roundFinishOrder.map((playerId, index) => {
                const player = gameState.players.find(p => p.id === playerId);
                const rank = index + 1;
                const isYou = playerId === playerInfo.id;
                const scoreInfo = roundScoreMap.get(playerId);

                return (
                  <div
                    key={playerId}
                    className={`ranking-item rank-${rank} ${isYou ? 'current-player' : ''}`}
                  >
                    <div className="ranking-position">순위 #{rank}</div>
                    <div className="player-info">
                      <span className="player-name">{player.name}</span>
                      {isYou && <span className="you-badge">👤 나</span>}
                    </div>
                    <div className="role-title">{getRoleTitle(rank)}</div>
                    <div className="score-badge">
                      {scoreInfo
                        ? `+${scoreInfo.points}점 · 누적 ${scoreInfo.totalScore}점`
                        : `누적 ${player.totalScore || 0}점`}
                    </div>
                  </div>
                );
              })}
        </div>
      </div>

      <div className="next-round-info">
        <h3>{isRoundFinished ? '다음 라운드 정보' : '게임 결과'}</h3>
        {isRoundFinished ? (
          <div>
            <p>현재 진행: {gameState.round} / {gameState.maxRounds} 라운드</p>
            <p>다음 라운드가 {nextRoundIn}초 후 시작됩니다...</p>
            <div className="countdown">{nextRoundIn}</div>
          </div>
        ) : (
          <div>
            <p>🎊 게임이 종료되었습니다!</p>
            {isRestartJoinMode
              ? <p>방장이 다시하기를 시작했습니다. 아래 버튼으로 대기방에 입장할 수 있습니다.</p>
              : <p>최종 순위는 누적 점수 기준으로 계산되었습니다.</p>}
            <div className="game-over">게임 완료!</div>
          </div>
        )}
      </div>

      <div className="result-actions">
        {showFinalRanking && (
          <button
            className="restart-btn"
            onClick={handleRestartAction}
            disabled={!(canRequestRestart || canJoinRestartWaitingRoom)}
          >
            다시하기
          </button>
        )}
        <button className="leave-btn" onClick={onLeaveGame}>
          나가기
        </button>
      </div>

      {isGameFinished && !playerInfo.isOwner && !isRestartJoinMode && (
        <p className="action-hint">방장이 다시하기를 선택하면 입장하실 수 있습니다.</p>
      )}

      {canJoinRestartWaitingRoom && (
        <p className="action-hint">방장이 다시하기를 시작했습니다. 다시하기를 누르면 대기방으로 이동합니다.</p>
      )}
    </div>
  );
}

export default RoundResult;
