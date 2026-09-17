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
const BALL_RADIUS = 0.075
const PLAYFIELD_WIDTH = 4.1
const PLAYFIELD_LENGTH = 7.7

export class GameRuntime {
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
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
  private netRoot = new THREE.Group()
  private readonly assetLoader = new AssetLoader()
  private impactEffects: ImpactEffect[] = []
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
    this.camera.position.set(0, 4.2, 5.6); this.camera.lookAt(0, 0, 0)
    this.buildScene(); void this.loadAssets(); this.resize(); this.canvas.addEventListener('pointerdown', this.handlePointerDown); this.canvas.addEventListener('pointermove', this.handlePointerMove); this.canvas.addEventListener('pointerup', this.handlePointerUp); this.canvas.addEventListener('pointercancel', this.handlePointerUp); window.addEventListener('resize', this.resize); this.loop()
  }

  private buildScene() {
    this.scene.add(new THREE.HemisphereLight(0xf4f0e7, 0x263b2e, 2.2))
    const key = new THREE.DirectionalLight(0xfff5e3, 3); key.position.set(3, 7, 4); key.castShadow = true; this.scene.add(key)
    const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH, 0.14, TABLE_LENGTH), new THREE.MeshStandardMaterial({ color: 0x4d9d82, roughness: 0.78 })); table.position.y = -0.07; table.receiveShadow = true; this.tableRoot.add(table); this.scene.add(this.tableRoot)
    const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(TABLE_WIDTH + 0.06, 0.18, TABLE_LENGTH + 0.06)), new THREE.LineBasicMaterial({ color: 0xece9dd })); border.position.y = 0.02; this.scene.add(border)
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, TABLE_LENGTH - 0.18), new THREE.MeshBasicMaterial({ color: 0xece9dd })); centerLine.position.y = 0.012; this.scene.add(centerLine)
    const net = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH + 0.05, 0.52, 0.075), new THREE.MeshStandardMaterial({ color: 0x1b2b22, transparent: true, opacity: 0.8 })); net.position.y = 0.26; this.netRoot.add(net); this.scene.add(this.netRoot)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xf1f0eb, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.12; floor.receiveShadow = true; this.scene.add(floor)
    this.localPaddle = this.createPaddle(0xe85b3f); this.remotePaddle = this.createPaddle(0x19251e); this.scene.add(this.localPaddle, this.remotePaddle)
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf7f3df, roughness: 0.45 })); ballMesh.castShadow = true; this.ball.add(ballMesh); this.scene.add(this.ball)
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), new THREE.MeshBasicMaterial({ color: 0x183126, transparent: true, opacity: 0.24 })); this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = 0.012; this.scene.add(this.ballShadow)
  }

  private async loadAssets() {
    const assets = await this.assetLoader.load()
    if (assets.table) this.replaceModel(this.tableRoot, assets.table, new THREE.Vector3(TABLE_WIDTH, 0.14, TABLE_LENGTH), 0)
    if (assets.net) this.replaceModel(this.netRoot, assets.net, new THREE.Vector3(TABLE_WIDTH + 0.05, 0.52, 0.075), 0.26)
    const homePaddle = assets.paddleHome ?? assets.paddle
    const awayPaddle = assets.paddleAway ?? assets.paddle
    const localPaddle = this.localSlot === 'home' ? homePaddle : awayPaddle
    const remotePaddle = this.localSlot === 'home' ? awayPaddle : homePaddle
    if (localPaddle) this.replacePaddleModel(this.localPaddle, localPaddle)
    if (remotePaddle) this.replacePaddleModel(this.remotePaddle, remotePaddle)
    if (assets.ball) this.replaceModel(this.ball, assets.ball, new THREE.Vector3(0.13, 0.13, 0.13), 0)
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

  private replacePaddleModel(root: THREE.Group, model: THREE.Object3D) {
    // Blender exports Z-up scenes as Y-up GLTF scenes. Rotate the paddle so
    // its face lies over the table and its handle points down the table.
    model.rotation.x = Math.PI / 2
    model.updateMatrixWorld(true)
    this.replaceModel(root, model, new THREE.Vector3(0.56, 0.08, 0.95), 0)
  }

  private createPaddle(color: number) {
    const group = new THREE.Group(); const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 32), new THREE.MeshStandardMaterial({ color, roughness: 0.58 })); head.castShadow = true; const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.55), new THREE.MeshStandardMaterial({ color: 0xc39b67 })); handle.position.z = 0.42; handle.castShadow = true; group.add(head, handle); return group
  }

  applySnapshot(state: MatchStatePayload) {
    const previous = this.snapshots.at(-1)?.state
    if (previous && state.tick <= previous.tick) return
    this.snapshots.push({ receivedAt: performance.now(), state }); if (this.snapshots.length > 12) this.snapshots.shift(); this.onState?.(state)
    this.reconcileLocalPaddle(state)
  }

  private updatePointer = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect(); const x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0.08, 0.92); const rawZ = THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / rect.height, 0.08, 0.92); const z = this.localSlot === 'home' ? THREE.MathUtils.clamp(rawZ, 0.54, 0.94) : THREE.MathUtils.clamp(rawZ, 0.06, 0.46)
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
    this.updateImpactEffects(performance.now())
    this.renderer.render(this.scene, this.camera)
  }

  playBounceEffect(impact: BallImpactPayload) {
    const material = new THREE.MeshBasicMaterial({ color: 0xf4ead5, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.11, 32), material)
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
  private toWorldPaddle(target: PaddleTarget, slot: PlayerSlot) { const vector = new THREE.Vector3(this.toWorldX(target.x), 0.18, this.toWorldZ(target.z)); if (slot === 'away') vector.y = 0.2; return vector }
  private resize = () => { const width = this.canvas.clientWidth || 1; const height = this.canvas.clientHeight || 1; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false) }
  dispose() { cancelAnimationFrame(this.animationFrame); this.canvas.removeEventListener('pointerdown', this.handlePointerDown); this.canvas.removeEventListener('pointermove', this.handlePointerMove); this.canvas.removeEventListener('pointerup', this.handlePointerUp); this.canvas.removeEventListener('pointercancel', this.handlePointerUp); window.removeEventListener('resize', this.resize); this.impactEffects.forEach((effect) => { this.scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.material.dispose() }); this.renderer.dispose() }
}

function moveToward(current: number, target: number, step: number) {
  const delta = target - current
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}
