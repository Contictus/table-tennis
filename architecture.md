# Table Tennis Multiplayer Game — Architecture

## 1. Proje Konusu

Bu proje, görsel referanstaki sade ve stilize masa tenisi deneyimini temel alan,
tarayıcıda çalışan gerçek zamanlı 1v1 multiplayer masa tenisi oyunudur.

Oyuncular bir oda oluşturup başka bir oyuncuyu davet edecek veya bir odaya
katılacaktır. Maç sırasında oyuncular raketlerini mouse, touch veya drag
kontrolüyle hareket ettirecek; top, masa, file ve raketlerle etkileşecektir.

İlk hedef, hızlı ve anlaşılır bir MVP üretmektir. Hesap sistemi, ranking,
turnuva, chat ve kozmetik sistemleri ilk kapsamda değildir.

## 2. Görsel ve Oynanış Referansı

Referans görseldeki ana özellikler:

- Açık krem arka plan
- Perspektifli yeşil masa tenisi masası
- File ve iki raket
- Top ve top gölgesi
- Üst bölümde skor göstergesi
- Rally sayısı
- Ses ve yardım kontrolleri
- Sade, premium ve editorial arayüz

Referans görseldeki `CPU` oyuncusu multiplayer sürümünde gerçek oyuncu ile
değiştirilecektir.

Görsel asset ve 3D model üretimi ilk mimari aşamanın dışındadır. Masa, file,
raket, top, texture ve ışık ayarları oynanabilir temel prototipten sonra
belirlenecektir.

## 3. Mimari Karar

Başlangıçta tam katmanlı bir modular monolith kurulmayacaktır.

Önerilen yapı:

> Net modül sınırlarına sahip, tek Go backend servisi.

Bu kararın nedeni, ilk teknik zorluğun business domain büyüklüğü değil;
gerçek zamanlı iletişim, oyun döngüsü, top/raket fiziği, concurrency ve
senkronizasyondur.

İlk aşamada her modülün içinde ayrıca `domain`, `application` ve
`infrastructure` katmanları oluşturmak gereksiz abstraction ve geliştirme
maliyeti yaratabilir.

İhtiyaç büyürse ilgili modül daha sonra katmanlandırılabilir.

## 4. Alternatiflerin Değerlendirilmesi

### 4.1. Basit oyun sunucusu

```text
server/
├─ cmd/server/
├─ internal/game/
├─ internal/room/
├─ internal/realtime/
└─ internal/protocol/
```

Avantajları:

- Hızlı prototipleme
- Az dosya ve az abstraction
- Oyun döngüsüne odaklanma
- Küçük ekip için daha anlaşılır yapı

Dezavantajları:

- Proje büyüdüğünde bazı dosyalar genişleyebilir
- Katman sınırları başta daha hafif tanımlanır
- Büyük domain özellikleri sonradan ayrıştırılmalıdır

### 4.2. Tam modular layered monolith

```text
match/
├─ domain/
├─ application/
├─ infrastructure/
└─ transport/
```

Avantajları:

- Büyük projelerde bakım ve test kolaylığı
- İş kurallarının transport katmanından ayrılması
- Ranking, hesap, geçmiş ve turnuva gibi özelliklere daha hazır yapı

Dezavantajları:

- MVP için fazla dosya ve abstraction
- Basit işlemler için gereksiz interface kullanımı
- Geliştirme hızını düşürme riski

### 4.3. Seçilen yaklaşım

İlk sürüm için 4.1 yaklaşımı seçilmiştir: basit oyun sunucusu ve net modül
sınırları.

Bu, kodun tamamen tek parça yazılacağı anlamına gelmez. `game`, `room`,
`realtime` ve `protocol` birbirinden ayrılacaktır. Ancak her modül içinde
erken aşamada zorunlu katman hiyerarşisi oluşturulmayacaktır.

## 5. Teknoloji Seçimleri

### 5.1. Frontend

- TypeScript
- React
- Vite
- Three.js
- Zustand
- CSS Modules veya düzenli global CSS
- CSS transitions; gerektiğinde Motion
- Lucide Icons

Sorumluluk dağılımı:

```text
React       → ekranlar, menüler, HUD, modal ve UI state
Three.js    → oyun sahnesi, kamera, masa, top, raket ve ışık
Zustand     → session, UI, skor ve düşük frekanslı match state
GameRuntime → per-frame transform, prediction ve interpolation state
WebSocket   → multiplayer iletişimi
```

React, oyun sahnesindeki her frame'i yönetmeyecektir. Oyun render döngüsü ve
fizik mantığı React component state'lerinden ayrı tutulacaktır.

Per-frame değişen aşağıdaki veriler Zustand içinde tutulmayacaktır:

- Top pozisyonu
- Top hızı
- Local paddle transform
- Remote paddle transform
- Snapshot buffer
- Interpolation state
- Prediction/reconciliation state

Bunlar plain TypeScript nesnesi veya `GameRuntime` benzeri ayrı bir runtime
katmanında tutulacaktır.

Örnek:

```ts
class GameRuntime {
  ball: BallState
  localPaddle: PaddleState
  remotePaddle: PaddleState
  snapshots: Snapshot[]
}
```

Zustand aşağıdaki state'ler için kullanılabilir:

- Bağlantı durumu
- Oda bilgisi
- Oyuncu bilgisi
- Skor
- Rally
- Maç durumu
- Ses ayarı
- UI modal ve menü state'i

### 5.2. Backend

- Go
- HTTP server
- WebSocket
- In-memory room ve match state
- Authoritative server modeli
- Match başına bağımsız game loop

Python da teknik olarak kullanılabilir. FastAPI ve WebSocket ile bu MVP
gerçekleştirilebilir. Ancak Go; eşzamanlı oda yönetimi, gerçek zamanlı oyun
döngüsü, düşük kaynak kullanımı, tek binary deploy ve uzun vadeli bakım
açısından tercih edilmiştir.

Python seçimi ancak hızlı bir prototip veya ekipteki Python deneyimi belirgin
şekilde daha yüksekse alternatif olarak değerlendirilecektir.

### 5.3. İletişim

İlk sürümde WebSocket mesajları JSON olacaktır.

Client input örneği:

```json
{
  "v": 1,
  "type": "paddle_move",
  "payload": {
    "seq": 184,
    "target": {
      "x": 0.42,
      "z": 0.68
    }
  }
}
```

Server state örneği:

```json
{
  "v": 1,
  "type": "match_state",
  "payload": {
    "tick": 3921,
    "lastProcessedInput": 184,
    "ball": {
      "x": 0.51,
      "y": 0.32,
      "z": 0.47
    },
    "paddles": {
      "player": {
        "x": 0.42,
        "z": 0.68
      },
      "opponent": {
        "x": 0.61,
        "z": 0.39
      }
    },
    "score": {
      "player": 3,
      "opponent": 2
    },
    "rally": 7,
    "status": "in_play"
  }
}
```

Protocol envelope:

```text
version
type
payload
```

`seq`, client input sırasını ve reconciliation işlemini takip etmek için
kullanılır.

`tick`, server simulation sırasını, snapshot sıralamasını, interpolation'ı ve
debugging işlemlerini kolaylaştırır.

İleride trafik veya performans gerektirirse MessagePack gibi binary formatlar
değerlendirilebilir. İlk aşamada bunun için erken optimizasyon yapılmayacaktır.

## 6. Authoritative Server Modeli

Sunucu, oyunun gerçek durumunun kaynağı olacaktır.

Sunucu kontrol eder:

- Topun gerçek konumu ve hızı
- Raket hareket sınırları
- Raket hız ve hareket doğrulaması
- Top-raket çarpışması
- Top-masa ve top-file etkileşimi
- Sayı kazanımı
- Rally sayısı
- Servis sırası
- Maçın başlangıç ve bitiş durumu
- Match state machine

İstemci kendi başına skor, sayı, rally veya collision kararı veremez.

İstemci esas olarak oyuncu input'unu gönderir ve sunucudan gelen authoritative
state'i görselleştirir.

## 7. Client Prediction, Interpolation ve Reconciliation

Yalnızca server state'ini bekleyerek render yapmak, internet bağlantısında
raket hareketini hissedilir derecede geciktirebilir.

Bu nedenle client tarafında presentation katmanı bulunacaktır.

### Local paddle

Local paddle hareketi client tarafında input alınır alınmaz görsel olarak
uygulanır.

Aynı input sequence number ile server'a gönderilir.

Server input'u doğrular ve authoritative paddle state üretir.

Client authoritative state geldiğinde kendi tahmini ile server state arasındaki
küçük farkları düzeltir.

Bu işleme reconciliation denir.

### Remote paddle

Rakip raket doğrudan son snapshot pozisyonuna atlatılmayacaktır.

Client, yakın iki server snapshot'ı arasında interpolation yapacaktır.

### Ball

Top server authoritative olacaktır.

Client topu snapshot buffer üzerinden interpolation ile render edecektir.

Başlangıç modeli:

```text
Local paddle:
client-side prediction + reconciliation

Remote paddle:
snapshot interpolation

Ball:
server authoritative + snapshot interpolation

Score / rules:
server only
```

## 8. Server Tick ve Snapshot Modeli

Server-side fizik fixed timestep kullanacaktır.

Başlangıç hedefi:

```text
Simulation tick:
60 Hz

Network snapshot:
20–30 Hz

Client render:
requestAnimationFrame
```

Simulation tick sabit tutulacaktır.

Örnek:

```go
const tickRate = 60

dt := time.Second / tickRate
```

Simulation tick ile network snapshot frekansının aynı olması zorunlu değildir.

Server 60 Hz fizik çalıştırırken istemcilere 20–30 Hz snapshot gönderebilir.

İleride benchmark ve oynanış testi sonucunda 120 Hz simulation değerlendirilebilir.

## 9. Match Concurrency Modeli

Her aktif maç kendi logical state owner'ına sahip olacaktır.

Önerilen model:

```text
WebSocket reader
      │
      ▼
 PlayerCommand
      │
      ▼
┌─────────────────┐
│ Match goroutine │
│                 │
│ input queue     │
│ physics tick    │
│ rules           │
│ state           │
└───────┬─────────┘
        │
        ▼
    snapshots
     │      │
 Player A Player B
```

Her aktif match için ayrı bir goroutine veya aynı mantığı sağlayan tek-owner
event loop kullanılacaktır.

`realtime` katmanı doğrudan `game.State` değiştirmeyecektir.

Örnek:

```go
type Match struct {
    commands chan Command
    state    State
}
```

WebSocket reader'ları yalnızca validated command üretip match command queue'ya
iletecektir.

Bu model, state değişikliklerinin farklı goroutine'lerden dağınık şekilde
yapılmasını ve gereksiz mutex kullanımını engeller.

## 10. Input Doğrulama

Authoritative server yalnızca koordinatı clamp etmeyecektir.

Client input'u aşağıdaki kontrollerden geçmelidir:

- Geçerli koordinat aralığı
- Player ownership
- Match state
- Sequence ordering
- Maksimum paddle velocity
- Maksimum paddle acceleration
- Input frequency / rate
- Geçersiz veya aşırı eski input'ların reddedilmesi

Client mesajı mümkün olduğunca:

```text
"paddle şu pozisyonda"
```

yerine:

```text
"paddle'ı şu target'a hareket ettirmek istiyorum"
```

anlamında değerlendirilmelidir.

Server gerçek hareket sonucunu authoritative olarak üretmelidir.

## 11. Fizik ve Coordinate System

Coordinate system implementasyon başlamadan önce sabitlenecektir.

Önerilen sistem:

```text
X → masa genişliği
Y → yükseklik
Z → masa uzunluğu
```

Game protocol ve Three.js aynı coordinate convention'ı kullanmalıdır.

Top hızlı hareket ettiği için yalnızca frame sonunda bounding box intersection
kontrolü yeterli olmayabilir.

Aşağıdaki durum oluşabilir:

```text
tick N:
top paddle önünde

tick N+1:
top paddle arkasında
```

ve collision atlanabilir.

Bu problem `tunneling` olarak adlandırılır.

Top için gerektiğinde swept collision veya continuous collision detection
yaklaşımı kullanılacaktır.

İlk fizik sistemi mümkün olduğunca deterministik ve basit tutulacaktır.

## 12. Match State Machine

Match state açık şekilde tanımlanacaktır.

Başlangıç state'leri:

```text
waiting
   ↓
ready
   ↓
countdown
   ↓
serving
   ↓
in_play
   ↓
point_end
   ├─ serving
   └─ match_end
```

Connection state, match state'ten ayrı tutulabilir.

Örneğin:

```text
connected
reconnecting
disconnected
```

Bu ayrım, gameplay state ile network state'in birbirine karışmasını engeller.

## 13. Backend Modülleri

```text
server/
├─ cmd/
│  └─ server/
│     └─ main.go
├─ internal/
│  ├─ game/
│  │  ├─ match.go
│  │  ├─ state.go
│  │  ├─ physics.go
│  │  ├─ rules.go
│  │  └─ loop.go
│  ├─ room/
│  │  ├─ manager.go
│  │  └─ room.go
│  ├─ realtime/
│  │  ├─ client.go
│  │  ├─ hub.go
│  │  └─ websocket.go
│  └─ protocol/
│     ├─ client.go
│     └─ server.go
└─ go.mod
```

### `game`

- Maç state'i
- Match loop
- Physics simulation
- Top/raket collision
- Oyun kuralları
- Skor
- Rally
- Servis sırası
- Kazanma koşulu
- Match state machine

### `room`

- Oda oluşturma
- Odaya katılma
- Oyuncu ayrılması
- Ready durumu
- Oda yaşam döngüsü
- Match oluşturma

### `realtime`

- WebSocket bağlantısı
- Reader/writer goroutine'leri
- Mesaj alma ve gönderme
- Ping/pong
- Bağlantı kopması
- Yeniden bağlanma
- Oyuncu-connection eşlemesi
- Outbound message buffering
- Snapshot backpressure yönetimi

### `protocol`

- Client command mesajları
- Server event mesajları
- Snapshot mesajları
- Ortak enum ve payload tipleri
- Protokol versiyonu

## 14. WebSocket Connection ve Backpressure Modeli

Her WebSocket connection için okuma ve yazma sorumlulukları ayrılacaktır.

Önerilen yapı:

```text
WebSocket connection
├─ reader goroutine
└─ writer goroutine
```

Writer tarafı buffered outbound channel kullanacaktır.

Match loop doğrudan socket'e yazmayacaktır.

```text
Match
  │
  ├─ snapshot → Player A outbound queue → writer
  └─ snapshot → Player B outbound queue → writer
```

Yavaş client'ın match simulation loop'unu bloke etmesine izin verilmemelidir.

Snapshot mesajları state tabanlıdır. Client geride kalırsa bazı eski
snapshot'ların drop veya coalesce edilmesi kabul edilebilir.

Örneğin:

```text
snapshot 481
snapshot 482
snapshot 483
```

henüz gönderilmediyse client için yalnızca en güncel snapshot'ın gönderilmesi
tercih edilebilir.

Aşağıdaki mesajlar ise event olarak değerlendirilmelidir ve snapshot gibi
sessizce düşürülmemelidir:

- `match_started`
- `score_changed`
- `point_ended`
- `match_ended`
- `player_disconnected`
- `player_reconnected`

## 15. Room API ve Realtime Transport

Room lifecycle işlemleri ile gameplay realtime trafiği ayrılacaktır.

Başlangıç HTTP API:

```text
POST /rooms
POST /rooms/{code}/join
GET  /health
```

Realtime:

```text
WS /ws
```

Örnek room oluşturma response'u:

```json
{
  "roomCode": "K7PQ2",
  "playerToken": "..."
}
```

WebSocket bağlantısı room ve player identity bilgisi ile ilişkilendirilecektir.

Room oluşturma ve join işlemlerini HTTP üzerinden yapmak zorunlu değildir,
ancak başlangıç mimarisi için gameplay WebSocket trafiğini room lifecycle'dan
ayırdığı için tercih edilir.

## 16. Frontend Modülleri

```text
web/src/
├─ app/
├─ features/
│  ├─ home/
│  ├─ room/
│  ├─ match/
│  └─ result/
├─ game/
│  ├─ scene/
│  ├─ input/
│  ├─ camera/
│  ├─ runtime/
│  ├─ interpolation/
│  └─ presentation/
├─ shared/
│  ├─ ui/
│  ├─ styles/
│  └─ icons/
├─ state/
└─ network/
```

State ayrımı:

```text
UI / app state:
- Modal açık mı?
- Ses açık mı?
- Bağlantı durumu
- Oda bilgisi
- Skor
- Rally
- Match status

Per-frame runtime state:
- Top transform
- Raket transform
- Snapshot buffer
- Prediction state
- Interpolation state
```

Per-frame game state React component state'lerine veya Zustand store'a
dağılmayacaktır.

## 17. Reconnect Politikası

Socket bağlantısının kopması oyuncu identity'sini yok etmemelidir.

Guest oyuncu için server-generated session veya reconnect token kullanılabilir.

Örnek:

```text
guest_id
session_token
room_id
player_slot
```

MVP reconnect politikası:

```text
Player disconnect
      ↓
match temporarily suspended
      ↓
grace period
      │
      ├─ reconnect → resume
      └─ timeout   → match termination
```

Başlangıç grace period değeri 10–15 saniye aralığında değerlendirilebilir.

Kesin davranış implementasyon öncesi netleştirilecektir:

- Rakip otomatik kazanır
- Match cancelled sayılır
- Lobby'ye dönülür

## 18. Pause Kararı

Gerçek gameplay pause özelliği ilk multiplayer MVP'de bulunmayacaktır.

Bir oyuncunun tek taraflı olarak authoritative match loop'u durdurmasına izin
verilmemelidir.

UI menüsü açılabilir ancak match devam eder.

İleride gerçek pause istenirse iki taraflı protokol tanımlanabilir:

```text
pause_request
pause_accept
pause_reject
resume
```

## 19. İlk Ekranlar

### Ana ekran

- Logo
- Play Online
- Create Room
- Join Room
- Ses ayarı
- Yardım

### Lobby

- Oda kodu
- Oyuncu listesi
- Bağlantı durumu
- Ready kontrolü

### Maç ekranı

- Ortada oyun sahnesi
- Üstte skor
- Rally göstergesi
- Bağlantı göstergesi
- Ses ve yardım kontrolleri

### Sonuç ekranı

- Kazanan
- Final skor
- Rally bilgisi
- Play Again
- Back to Home

## 20. MVP Kapsamı

İlk sürümde bulunacaklar:

- Guest oyuncu kimliği
- Oda oluşturma
- Odaya katılma
- İki oyunculu maç
- Server-side fixed timestep game loop
- Basit top ve raket fiziği
- Local paddle prediction
- Remote paddle interpolation
- Ball snapshot interpolation
- Skor
- Rally sayısı
- Maç sonucu
- Bağlantı kopması için temel reconnect state'i

İlk sürümde bulunmayacaklar:

- Kullanıcı hesabı
- Ranking
- Turnuva
- Chat
- Maç geçmişi
- Kozmetik raketler
- Ödeme
- Mobil native uygulama
- Gelişmiş matchmaking
- Multiplayer pause negotiation

## 21. Veri ve Deploy Kararı

İlk MVP'de kalıcı veritabanı zorunlu değildir.

Oda ve maç durumu bellekte tutulabilir.

Bu yaklaşım tek backend instance için yeterlidir.

Şu özellikler geldiğinde PostgreSQL eklenebilir:

- Kullanıcı hesabı
- Profil
- Maç geçmişi
- Ranking
- İstatistikler

Birden fazla backend instance aynı aktif room veya match state'ini paylaşmak
zorunda kaldığında in-memory mimari tekrar değerlendirilecektir.

Redis, queue ve microservice mimarisi ilk aşamada kullanılmayacaktır.

Bunlar ancak gerçek ölçek veya gözlemlenebilir bir ihtiyaç oluşursa
değerlendirilecektir.

## 22. Mimari Kabul Kriterleri

- Frontend ve backend ayrı çalıştırılabilir olmalı.
- Backend tek servis olarak deploy edilebilmeli.
- Oyun kuralları WebSocket handler içine gömülmemeli.
- React component'leri oyun fiziğinin sahibi olmamalı.
- Per-frame transform state Zustand veya React state içine dağıtılmamalı.
- Skor ve sayı kararını yalnızca authoritative server vermeli.
- Her aktif match state'inin tek bir logical owner'ı olmalı.
- WebSocket handler'ları oyun state'ini doğrudan mutate etmemeli.
- Simulation fixed timestep ile çalışmalı.
- Network snapshot frekansı simulation tick'ten bağımsız olabilmeli.
- Client ve server mesajları açık bir protocol modülünde tanımlanmalı.
- Client input'ları sequence number ile izlenebilmeli.
- Server snapshot'ları tick number içermeli.
- Local paddle prediction ve reconciliation desteklenmeli.
- Remote paddle ve top interpolation ile render edilmeli.
- Yavaş bir client match loop'u bloke etmemeli.
- İlk prototipte gereksiz database, microservice ve ağır abstraction bulunmamalı.
- Bir oyuncu ayrıldığında diğer oyuncuya anlamlı bir oyun durumu gönderilmeli.
- Aynı match state'i iki bağlı oyuncuya tutarlı şekilde iletilmeli.
- Guest identity WebSocket connection ömrüne doğrudan bağlı olmamalı.
- Gameplay ve network connection state birbirinden ayrılmalı.

## 23. Uygulama Sırası

1. Frontend ve backend proje iskeleti
2. Protocol tiplerinin ilk versiyonu
3. HTTP room create/join endpoint'leri
4. WebSocket bağlantısı
5. Reader/writer connection modeli
6. Room oluşturma ve katılma
7. İki oyuncunun bağlantı durumunu gösterme
8. Match state machine
9. Match başına game loop ve command queue
10. Fixed timestep simulation
11. Raket input'u
12. Server-side input validation
13. Snapshot gönderimi
14. Client-side local paddle prediction
15. Remote paddle interpolation
16. Top hareketi ve collision sistemi
17. Ball snapshot interpolation
18. Skor ve rally
19. Disconnect/reconnect flow
20. Sonuç ekranı
21. UI polish ve responsive düzen
22. Ses
23. Görsel asset/model entegrasyonu

## 24. Implementasyon Öncesi Netleştirilecek Konular

Aşağıdaki değerler implementasyon başlamadan önce kesinleştirilecektir:

- Go sürümü
- WebSocket kütüphanesi
- Three.js sürümü
- React sürümü
- Simulation tick rate
- Snapshot rate
- Racket movement limits
- Ball velocity ve acceleration parametreleri
- Collision modeli
- Table coordinate dimensions
- Input rate limit
- Reconnect grace period
- Match win condition
- Service rotation rules
- Protocol message schema
- Error message format
- Room code format
- Player/session token modeli

Bu doküman implementasyon öncesi mimari taslak ve onay belgesidir.

Ana mimari yaklaşım:

> Tek Go backend servisi, match başına authoritative game loop, WebSocket
> realtime communication, client-side prediction/interpolation ve React'tan
> ayrılmış Three.js game runtime.
