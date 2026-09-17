# Table Tennis Multiplayer

Tarayıcıda çalışan gerçek zamanlı 1v1 masa tenisi MVP'si.

## Stack

- Frontend: React, TypeScript, Vite, Three.js, React Router, Zustand
- UI: CSS Modules yaklaşımı ve CSS design tokens
- Backend: Go, `net/http`, `github.com/coder/websocket`
- State: In-memory room ve match state
- Protocol: JSON WebSocket envelope; kaynak şema `protocol/schema/messages.json`

## Çalıştırma

Backend:

```powershell
cd server
go run ./cmd/server
```

Frontend:

```powershell
npm install
npm run dev:web
```

Frontend varsayılan olarak `http://localhost:5173`, backend `http://localhost:8080`
üzerinde çalışır. Backend portunu değiştirmek için:

```powershell
$env:PORT = "18080"
go run ./cmd/server
```

Frontend API adresi için `VITE_API_URL` kullanılabilir:

```powershell
$env:VITE_API_URL = "http://localhost:18080"
npm --workspace web run dev
```

## Kontroller

- Ana ekrandan oda oluştur veya oda kodu ile katıl.
- İki oyuncu lobby'de `I’m ready` seçtiğinde maç başlar.
- Maçta canvas üzerinde mouse veya touch ile raketi hareket ettir.
- İlk 11 sayı kazanır.
- Servis sahibi her iki sayıda değişir.

## Komutlar

```powershell
npm run protocol:generate
npm run build:web
npm run test:web

cd server
go test ./...
```

`npm run protocol:generate`, JSON Schema'dan TypeScript protocol tiplerini
üretir. İlk MVP'de gerçek Blender asset'leri yerine Three.js placeholder
geometrileri fallback olarak korunur. MVP low-poly `.glb` modelleri
`web/public/assets/` içinde bulunur; final Blender modelleri geldiğinde yolları
`web/public/assets/manifest.json` içinde değiştirmek yeterlidir. Export ayarları
ve desteklenen asset anahtarları `web/public/assets/README.md` içinde açıklanır.
