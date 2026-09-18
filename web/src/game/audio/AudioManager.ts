type SoundName = 'match_started' | 'point_ended' | 'match_ended' | 'paddle_hit' | 'ball_bounced'

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext
}

const soundNotes: Record<Exclude<SoundName, 'paddle_hit' | 'ball_bounced'>, number[]> = {
  match_started: [523.25, 659.25, 783.99],
  point_ended: [440, 659.25],
  match_ended: [523.25, 659.25, 783.99, 1046.5],
}

export class AudioManager {
  private context: AudioContext | null = null
  private enabled = true

  setEnabled(enabled: boolean) {
    this.enabled = enabled
  }

  unlock() {
    if (typeof window === 'undefined') return
    const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext
    if (!AudioContextConstructor) return
    this.context ??= new AudioContextConstructor()
    if (this.context.state === 'suspended') {
      void this.context.resume()
    }
  }

  play(name: SoundName) {
    if (!this.enabled || typeof window === 'undefined') return
    this.unlock()
    if (!this.context || this.context.state !== 'running') return

    if (name === 'ball_bounced') {
      this.playBounce()
      return
    }

    if (name === 'paddle_hit') {
      this.playPaddleHit()
      return
    }

    const start = this.context.currentTime
    const notes = soundNotes[name]
    notes.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator()
      const gain = this.context!.createGain()
      const noteStart = start + index * 0.08
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, noteStart)
      gain.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22)
      oscillator.connect(gain).connect(this.context!.destination)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + 0.24)
    })
  }

  // Masaya çarpma sesi: Sert ahşap üstünde plastik topun yüksek perdeli, berrak "TOK!" sesi
  private playBounce() {
    if (!this.context) return
    const now = this.context.currentTime
    const sampleRate = this.context.sampleRate

    // 1. Kısa klik/çıtırtı (Transient click)
    const clickDuration = 0.015
    const clickBuffer = this.context.createBuffer(1, Math.floor(sampleRate * clickDuration), sampleRate)
    const clickData = clickBuffer.getChannelData(0)
    for (let i = 0; i < clickData.length; i += 1) {
      clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.003))
    }
    const clickSource = this.context.createBufferSource()
    clickSource.buffer = clickBuffer
    const clickFilter = this.context.createBiquadFilter()
    clickFilter.type = 'bandpass'
    clickFilter.frequency.value = 2800
    clickFilter.Q.value = 2.0
    const clickGain = this.context.createGain()
    clickGain.gain.setValueAtTime(0.35, now)
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + clickDuration)
    clickSource.connect(clickFilter).connect(clickGain).connect(this.context.destination)
    clickSource.start(now)

    // 2. Ahşap rezonans gövdesi (Wood resonance ping)
    const tone = this.context.createOscillator()
    const toneGain = this.context.createGain()
    tone.type = 'sine'
    const baseFreq = 1100 + (Math.random() * 80 - 40)
    tone.frequency.setValueAtTime(baseFreq, now)
    tone.frequency.exponentialRampToValueAtTime(baseFreq * 0.72, now + 0.045)
    toneGain.gain.setValueAtTime(0.38, now)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
    tone.connect(toneGain).connect(this.context.destination)
    tone.start(now)
    tone.stop(now + 0.055)
  }

  // Rakete çarpma sesi: Kauçuk kaplı tahtaya çarpan topun tok, dolgun ve yaylanan "POCK!" sesi
  private playPaddleHit() {
    if (!this.context) return
    const now = this.context.currentTime
    const sampleRate = this.context.sampleRate

    // 1. Tok darbe sesi (Rubber punch noise)
    const hitDuration = 0.03
    const hitBuffer = this.context.createBuffer(1, Math.floor(sampleRate * hitDuration), sampleRate)
    const hitData = hitBuffer.getChannelData(0)
    for (let i = 0; i < hitData.length; i += 1) {
      hitData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.007))
    }
    const hitSource = this.context.createBufferSource()
    hitSource.buffer = hitBuffer
    const hitFilter = this.context.createBiquadFilter()
    hitFilter.type = 'bandpass'
    hitFilter.frequency.value = 1100
    hitFilter.Q.value = 1.4
    const hitGain = this.context.createGain()
    hitGain.gain.setValueAtTime(0.42, now)
    hitGain.gain.exponentialRampToValueAtTime(0.0001, now + hitDuration)
    hitSource.connect(hitFilter).connect(hitGain).connect(this.context.destination)
    hitSource.start(now)

    // 2. Raket gövdesi dolgun rezonansı (Blade thump)
    const tone = this.context.createOscillator()
    const toneGain = this.context.createGain()
    tone.type = 'triangle'
    const baseFreq = 480 + (Math.random() * 40 - 20)
    tone.frequency.setValueAtTime(baseFreq, now)
    tone.frequency.exponentialRampToValueAtTime(baseFreq * 0.55, now + 0.065)
    toneGain.gain.setValueAtTime(0.46, now)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
    tone.connect(toneGain).connect(this.context.destination)
    tone.start(now)
    tone.stop(now + 0.075)
  }

  dispose() {
    void this.context?.close()
    this.context = null
  }
}
