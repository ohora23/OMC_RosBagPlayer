# OMC RosBag Player

ROS1 rosbag 파일을 WebGL 가속으로 시각화하는 Electron 데스크탑 앱입니다.

## 주요 기능

- **ROS1 bag v2.0 파싱** — C++ 네이티브 애드온으로 LZ4/BZ2 압축 청크 지원
- **메시지 디시리얼라이저** — ROS1 바이너리 포맷 TypeScript 파서 (PointCloud2, Image, LaserScan, Odometry)
- **재생 엔진** — 재생/일시정지/탐색/속도 조절 (0.1x–4x) 상태 머신
- **WebGL 시각화** — Three.js 기반 3D 뷰포트 (개발 중)

## 아키텍처

```
OMC_RosBagPlayer/
├── packages/
│   ├── rosbag-reader/       # C++ N-API 네이티브 애드온 (bag 파싱)
│   ├── message-deserializer/ # TypeScript ROS1 메시지 디코더
│   ├── player-core/          # 재생 엔진 상태 머신
│   ├── renderer/             # Three.js WebGL 렌더러
│   └── ui/                   # React UI 컴포넌트
└── apps/
    └── desktop/              # Electron 앱
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 런타임 | Electron ~30 |
| UI | React + TypeScript |
| 3D 렌더링 | Three.js (WebGL) |
| bag 파싱 | C++17 + Node-API |
| 압축 | LZ4, BZ2 |
| 빌드 | pnpm workspaces + Turborepo |
| 테스트 | Jest + ts-jest |

## 지원 메시지 타입

- `sensor_msgs/PointCloud2` — 3D 포인트 클라우드
- `sensor_msgs/Image` — 카메라 이미지
- `sensor_msgs/LaserScan` — 2D 라이다 스캔
- `nav_msgs/Odometry` — 로봇 위치/자세

## 시작하기

### 사전 요구사항

- Node.js 20+
- pnpm 9+
- CMake 3.15+
- GCC/Clang (C++17)
- liblz4-dev, libbz2-dev

```bash
# Ubuntu/Debian
sudo apt install cmake liblz4-dev libbz2-dev
```

### 설치 및 빌드

```bash
# 저장소 클론
git clone https://github.com/ohora23/OMC_RosBagPlayer.git
cd OMC_RosBagPlayer

# 의존성 설치
pnpm install

# C++ 애드온 빌드
pnpm --filter rosbag-reader exec npx cmake-js build

# TypeScript 빌드
pnpm build
```

### 테스트

```bash
# 전체 테스트
pnpm test

# 패키지별 테스트
pnpm --filter rosbag-reader test
pnpm --filter message-deserializer test
pnpm --filter player-core test
```

## 개발 현황

| PR | 내용 | 상태 |
|----|------|------|
| PR1 | 모노레포 스캐폴드 | ✅ 완료 |
| PR2 | C++ 네이티브 bag 리더 | ✅ 완료 |
| PR2.5 | TypeScript 메시지 디시리얼라이저 | ✅ 완료 |
| PR3 | TypeScript 재생 엔진 | ✅ 완료 |
| PR4 | WebGL 렌더러 (PointCloud2, LaserScan, Odometry) | 🔄 개발 중 |
| PR5 | Image 토픽 렌더러 | ⏳ 예정 |
| PR6 | Electron UI 통합 | ⏳ 예정 |
| PR7 | 성능 최적화 + 크로스 플랫폼 빌드 | ⏳ 예정 |
| PR8 | CI/CD + 릴리스 파이프라인 | ⏳ 예정 |

## 라이선스

MIT
