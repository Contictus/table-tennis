import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type AssetKey = 'table' | 'net' | 'paddle' | 'ball'
type AssetManifest = Partial<Record<AssetKey, string>>
type LoadedAssets = Partial<Record<AssetKey, THREE.Object3D>>

export class AssetLoader {
  private readonly loader = new GLTFLoader()

  async load(): Promise<LoadedAssets> {
    const manifest = await this.readManifest()
    const entries = Object.entries(manifest) as Array<[AssetKey, string]>
    const loaded = await Promise.all(entries.map(async ([key, url]) => [key, await this.loadModel(url)] as const))
    return Object.fromEntries(loaded.filter(([, model]) => model)) as LoadedAssets
  }

  private async readManifest(): Promise<AssetManifest> {
    try {
      const response = await fetch('/assets/manifest.json', { headers: { Accept: 'application/json' } })
      if (!response.ok) return {}
      const data = await response.json() as { assets?: AssetManifest }
      return data.assets ?? {}
    } catch {
      return {}
    }
  }

  private loadModel(url: string): Promise<THREE.Object3D | null> {
    return new Promise((resolve) => {
      this.loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null))
    })
  }
}
