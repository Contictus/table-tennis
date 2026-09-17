type SoundName = 'match_started' | 'point_ended' | 'match_ended'

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

const soundNotes: Record<SoundName, number[]> = {
  match_started: [523.25, 659.25, 783.99],
  point_ended: [392, 523.25],
  match_ended: [659.25, 523.25, 392],
}

export class AudioManager {
  private context: AudioContext | null = null
  private enabled = true

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  play(name: SoundName) {
    if (!this.enabled || typeof window === 'undefined') return
    const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (!AudioContextConstructor) return
    this.context ??= new AudioContextConstructor()
    void this.context.resume()

    const start = this.context.currentTime
    soundNotes[name].forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator()
      const gain = this.context!.createGain()
      const noteStart = start + index * 0.08
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.08, noteStart + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22)
      oscillator.connect(gain).connect(this.context!.destination)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + 0.24)
    })
  }

  dispose() {
    void this.context?.close()
    this.context = null
  }
}
