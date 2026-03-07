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

### 환경변수 설정

`client/.env.example`, `server/.env.example`를 참고해서 실제 `.env` 파일을 만들어 주세요.

- `client/.env`
```env
REACT_APP_SOCKET_URL=http://localhost:5000
```

- `server/.env`
```env
PORT=5000
CLIENT_URLS=http://localhost:3000
ALLOW_VERCEL_PREVIEW=true
```

배포 시에는 아래 값을 실제 도메인으로 변경해야 합니다.
- `REACT_APP_SOCKET_URL`: 배포된 Socket 서버 주소
- `CLIENT_URLS`: 프론트 주소들(쉼표 구분)

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

## ☁️ 무료 배포 (Vercel + Render/Railway)

이 프로젝트는 Socket.IO 실시간 연결이 필요하므로 `프론트(Vercel)` + `백엔드(Render/Railway)` 분리 배포를 권장합니다.

### 1) Socket 서버 배포 (Render 또는 Railway)

1. GitHub 저장소 연결
2. 서버 루트 디렉토리를 `server`로 지정
3. Build Command: `npm install`
4. Start Command: `npm start`
5. 환경변수 설정

```env
PORT=5000
CLIENT_URLS=https://<vercel-프로젝트>.vercel.app
ALLOW_VERCEL_PREVIEW=true
```

여러 도메인을 허용하려면 `CLIENT_URLS`를 쉼표로 구분합니다.

```env
CLIENT_URLS=https://<vercel-프로젝트>.vercel.app,https://<커스텀도메인>
```

### 2) 프론트 배포 (Vercel)

1. Vercel에서 GitHub 저장소 Import
2. Root Directory를 `client`로 지정
3. 환경변수 설정

```env
REACT_APP_SOCKET_URL=https://<배포된-백엔드-도메인>
```

4. Deploy 실행

### 3) 배포 후 체크리스트

1. 프론트 접속 후 방 생성 가능
2. 다른 브라우저/기기에서 코드로 참여 가능
3. 공개방 목록이 실시간으로 갱신됨
4. 브라우저 콘솔에 CORS/WebSocket 에러가 없음

## 🤝 기여

개선 사항이나 버그 리포트는 환영합니다!

## 📄 라이센스

MIT
