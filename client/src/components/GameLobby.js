import React, { useState } from 'react';
import './GameLobby.css';

function GameLobby({ onCreateGame, onJoinGame, onJoinPublicGame, publicGames = [], lobbyError = '' }) {
  const [createPlayerName, setCreatePlayerName] = useState('');
  const [createGameCode, setCreateGameCode] = useState('');
  const [rounds, setRounds] = useState(3);
  const [visibility, setVisibility] = useState('private');

  const [joinPlayerName, setJoinPlayerName] = useState('');
  const [joinGameCode, setJoinGameCode] = useState('');

  const [isCreating, setIsCreating] = useState(true);
  const [localMessage, setLocalMessage] = useState('');

  const statusLabelMap = {
    waiting: '대기중',
    drawing: '카드뽑기',
    'drawing-results': '카드뽑기 결과',
    'revolution-check': '혁명 확인',
    'tax-phase': '세금 징수',
    playing: '진행중',
    'round-finished': '라운드 종료',
    'game-finished': '게임 종료'
  };

  const handleCreateGame = (e) => {
    e.preventDefault();
    const trimmedName = createPlayerName.trim();
    const trimmedCode = createGameCode.trim();

    if (!trimmedName) {
      setLocalMessage('플레이어 이름을 입력해주세요.');
      return;
    }

    if (!trimmedCode) {
      setLocalMessage('게임 코드를 입력해주세요.');
      return;
    }

    setLocalMessage('');
    onCreateGame(trimmedName, trimmedCode, rounds, visibility);
  };

  const handleJoinGame = (e) => {
    e.preventDefault();
    const trimmedName = joinPlayerName.trim();
    const trimmedCode = joinGameCode.trim();

    if (!trimmedName) {
      setLocalMessage('플레이어 이름을 입력해주세요.');
      return;
    }

    if (!trimmedCode) {
      setLocalMessage('게임 코드를 입력해주세요.');
      return;
    }

    setLocalMessage('');
    onJoinGame(trimmedCode, trimmedName);
  };

  const handleJoinPublicRoom = (roomGameId) => {
    if (!joinPlayerName.trim()) {
      setLocalMessage('공개방 참여 전 플레이어 이름을 먼저 입력해주세요.');
      return;
    }

    setLocalMessage('');
    if (onJoinPublicGame) {
      onJoinPublicGame(roomGameId, joinPlayerName.trim());
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-container">
        <h1>🎴 Dalmuti</h1>
        <p className="subtitle">멀티플레이 카드 게임</p>

        <div className="mode-selector">
          <button 
            className={`mode-btn ${isCreating ? 'active' : ''}`}
            onClick={() => {
              setIsCreating(true);
              if (localMessage) setLocalMessage('');
            }}
          >
            새 게임
          </button>
          <button 
            className={`mode-btn ${!isCreating ? 'active' : ''}`}
            onClick={() => {
              setIsCreating(false);
              if (localMessage) setLocalMessage('');
            }}
          >
            게임 참여
          </button>
        </div>

        {(lobbyError || localMessage) && (
          <div className="lobby-error">{lobbyError || localMessage}</div>
        )}

        {isCreating ? (
          <form onSubmit={handleCreateGame} className="form">
            <div className="form-group">
              <label>플레이어 이름</label>
              <input
                type="text"
                value={createPlayerName}
                onChange={(e) => {
                  setCreatePlayerName(e.target.value);
                  if (localMessage) setLocalMessage('');
                }}
                placeholder="닉네임을 입력하세요"
                maxLength="20"
              />
            </div>

            <div className="form-group">
              <label>게임 코드</label>
              <input
                type="text"
                value={createGameCode}
                onChange={(e) => {
                  setCreateGameCode(e.target.value);
                  if (localMessage) setLocalMessage('');
                }}
                placeholder="직접 게임 코드를 입력하세요"
                maxLength="30"
              />
            </div>

            <div className="form-group">
              <label>라운드 수</label>
              <select
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                className="rounds-select"
              >
                <option value={1}>1 라운드</option>
                <option value={3}>3 라운드</option>
                <option value={5}>5 라운드</option>
                <option value={10}>10 라운드</option>
              </select>
            </div>

            <div className="form-group">
              <label>공개 설정</label>
              <div className="visibility-selector">
                <button
                  type="button"
                  className={`visibility-btn ${visibility === 'public' ? 'active' : ''}`}
                  onClick={() => setVisibility('public')}
                >
                  공개
                </button>
                <button
                  type="button"
                  className={`visibility-btn ${visibility === 'private' ? 'active' : ''}`}
                  onClick={() => setVisibility('private')}
                >
                  비공개
                </button>
              </div>
            </div>

            <button type="submit" className="submit-btn">
              게임 만들기
            </button>
          </form>
        ) : (
          <div className="form join-form-wrap">
            <form onSubmit={handleJoinGame} className="form join-form">
              <div className="form-group">
                <label>플레이어 이름</label>
                <input
                  type="text"
                  value={joinPlayerName}
                  onChange={(e) => {
                    setJoinPlayerName(e.target.value);
                    if (localMessage) setLocalMessage('');
                  }}
                  placeholder="닉네임을 입력하세요"
                  maxLength="20"
                />
              </div>

              <div className="form-group">
                <label>게임 코드</label>
                <input
                  type="text"
                  value={joinGameCode}
                  onChange={(e) => {
                    setJoinGameCode(e.target.value);
                    if (localMessage) setLocalMessage('');
                  }}
                  placeholder="게임 코드를 입력하세요"
                  maxLength="30"
                />
              </div>

              <button type="submit" className="submit-btn">
                게임 참여
              </button>
            </form>

            <div className="public-rooms-section">
              <h3>공개방 목록</h3>

              {publicGames.length === 0 ? (
                <p className="empty-public-rooms">현재 참여 가능한 공개방이 없습니다.</p>
              ) : (
                <div className="public-room-list">
                  {publicGames.map(room => (
                    <div key={room.gameId} className="public-room-item">
                      <div className="public-room-main">
                        <span className="public-room-code">{room.gameCode || room.gameId}</span>
                        <span className={`room-status status-${room.status}`}>{statusLabelMap[room.status] || room.status}</span>
                        <button
                          type="button"
                          className="public-join-btn"
                          onClick={() => handleJoinPublicRoom(room.gameCode || room.gameId)}
                          disabled={!room.joinable}
                        >
                          참여
                        </button>
                      </div>
                      <div className="public-room-meta">
                        ({room.currentPlayers}/{room.maxPlayers})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GameLobby;
