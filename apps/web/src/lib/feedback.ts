const MUTE_KEY = 'monopay-muted'

export type FeedbackKind = 'tap' | 'success' | 'receive' | 'error'

let context: AudioContext | undefined

function audio(): AudioContext | undefined {
  if (typeof window === 'undefined' || !window.AudioContext) return undefined
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

export function unlockAudio(): void {
  audio()
}

export function isMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1'
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
}

function tone(frequency: number, start: number, duration: number, volume = 0.035): void {
  const ctx = audio()
  if (!ctx) return
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start)
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(ctx.currentTime + start)
  oscillator.stop(ctx.currentTime + start + duration + 0.01)
}

export function playFeedback(kind: FeedbackKind): void {
  if (isMuted()) return

  if (kind === 'tap') {
    tone(520, 0, 0.04, 0.018)
    return
  }
  if (kind === 'success') {
    tone(660, 0, 0.09)
    tone(880, 0.09, 0.12)
    return
  }
  if (kind === 'receive') {
    tone(740, 0, 0.1)
    tone(988, 0.1, 0.14)
    return
  }
  tone(220, 0, 0.12, 0.03)
  tone(180, 0.12, 0.16, 0.025)
}

export function vibrate(pattern: number | number[] = 12): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern)
  }
}

export function feedback(kind: FeedbackKind): void {
  playFeedback(kind)
  if (kind === 'success' || kind === 'receive') vibrate(12)
  if (kind === 'error') vibrate([18, 50, 18])
}
