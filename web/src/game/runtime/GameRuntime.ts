import * as THREE from 'three'
import type { BallImpactPayload, MatchStatePayload, PlayerSlot, PaddleTarget } from '../../types/protocol'
import type { RoomSocket } from '../../network/socket'
import { AssetLoader } from '../assets/AssetLoader'

interface Snapshot { receivedAt: number; state: MatchStatePayload }
interface PendingInput { seq: number; target: PaddleTarget }
interface ImpactEffect { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; startedAt: number }

const TABLE_WIDTH = 4.5
const TABLE_LENGTH = 8.1
const TABLE_TOP = 0
const BALL_RADIUS = 0.11
const BALL_DIAMETER = BALL_RADIUS * 2
const NET_HEIGHT = 0.36
const PLAYFIELD_WIDTH = 4.1
const PLAYFIELD_LENGTH = 7.7

export class GameRuntime {
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  private renderer: THREE.WebGLRenderer
  private animationFrame = 0
  private canvas: HTMLCanvasElement
  private socket: RoomSocket
  private localSlot: PlayerSlot
  private localPlayerId: string
  private snapshots: Snapshot[] = []
  private localInputTarget: PaddleTarget
  private localPrediction: PaddleTarget
  private pendingInputs: PendingInput[] = []
  private localPaddle = new THREE.Group()
  private remotePaddle = new THREE.Group()
  private ball = new THREE.Group()
  private ballShadow = new THREE.Mesh()
  private tableRoot = new THREE.Group()
  private tableLines = new THREE.Group()
  private netRoot = new THREE.Group()
  private readonly assetLoader = new AssetLoader()
  private impactEffects: ImpactEffect[] = []
  private trail: THREE.Mesh[] = []
  private trailPositions: THREE.Vector3[] = []
  private readonly trailLength = 10
  private pointerActive = false
  private onState?: (state: MatchStatePayload) => void
  private sequence = 0
  private lastInputAt = 0
  private readonly interpolationDelay = 100

  constructor(canvas: HTMLCanvasElement, socket: RoomSocket, localSlot: PlayerSlot, localPlayerId: string, onState?: (state: MatchStatePayload) => void) {
    this.canvas = canvas; this.socket = socket; this.localSlot = localSlot; this.localPlayerId = localPlayerId; this.onState = onState
    const defaultPosition = localSlot === 'home' ? { x: 0.5, z: 0.8 } : { x: 0.5, z: 0.2 }
    this.localInputTarget = defaultPosition
    this.localPrediction = defaultPosition
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.setClearColor(0x000000, 0)
    // Arka plan YOK: canvas saydam, sitenin CSS rengi görünür. Böylece zeminle
    // sayfa arasında kare/fark oluşamaz. Gölgeler için ShadowMaterial zemin yeter.
    this.scene.background = null
    this.camera.position.set(0, 2.9, 5.6); this.camera.lookAt(0, -0.1, -0.6)
    this.buildScene(); void this.loadAssets(); this.resize(); this.canvas.addEventListener('pointerdown', this.handlePointerDown); this.canvas.addEventListener('pointermove', this.handlePointerMove); this.canvas.addEventListener('pointerup', this.handlePointerUp); this.canvas.addEventListener('pointercancel', this.handlePointerUp); window.addEventListener('resize', this.resize); this.loop()
  }

  private buildScene() {
    this.scene.add(new THREE.HemisphereLight(0xfffdf6, 0x2a4034, 1.05))
    const key = new THREE.DirectionalLight(0xfff5e3, 1.7); key.position.set(3, 7, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.45); fill.position.set(-4, 3, 2); this.scene.add(fill)
    const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH, 0.14, TABLE_LENGTH), new THREE.MeshStandardMaterial({ color: 0x3f8a6e, roughness: 0.72 })); table.position.y = -0.07; table.receiveShadow = true; this.tableRoot.add(table); this.scene.add(this.tableRoot)
    // Beyaz masa çizgileri ayrı grupta: gerçek GLB masa yüklenirse (çizgileri
    // kendinde var) bu grup kaldırılır, placeholder durumda kalır.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf6f4ec })
    const lineY = 0.006
    const edgeThickness = 0.045
    const makeLine = (w: number, l: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, l), lineMat); m.position.set(x, lineY, z); this.tableLines.add(m) }
    makeLine(TABLE_WIDTH - 0.12, edgeThickness, 0, TABLE_LENGTH / 2 - 0.1)
    makeLine(TABLE_WIDTH - 0.12, edgeThickness, 0, -TABLE_LENGTH / 2 + 0.1)
    makeLine(edgeThickness, TABLE_LENGTH - 0.16, -(TABLE_WIDTH / 2 - 0.1), 0)
    makeLine(edgeThickness, TABLE_LENGTH - 0.16, TABLE_WIDTH / 2 - 0.1, 0)
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.008, TABLE_LENGTH - 0.18), lineMat); centerLine.position.y = lineY; this.tableLines.add(centerLine)
    this.scene.add(this.tableLines)
    this.buildNet()
    // Zemin sadece gölge yakalar, rengi yok: sayfayla birebir aynı görünür, kare izi kalmaz.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.16 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.16; floor.receiveShadow = true; this.scene.add(floor)
    this.localPaddle = this.createPaddle(0xe85b3f); this.remotePaddle = this.createPaddle(0x19251e); this.scene.add(this.localPaddle, this.remotePaddle)
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 16), new THREE.MeshStandardMaterial({ color: 0xfbf7ea, roughness: 0.4 })); ballMesh.castShadow = true; this.ball.add(ballMesh); this.scene.add(this.ball)
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), new THREE.MeshBasicMaterial({ color: 0x183126, transparent: true, opacity: 0.28 })); this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = 0.012; this.scene.add(this.ballShadow)
    for (let i = 0; i < this.trailLength; i += 1) {
      const ghost = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_RADIUS * (1 - (i + 1) / (this.trailLength + 2)), 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 * (1 - i / this.trailLength), depthWrite: false }),
      )
      ghost.visible = false
      this.trail.push(ghost); this.scene.add(ghost)
    }
  }

  private buildNet() {
    // Referans: masa genişliğini geçmeyen, alçak file + 2 direk.
    const postMat = new THREE.MeshStandardMaterial({ color: 0x22332a, roughness: 0.6 })
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, NET_HEIGHT + 0.04, 12)
    const postL = new THREE.Mesh(postGeo, postMat); postL.position.set(-TABLE_WIDTH / 2, (NET_HEIGHT + 0.04) / 2, 0); postL.castShadow = true
    const postR = new THREE.Mesh(postGeo, postMat); postR.position.set(TABLE_WIDTH / 2, (NET_HEIGHT + 0.04) / 2, 0); postR.castShadow = true
    const tape = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH + 0.04, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0x2b3f34, roughness: 0.6 })); tape.position.y = NET_HEIGHT
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE_WIDTH, NET_HEIGHT - 0.05, 40, 4),
      new THREE.MeshStandardMaterial({ color: 0x2b3f34, transparent: true, opacity: 0.3, wireframe: true }),
    )
    mesh.position.y = (NET_HEIGHT - 0.05) / 2 + 0.02
    this.netRoot.add(postL, postR, tape, mesh); this.scene.add(this.netRoot)
  }

  private async loadAssets() {
    const assets = await this.assetLoader.load()
    // GLB masa çizgileri kendi içinde var; placeholder çizgi grubunu kaldır.
    if (assets.table) { this.fitModel(this.tableRoot, assets.table, TABLE_WIDTH, TABLE_LENGTH, 0.55, 'top', TABLE_TOP); this.scene.remove(this.tableLines) }
    if (assets.net) this.fitModel(this.netRoot, assets.net, TABLE_WIDTH, 0.5, 0.7, 'bottom', 0.015)
    const homePaddle = assets.paddleHome ?? assets.paddle
    const awayPaddle = assets.paddleAway ?? assets.paddle
    const localPaddle = this.localSlot === 'home' ? homePaddle : awayPaddle
    const remotePaddle = this.localSlot === 'home' ? awayPaddle : homePaddle
    if (localPaddle) this.replacePaddleModel(this.localPaddle, localPaddle)
    if (remotePaddle) this.replacePaddleModel(this.remotePaddle, remotePaddle)
    if (assets.ball) this.replaceModel(this.ball, assets.ball, new THREE.Vector3(BALL_DIAMETER, BALL_DIAMETER, BALL_DIAMETER), 0)
  }

  private replaceModel(root: THREE.Group, model: THREE.Object3D, targetSize: THREE.Vector3, y: number) {
    const bounds = new THREE.Box3().setFromObject(model)
    const sourceSize = bounds.getSize(new THREE.Vector3())
    if (sourceSize.x === 0 || sourceSize.y === 0 || sourceSize.z === 0) return
    const scale = Math.min(targetSize.x / sourceSize.x, targetSize.y / sourceSize.y, targetSize.z / sourceSize.z)
    const center = bounds.getCenter(new THREE.Vector3())
    model.scale.setScalar(scale)
    model.position.set(-center.x * scale, y - center.y * scale, -center.z * scale)
    root.clear()
    root.add(model)
  }

  // GLB modeller taban alanına (X/Z) göre ölçeklenir. Eski min-3-eksen hesabı
  // kalınlık payı (apron/çizgi) yüzünden masayı yarı boyutta, fileyi taşmış
  // gösteriyordu. Y ekseni ayrı çarpanla (yScale) ayarlanır, model üst/alt
  // hizasına göre oturtulur.
  private fitModel(root: THREE.Group, model: THREE.Object3D, targetX: number, targetZ: number, yScale: number, align: 'top' | 'bottom' | 'center', y: number) {
    const bounds = new THREE.Box3().setFromObject(model)
    const sourceSize = bounds.getSize(new THREE.Vector3())
    if (sourceSize.x === 0 || sourceSize.z === 0) return
    const scale = Math.min(targetX / sourceSize.x, targetZ / sourceSize.z)
    model.scale.set(scale, scale * yScale, scale)
    model.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(model)
    const center = fitted.getCenter(new THREE.Vector3())
    let offsetY: number
    if (align === 'top') offsetY = y - fitted.max.y
    else if (align === 'bottom') offsetY = y - fitted.min.y
    else offsetY = y - center.y
    model.position.x -= center.x
    model.position.z -= center.z
    model.position.y += offsetY
    root.clear()
    root.add(model)
  }

  private replacePaddleModel(root: THREE.Group, model: THREE.Object3D) {
    // GLB raket dik gelir (sap yukarıda). Sap aşağı inecek şekilde çevir,
    // yüzü fileye dönük dik tut, hafif öne eğ.
    model.rotation.x = Math.PI - 0.12
    model.updateMatrixWorld(true)
    this.fitModel(root, model, 0.8, 1.0, 1, 'center', 0)
    root.rotation.x = -0.08
  }

  private createPaddle(color: number) {
    // Dik duruş: yuvarlak kafa yukarıda (yüzü kameraya/fileye dönük),
    // sap aşağıda dikey. Grup orijini kafa merkezinin biraz altında.
    const group = new THREE.Group()
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.09, 40), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }))
    head.rotation.x = Math.PI / 2
    head.position.y = 0.29
    head.castShadow = true
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 12, 48), new THREE.MeshStandardMaterial({ color: 0xf3ead6, roughness: 0.5 }))
    rim.position.y = 0.29
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.09), new THREE.MeshStandardMaterial({ color: 0xc39b67, roughness: 0.6 }))
    handle.position.set(0, -0.41, 0)
    handle.castShadow = true
    group.add(head, rim, handle)
    group.rotation.x = -0.08
    return group
  }

  applySnapshot(state: MatchStatePayload) {
    const previous = this.snapshots.at(-1)?.state
    if (previous && state.tick <= previous.tick) return
    this.snapshots.push({ receivedAt: performance.now(), state }); if (this.snapshots.length > 12) this.snapshots.shift(); this.onState?.(state)
    this.reconcileLocalPaddle(state)
  }

  private updatePointer = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect(); const x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0.08, 0.92); const rawZ = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height, 0.08, 0.92); const z = this.localSlot === 'home' ? THREE.MathUtils.clamp(rawZ, 0.54, 0.94) : THREE.MathUtils.clamp(rawZ, 0.06, 0.46)
    this.localInputTarget = { x, z }
    this.localPrediction = this.localInputTarget
    const now = performance.now(); if (now - this.lastInputAt < 33) return; this.lastInputAt = now; this.sequence += 1
    const input = { seq: this.sequence, target: this.localInputTarget }
    this.pendingInputs.push(input)
    this.socket.send({ v: 1, type: 'paddle_move', payload: input })
  }

  private handlePointerDown = (event: PointerEvent) => { this.pointerActive = true; this.canvas.setPointerCapture(event.pointerId); this.updatePointer(event) }
  private handlePointerMove = (event: PointerEvent) => { if (this.pointerActive) this.updatePointer(event) }
  private handlePointerUp = (event: PointerEvent) => { this.pointerActive = false; if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId) }

  private loop = () => { this.animationFrame = requestAnimationFrame(this.loop); this.render(); }
  private render() {
    const renderState = this.sampleSnapshot(performance.now()); if (!renderState) { this.renderer.render(this.scene, this.camera); return }
    const remoteSlot = this.localSlot === 'home' ? 'away' : 'home'; const remoteState = renderState.paddles[remoteSlot]
    this.localPaddle.position.lerp(this.toWorldPaddle(this.localPrediction, this.localSlot), 0.3); if (remoteState) this.remotePaddle.position.lerp(this.toWorldPaddle(remoteState, remoteSlot), 0.22)
    const ballState = renderState.ball; this.ball.position.set(this.toWorldX(ballState.x), this.toWorldBallY(ballState.y), this.toWorldZ(ballState.z)); this.ball.rotation.x += ballState.vz * 0.035; this.ball.rotation.z -= ballState.vx * 0.035; this.ballShadow.position.x = this.ball.position.x; this.ballShadow.position.z = this.ball.position.z; this.ballShadow.scale.setScalar(1.05 - Math.min(ballState.y, 0.7) * 0.55)
    this.updateTrail()
    this.updateImpactEffects(performance.now())
    this.renderer.render(this.scene, this.camera)
  }

  // Top izi: son konumların solan hayaletleri. Hızlı rallide beyaz uçuş çizgisi verir.
  private updateTrail() {
    this.trailPositions.unshift(this.ball.position.clone())
    if (this.trailPositions.length > this.trailLength) this.trailPositions.pop()
    for (let i = 0; i < this.trail.length; i += 1) {
      const ghost = this.trail[i]
      const pos = this.trailPositions[Math.min(i + 1, this.trailPositions.length - 1)]
      if (!pos || this.trailPositions.length < 3) { ghost.visible = false; continue }
      ghost.visible = true
      ghost.position.copy(pos)
    }
  }

  playBounceEffect(impact: BallImpactPayload) {
    const material = new THREE.MeshBasicMaterial({ color: 0xf4ead5, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 32), material)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(this.toWorldX(impact.x), 0.016, this.toWorldZ(impact.z))
    this.scene.add(ring)
    this.impactEffects.push({ mesh: ring, material, startedAt: performance.now() })
  }

  private updateImpactEffects(now: number) {
    this.impactEffects = this.impactEffects.filter((effect) => {
      const progress = (now - effect.startedAt) / 520
      if (progress >= 1) { this.scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.material.dispose(); return false }
      effect.mesh.scale.setScalar(1 + progress * 3.4)
      effect.material.opacity = 0.72 * (1 - progress)
      return true
    })
  }

  private reconcileLocalPaddle(state: MatchStatePayload) {
    const authoritative = state.paddles[this.localSlot]
    if (!authoritative) return
    const acknowledged = state.lastProcessedInput[this.localPlayerId] ?? 0
    this.pendingInputs = this.pendingInputs.filter((input) => input.seq > acknowledged)
    let predicted = authoritative
    for (const input of this.pendingInputs) {
      predicted = {
        x: moveToward(predicted.x, input.target.x, 0.08),
        z: moveToward(predicted.z, input.target.z, 0.08),
      }
    }
    this.localPrediction = predicted
  }

  private sampleSnapshot(now: number): MatchStatePayload | null {
    if (this.snapshots.length === 0) return null
    if (this.snapshots.length === 1) return this.snapshots[0].state
    const targetTime = now - this.interpolationDelay
    let older = this.snapshots[0]
    for (let index = 1; index < this.snapshots.length; index += 1) {
      const newer = this.snapshots[index]
      if (newer.receivedAt >= targetTime) {
        const span = newer.receivedAt - older.receivedAt
        const alpha = span <= 0 ? 1 : THREE.MathUtils.clamp((targetTime - older.receivedAt) / span, 0, 1)
        return this.interpolate(older.state, newer.state, alpha)
      }
      older = newer
    }
    return older.state
  }

  private interpolate(from: MatchStatePayload, to: MatchStatePayload, alpha: number): MatchStatePayload {
    const lerp = (a: number, b: number) => THREE.MathUtils.lerp(a, b, alpha)
    const paddle = (slot: PlayerSlot): PaddleTarget => ({ x: lerp(from.paddles[slot].x, to.paddles[slot].x), z: lerp(from.paddles[slot].z, to.paddles[slot].z) })
    return {
      ...to,
      ball: {
        x: lerp(from.ball.x, to.ball.x), y: lerp(from.ball.y, to.ball.y), z: lerp(from.ball.z, to.ball.z),
        vx: to.ball.vx, vy: to.ball.vy, vz: to.ball.vz,
      },
      paddles: { home: paddle('home'), away: paddle('away') },
    }
  }

  private toWorldX(value: number) { return (value - 0.5) * PLAYFIELD_WIDTH }
  private toWorldZ(value: number) { return (value - 0.5) * PLAYFIELD_LENGTH }
  private toWorldBallY(value: number) { return TABLE_TOP + BALL_RADIUS + Math.max(0, (value - 0.08) * 2.45) }
  private toWorldPaddle(target: PaddleTarget, slot: PlayerSlot) {
    // Dik raket: sap masaya değmesin diye kafa merkezi yukarıda yüzer.
    const y = slot === 'home' ? 0.76 : 0.8
    return new THREE.Vector3(this.toWorldX(target.x), y, this.toWorldZ(target.z))
  }
  private resize = () => { const width = this.canvas.clientWidth || 1; const height = this.canvas.clientHeight || 1; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false) }
  dispose() { cancelAnimationFrame(this.animationFrame); this.canvas.removeEventListener('pointerdown', this.handlePointerDown); this.canvas.removeEventListener('pointermove', this.handlePointerMove); this.canvas.removeEventListener('pointerup', this.handlePointerUp); this.canvas.removeEventListener('pointercancel', this.handlePointerUp); window.removeEventListener('resize', this.resize); this.impactEffects.forEach((effect) => { this.scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.material.dispose() }); this.trail.forEach((ghost) => { this.scene.remove(ghost); ghost.geometry.dispose(); const mat = ghost.material as THREE.Material; mat.dispose() }); this.trailPositions = []; this.renderer.dispose() }
}

function moveToward(current: number, target: number, step: number) {
  const delta = target - current
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}
