type SoundName = 'match_started' | 'point_ended' | 'match_ended' | 'paddle_hit' | 'ball_bounced'

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

const soundNotes: Record<SoundName, number[]> = {
  match_started: [523.25, 659.25, 783.99],
  point_ended: [392, 523.25],
  match_ended: [659.25, 523.25, 392],
  paddle_hit: [],
  ball_bounced: [],
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

    if (name === 'paddle_hit' || name === 'ball_bounced') {
      this.playImpact(name === 'paddle_hit' ? 0.12 : 0.07)
      return
    }

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

  private playImpact(level: number) {
    if (!this.context) return
    const now = this.context.currentTime
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 0.09, this.context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length)
    const noise = this.context.createBufferSource(); noise.buffer = buffer
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 1250; filter.Q.value = 1.1
    const gain = this.context.createGain(); gain.gain.setValueAtTime(level, now); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
    noise.connect(filter).connect(gain).connect(this.context.destination); noise.start(now); noise.stop(now + 0.1)
    const tone = this.context.createOscillator(); const toneGain = this.context.createGain(); tone.type = 'triangle'; tone.frequency.setValueAtTime(nameFrequency(level), now); tone.frequency.exponentialRampToValueAtTime(90, now + 0.08); toneGain.gain.setValueAtTime(level * 0.6, now); toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08); tone.connect(toneGain).connect(this.context.destination); tone.start(now); tone.stop(now + 0.09)
  }

  dispose() {
    void this.context?.close()
    this.context = null
  }
}

function nameFrequency(level: number) { return level > 0.1 ? 220 : 150 }
