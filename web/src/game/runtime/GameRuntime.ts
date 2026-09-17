import * as THREE from 'three'
import type { MatchStatePayload, PlayerSlot, PaddleTarget } from '../../types/protocol'
import type { RoomSocket } from '../../network/socket'
import { AssetLoader } from '../assets/AssetLoader'

interface Snapshot { receivedAt: number; state: MatchStatePayload }
interface PendingInput { seq: number; target: PaddleTarget }

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
    this.buildScene(); void this.loadAssets(); this.resize(); this.canvas.addEventListener('pointermove', this.handlePointerMove); window.addEventListener('resize', this.resize); this.loop()
  }

  private buildScene() {
    this.scene.add(new THREE.HemisphereLight(0xf4f0e7, 0x263b2e, 2.2))
    const key = new THREE.DirectionalLight(0xfff5e3, 3); key.position.set(3, 7, 4); key.castShadow = true; this.scene.add(key)
    const table = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.14, 7.2), new THREE.MeshStandardMaterial({ color: 0x4d9d82, roughness: 0.78 })); table.receiveShadow = true; this.tableRoot.add(table); this.scene.add(this.tableRoot)
    const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.56, 0.18, 7.26)), new THREE.LineBasicMaterial({ color: 0xece9dd })); border.position.y = 0.08; this.scene.add(border)
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, 7.05), new THREE.MeshBasicMaterial({ color: 0xece9dd })); centerLine.position.y = 0.09; this.scene.add(centerLine)
    const net = new THREE.Mesh(new THREE.BoxGeometry(4.55, 0.62, 0.075), new THREE.MeshStandardMaterial({ color: 0x1b2b22, transparent: true, opacity: 0.8 })); net.position.y = 0.4; this.netRoot.add(net); this.scene.add(this.netRoot)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0xf1f0eb, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.12; floor.receiveShadow = true; this.scene.add(floor)
    this.localPaddle = this.createPaddle(0xe85b3f); this.remotePaddle = this.createPaddle(0x19251e); this.scene.add(this.localPaddle, this.remotePaddle)
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf7f3df, roughness: 0.45 })); ballMesh.castShadow = true; this.ball.add(ballMesh); this.scene.add(this.ball)
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: 0x183126, transparent: true, opacity: 0.24 })); this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = 0.09; this.scene.add(this.ballShadow)
  }

  private async loadAssets() {
    const assets = await this.assetLoader.load()
    if (assets.table) this.replaceModel(this.tableRoot, assets.table, new THREE.Vector3(4.5, 0.14, 7.2), 0.07)
    if (assets.net) this.replaceModel(this.netRoot, assets.net, new THREE.Vector3(4.55, 0.62, 0.075), 0.4)
    const homePaddle = assets.paddleHome ?? assets.paddle
    const awayPaddle = assets.paddleAway ?? assets.paddle
    if (homePaddle) this.replaceModel(this.localPaddle, homePaddle, new THREE.Vector3(0.96, 0.12, 1.28), 0)
    if (awayPaddle) this.replaceModel(this.remotePaddle, awayPaddle, new THREE.Vector3(0.96, 0.12, 1.28), 0)
    if (assets.ball) this.replaceModel(this.ball, assets.ball, new THREE.Vector3(0.32, 0.32, 0.32), 0)
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

  private createPaddle(color: number) {
    const group = new THREE.Group(); const head = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 32), new THREE.MeshStandardMaterial({ color, roughness: 0.58 })); head.castShadow = true; const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.8), new THREE.MeshStandardMaterial({ color: 0xc39b67 })); handle.position.z = 0.58; handle.castShadow = true; group.add(head, handle); return group
  }

  applySnapshot(state: MatchStatePayload) {
    const previous = this.snapshots.at(-1)?.state
    if (previous && state.tick <= previous.tick) return
    this.snapshots.push({ receivedAt: performance.now(), state }); if (this.snapshots.length > 12) this.snapshots.shift(); this.onState?.(state)
    this.reconcileLocalPaddle(state)
  }

  private handlePointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect(); const x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0.08, 0.92); const z = THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / rect.height, 0.08, 0.92)
    this.localInputTarget = { x, z }
    this.localPrediction = this.localInputTarget
    const now = performance.now(); if (now - this.lastInputAt < 33) return; this.lastInputAt = now; this.sequence += 1
    const input = { seq: this.sequence, target: this.localInputTarget }
    this.pendingInputs.push(input)
    this.socket.send({ v: 1, type: 'paddle_move', payload: input })
  }

  private loop = () => { this.animationFrame = requestAnimationFrame(this.loop); this.render(); }
  private render() {
    const renderState = this.sampleSnapshot(performance.now()); if (!renderState) { this.renderer.render(this.scene, this.camera); return }
    const remoteSlot = this.localSlot === 'home' ? 'away' : 'home'; const remoteState = renderState.paddles[remoteSlot]
    this.localPaddle.position.lerp(this.toWorldPaddle(this.localPrediction, this.localSlot), 0.3); if (remoteState) this.remotePaddle.position.lerp(this.toWorldPaddle(remoteState, remoteSlot), 0.22)
    const ballState = renderState.ball; this.ball.position.set((ballState.x - 0.5) * 4.1, ballState.y * 3.2 + 0.2, (ballState.z - 0.5) * 6.8); this.ballShadow.position.x = this.ball.position.x; this.ballShadow.position.z = this.ball.position.z; this.ballShadow.scale.setScalar(1.15 - Math.min(ballState.y, 0.7) * 0.45)
    this.renderer.render(this.scene, this.camera)
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

  private toWorldPaddle(target: PaddleTarget, slot: PlayerSlot) { const vector = new THREE.Vector3((target.x - 0.5) * 4.1, 0.25, (target.z - 0.5) * 6.8); if (slot === 'away') vector.y = 0.27; return vector }
  private resize = () => { const width = this.canvas.clientWidth || 1; const height = this.canvas.clientHeight || 1; this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false) }
  dispose() { cancelAnimationFrame(this.animationFrame); this.canvas.removeEventListener('pointermove', this.handlePointerMove); window.removeEventListener('resize', this.resize); this.renderer.dispose() }
}

function moveToward(current: number, target: number, step: number) {
  const delta = target - current
  if (Math.abs(delta) <= step) return target
  return current + Math.sign(delta) * step
}
