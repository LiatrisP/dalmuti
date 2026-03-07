# 🎴 Dalmuti - 멀티플레이 카드 게임

웹 기반 실시간 멀티플레이 Dalmuti(달무티) 카드 게임입니다.

## 📋 프로젝트 구조

```
dalmuti/
├── server/              # Node.js Express 백엔드
│   ├── index.js        # 서버 메인 파일
│   └── package.json
├── client/              # React 프론트엔드
│   ├── src/
│   │   ├── App.js
│   │   ├── components/
│   │   │   ├── GameLobby.js     # 게임 로비 화면
│   │   │   └── GameBoard.js     # 게임 진행 화면
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   └── package.json
└── README.md
```

## 🚀 시작하기

### 요구사항
- Node.js 14+ 
- npm 또는 yarn

### 서버 설치 및 실행

1. 서버 폴더로 이동
```bash
cd server
```

2. 의존성 설치
```bash
npm install
```

3. 서버 실행
```bash
npm start
```

서버는 포트 5000에서 실행됩니다.

### 클라이언트 설치 및 실행

1. 클라이언트 폴더로 이동 (새 터미널)
```bash
cd client
```

2. 의존성 설치
```bash
npm install
```

3. 클라이언트 실행
```bash
npm start
```

클라이언트는 자동으로 브라우저에서 http://localhost:3000 을 열어줍니다.

## 🎮 게임 방법

1. **게임 만들기**: "새 게임" 버튼을 클릭하고 닉네임을 입력
2. **게임 참여**: "게임 참여"를 선택하고 게임 코드와 닉네임 입력
3. **게임 시작**: 모든 플레이어가 준비되면 "게임 시작" 버튼 클릭
4. **카드 플레이**: 손패에서 카드를 클릭해 선택하고 "카드 사용" 버튼으로 제출

## ✨ 기능

- ✅ 실시간 멀티플레이 (최대 4명)
- ✅ WebSocket을 이용한 즉시 통신
- ✅ 게임 상태 동기화
- ✅ 손패 관리 및 카드 플레이
- ✅ 플레이어 점수 추적
- ✅ 반응형 UI

## 🛠️ 기술 스택

### 백엔드
- Express.js
- Socket.IO
- Node.js

### 프론트엔드
- React
- Socket.IO-Client
- CSS3

## 📝 개발 팁

### 개발 모드에서 자동 재시작 (서버)
```bash
npm run dev
```

### 빌드 (클라이언트)
```bash
npm run build
```

## 🤝 기여

개선 사항이나 버그 리포트는 환영합니다!

## 📄 라이센스

MIT
