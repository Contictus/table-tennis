# Table Tennis Multiplayer — Implementasyon Planı

Bu dosya, `architecture.md` içindeki mimari kararların uygulanma sırasını ve
mevcut ilerleme durumunu takip eder. Kaynak mimari kararı `architecture.md`,
uygulama takibi bu dosyadır.

## Ürün kapsamı

Modern desktop browser üzerinde çalışan gerçek zamanlı 1v1 masa tenisi oyunu.
İlk sürüm guest oyuncular, in-memory state ve placeholder Three.js geometrileri
kullanır. Kalıcı veri, database, Redis ve microservice ilk MVP kapsamı dışındadır.

## Sabit teknik kararlar

- Backend: Go, tek servis, net modüller; tam katmanlı modular monolith yok.
- HTTP: standard `net/http`.
- WebSocket: `github.com/coder/websocket`.
- Frontend: React + TypeScript + Vite.
- Render: React’tan bağımsız doğrudan Three.js `GameRuntime`.
- UI state: Zustand.
- UI stilleri: CSS Modules yaklaşımı ve global CSS design tokens.
- UI ikonları: `lucide-react`.
- Multiplayer: server-authoritative WebSocket modeli.
- Protocol: kökteki `protocol/schema/messages.json` tek kaynak.
- Simulation: server 60 Hz fixed timestep; snapshot 30 Hz; client render `requestAnimationFrame`.
- Oyun: ilk 11 sayı; deuce yok; servis her 2 sayıda değişir.
- İlk servis: server tarafında `crypto/rand` ile belirlenir.
- Disconnect: 10 saniye reconnect grace period; dönüş olmazsa maç iptal edilir.
- Asset: ilk prototipte placeholder geometri; Blender asset’leri son aşamada.

## Proje yapısı

```text
table-tennis/
├─ web/
│  ├─ src/
│  │  ├─ app/
│  │  ├─ features/{home,room,match,result}/
│  │  ├─ game/runtime/
│  │  ├─ network/
│  │  ├─ state/
│  │  ├─ shared/{ui,styles}/
│  │  └─ types/
│  └─ package.json
├─ server/
│  ├─ cmd/server/
│  ├─ internal/{game,room,realtime,protocol}/
│  └─ go.mod
├─ protocol/schema/messages.json
├─ architecture.md
└─ implementation-plan.md
```

## Aşamalar ve durum

### Aşama 1 — İskelet ve protocol — Tamamlandı

- [x] Root npm workspace ve ortak komutlar
- [x] Vite + React + TypeScript frontend
- [x] Go server ve `go.mod`
- [x] JSON Schema mesaj kontratı
- [x] Schema’dan TypeScript tip üretimi
- [x] `GET /health`
- [x] Frontend/backend bağımsız çalıştırma

### Aşama 2 — Room ve WebSocket — Tamamlandı

- [x] Room create/join endpoint’leri
- [x] Guest player ID ve session token
- [x] `hello` mesajı ve session authentication
- [x] WebSocket reader/writer ayrımı
- [x] Lobby room state
- [x] Ready mesajı ve iki oyuncu hazır olduğunda başlatma
- [x] Outbound event queue ve slow-client izolasyonu

### Aşama 3 — Match runtime — MVP baseline tamamlandı

- [x] Match state machine
- [x] Match başına command channel ve tek state sahibi goroutine
- [x] 60 Hz fixed timestep loop
- [x] 30 Hz `match_state` snapshot yayını
- [x] Server-side paddle coordinate clamp’i
- [x] Paddle movement step/velocity limiti
- [x] Sequence number ile eski/tekrarlı input reddi

### Aşama 4 — Oyun fiziği — MVP baseline tamamlandı

- [x] Placeholder masa ve file
- [x] Placeholder raket, top ve gölge
- [x] Raket hareketi
- [x] Top hareketi ve yerçekimi
- [x] Masa kenarı ve file yön değişimi
- [x] Raket collision
- [x] Point detection
- [x] Score ve rally
- [x] Otomatik servis başlatma ve iki sayıda servis rotasyonu
- [x] İlk 11 sayıda match end

### Aşama 5 — Client networking — MVP baseline tamamlandı

- [x] Local paddle prediction
- [x] Input sequence tracking
- [x] `lastProcessedInput` ile reconciliation
- [x] Remote paddle snapshot interpolation
- [x] Ball snapshot interpolation
- [x] Snapshot tick ordering kontrolü
- [x] Connecting/connected/reconnecting/disconnected durumu
- [x] Otomatik WebSocket reconnect ve pending input coalescing
- [x] Server disconnect grace period ile uyum

### Aşama 6 — UI ve görsel kalite — Tamamlandı

- [x] Ana ekran
- [x] Oda oluşturma ve odaya katılma
- [x] Lobby ekranı
- [x] Match HUD
- [x] Pause menüsü; multiplayer maç durmaz
- [x] Sonuç ekranı
- [x] CSS design tokens
- [x] Responsive temel düzen
- [x] Ses kontrolü UI’ı
- [x] Hata ve bağlantı durumu göstergeleri
- [x] Help içeriği ve kontrol açıklamaları
- [x] Oyun içi servis/countdown/point-end geri bildirimleri
- [x] Ses efektlerinin runtime event’lerine bağlantısı
- [x] UI component test kapsamının genişletilmesi

### Aşama 7 — Asset entegrasyonu — MVP tamamlandı

- [x] Blender masa modeli
- [x] Blender raket modelleri (home/away)
- [x] File ve top materyalleri
- [x] `.glb` export/import pipeline
- [x] Asset manifest ve model normalizasyonu
- [x] Asset yüklenemezse placeholder fallback
- [x] Kamera, ışık ve gölge entegrasyonu

## Sonraki uygulama sırası

1. Protocol mesajlarının runtime schema validation’ı ve protocol testleri.
2. Room/match concurrency ve disconnect testlerinin genişletilmesi.
3. Gerçek iki-browser Playwright E2E akışı.
4. Bundle split ve Three.js yükleme performansı.
5. Blender asset pipeline ve gerçek model entegrasyonu.

## Test planı

### Go

- Room create/join ve üçüncü oyuncu reddi
- Ready state geçişleri
- Rastgele ilk servis
- İki sayıda servis değişimi
- İlk 11 sayıda match end
- Geçersiz paddle koordinatı ve velocity limiti
- Eski/tekrarlı sequence number
- Collision ve point detection
- Disconnect grace period ve reconnect
- Slow outbound client’ın match loop’u bloke etmemesi

### Protocol

- Geçerli schema mesajları
- Eksik envelope alanları
- Yanlış protocol version
- Geçersiz payload tipleri
- Go struct ve TypeScript tiplerinin schema uyumu

### Frontend

- Home CTA’ları
- Room create/join hata durumları
- Lobby ready state
- Score/rally HUD
- Connection indicator ve reconnect durumu
- Result ekranı
- React UI state ile per-frame game state ayrımı

### E2E

Playwright ile iki ayrı browser context kullanılacak:

1. Oyuncu A oda oluşturur.
2. Oyuncu B odaya katılır.
3. İki oyuncu ready olur.
4. Match başlar.
5. Paddle input server’a ulaşır.
6. İki client aynı skor/rally state’ini görür.
7. Bir client disconnect olur.
8. 10 saniye içinde reconnect denenir.
9. Reconnect olmazsa maç iptal ekranı gösterilir.

## Kabul kriterleri

- İki ayrı browser client aynı odaya bağlanabilmeli.
- Match server tarafından başlatılmalı.
- Her aktif match state’inin tek goroutine/event loop sahibi olmalı.
- Client skor veya sayı kararını belirleyememeli.
- Local paddle gecikmeli hissettirmemeli.
- Remote paddle ve top yumuşak hareket etmeli.
- 60 Hz simulation ve 30 Hz snapshot ayrımı korunmalı.
- Invalid input server tarafından reddedilmeli.
- Slow client server simulation’ı bloke etmemeli.
- Disconnect sonrası state suspended olmalı; 10 saniye sonunda maç iptal edilmeli.
- İlk 11 sayıya ulaşan kazanmalı; servis iki sayıda değişmeli.
- Placeholder geometrilerle oynanabilir prototip çalışmalı.
- React UI ve Three.js runtime bağımsız kalmalı.
- İlk sürüm database, Redis veya microservice gerektirmemeli.

## Doğrulama komutları

```powershell
npm run protocol:generate
npm run test:web
npm run build:web

cd server
go test ./...
```

Son başarılı doğrulamalar: frontend test `1/1`, frontend production build ve
Go test suite başarılıdır. Vite build çıktısında Three.js bundle boyutu için
500 kB üzeri uyarısı vardır; bu hata değildir ve performans aşamasında ele
alınacaktır.
