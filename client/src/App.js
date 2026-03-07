import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import GameLobby from './components/GameLobby';
import GameBoard from './components/GameBoard';
import CardDraw from './components/CardDraw';
import RoundResult from './components/RoundResult';
import TaxPhase from './components/TaxPhase';
import RevolutionPhase from './components/RevolutionPhase';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [playerInfo, setPlayerInfo] = useState(null);
  const [playerHand, setPlayerHand] = useState([]);
  const [error, setError] = useState(null);
  const [publicGames, setPublicGames] = useState([]);

  useEffect(() => {
    const socketUrl = (process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000').trim();
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      newSocket.emit('requestPublicGames');
    });
    
    newSocket.on('gameState', (state) => {
      setGameState(state);
    });

    newSocket.on('playerHand', (data) => {
      setPlayerHand(data.hand);
    });

    newSocket.on('cardPlayed', (data) => {
      console.log('카드 플레이:', data);
    });

    newSocket.on('error', (message) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    });

    newSocket.on('gameFinished', (data) => {
      console.log('게임 종료:', data);
    });

    newSocket.on('publicGamesList', (rooms) => {
      setPublicGames(Array.isArray(rooms) ? rooms : []);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const handleCreateGame = (playerName, gameCode, rounds = 3, visibility = 'private') => {
    if (socket) {
      socket.emit('createGame', {
        playerName,
        gameCode,
        rounds,
        visibility
      }, (response) => {
        if (response.success) {
          setPlayerInfo({ 
            id: socket.id,
            name: playerName, 
            gameId: response.gameId,
            displayCode: response.displayCode || gameCode,
            isOwner: true
          });
        } else {
          setError(response.message || '게임 생성에 실패했습니다');
          setTimeout(() => setError(null), 3000);
        }
      });
    }
  };

  const handleJoinGame = (gameId, playerName) => {
    if (socket) {
      socket.emit('joinGame', gameId, playerName, (response) => {
        if (response.success) {
          setPlayerInfo({ 
            id: socket.id,
            name: playerName, 
            gameId: response.gameId,
            displayCode: response.displayCode || gameId,
            isOwner: false
          });
        } else {
          setError(response.message);
          setTimeout(() => setError(null), 3000);
        }
      });
    }
  };

  const handleJoinPublicGame = (gameId, playerName) => {
    handleJoinGame(gameId, playerName);
  };

  const handleStartGame = () => {
    if (socket && playerInfo && playerInfo.isOwner) {
      socket.emit('startGame', playerInfo.gameId);
    }
  };

  const handlePlayCards = (cards) => {
    if (socket && playerInfo) {
      socket.emit('playCards', playerInfo.gameId, cards);
    }
  };

  const handleLeaveGame = () => {
    if (window.confirm('게임을 나가시겠습니까?')) {
      if (socket && playerInfo) {
        socket.emit('leaveGame', playerInfo.gameId);
      }
      setPlayerInfo(null);
      setGameState(null);
      setPlayerHand([]);
    }
  };

  if (!playerInfo) {
    if (!socket) {
      return <div className="loading">서버에 연결 중...</div>;
    }
    return (
      <GameLobby
        onCreateGame={handleCreateGame}
        onJoinGame={handleJoinGame}
        onJoinPublicGame={handleJoinPublicGame}
        publicGames={publicGames}
        lobbyError={error}
      />
    );
  }

  const isRestartRequested = Boolean(gameState?.restartRequested);
  const waitingRoomEnteredIds = gameState?.waitingRoomEnteredPlayerIds || [];
  const isInWaitingRoom = waitingRoomEnteredIds.includes(playerInfo.id);
  const showWaitingRoom = Boolean(gameState)
    && gameState.status === 'waiting'
    && (!isRestartRequested || isInWaitingRoom);
  const showRestartJoinResult = Boolean(gameState)
    && gameState.status === 'waiting'
    && isRestartRequested
    && !isInWaitingRoom;
  const visibleGameCode = gameState?.gameCode || playerInfo.displayCode || playerInfo.gameId;

  return (
    <div className="app">
      {error && <div className="error-message">{error}</div>}
      {showWaitingRoom ? (
        <div className="waiting-room">
          <h1>게임 대기실</h1>
          <div className="game-code-display">
            <label>게임 코드</label>
            <div className="code-box">
              <span className="code-text">{visibleGameCode}</span>
              <button 
                className="copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(visibleGameCode);
                  alert('게임 코드가 복사되었습니다!');
                }}
              >
                📋 복사
              </button>
            </div>
          </div>
          <div className="player-list">
            <h2>플레이어 ({gameState.players.length}/{gameState.maxPlayers})</h2>
            <ul>
              {gameState.players.map(player => (
                <li key={player.id}>
                  {player.name}
                  {gameState.ownerId === player.id && <span className="owner-badge">👑 방장</span>}
                </li>
              ))}
            </ul>
          </div>
          <button 
            onClick={handleStartGame} 
            disabled={gameState.players.length < 2 || !playerInfo.isOwner}
            className={playerInfo.isOwner ? '' : 'disabled-info'}
          >
            게임 시작 {!playerInfo.isOwner && '(방장만 가능)'}
          </button>
          <button 
            onClick={handleLeaveGame}
            className="leave-btn"
          >
            나가기
          </button>
        </div>
      ) : gameState && (gameState.status === 'drawing' || gameState.status === 'drawing-results') ? (
        <CardDraw 
          gameState={gameState}
          playerInfo={playerInfo}
          socket={socket}
          onLeaveGame={handleLeaveGame}
        />
      ) : gameState && gameState.status === 'tax-phase' ? (
        <TaxPhase
          gameState={gameState}
          playerInfo={playerInfo}
          playerHand={playerHand}
          socket={socket}
          gameId={playerInfo.gameId}
          onLeaveGame={handleLeaveGame}
        />
      ) : gameState && gameState.status === 'revolution-check' ? (
        <RevolutionPhase
          gameState={gameState}
          playerInfo={playerInfo}
          playerHand={playerHand}
          socket={socket}
          gameId={playerInfo.gameId}
          onLeaveGame={handleLeaveGame}
        />
      ) : gameState && (gameState.status === 'round-finished' || gameState.status === 'game-finished' || showRestartJoinResult) ? (
        <RoundResult 
          gameState={gameState}
          playerInfo={playerInfo}
          socket={socket}
          onLeaveGame={handleLeaveGame}
        />
      ) : (
        <GameBoard 
          gameState={gameState} 
          playerInfo={playerInfo}
          playerHand={playerHand}
          onPlayCards={handlePlayCards}
          onLeaveGame={handleLeaveGame}
        />
      )}
    </div>
  );
}

export default App;
