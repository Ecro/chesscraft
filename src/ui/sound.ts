import type { Settings } from './settings'

/**
 * Sound and haptics (ADR-023).
 *
 * Every effect is synthesized at call time from an oscillator and an envelope —
 * no binary assets, so no licensing, no asset pipeline, and nothing to download.
 * The trade the ADR accepted is a ceiling on perceived quality; replacing this
 * with sampled audio later is a swap behind `AudioBackend`, not a rewrite.
 *
 * The split that matters for testing: `synthFor` is a pure table and `play` is
 * a pure decision, with the only impure part — actually making a noise — behind
 * an injected backend. That is what lets a test assert SILENCE when sound is
 * off, rather than asserting that a mute flag was read somewhere.
 */

export const SOUND_EVENTS = ['move', 'capture', 'draft', 'undo', 'illegal', 'win', 'draw', 'card'] as const
export type SoundEvent = (typeof SOUND_EVENTS)[number]

export interface SynthSpec {
  /** Hz. */
  frequency: number
  durationMs: number
  type: OscillatorType
  /** Peak gain, 0..1 — kept low; this plays over a shared phone speaker. */
  gain: number
}

const TABLE: Record<SoundEvent, SynthSpec> = {
  // A short, dry click. It fires on most actions, so anything with a tail
  // becomes noise within three moves.
  move: { frequency: 440, durationMs: 55, type: 'triangle', gain: 0.16 },
  // Lower and slightly longer — a capture should feel heavier than a step
  // without being an event in itself.
  capture: { frequency: 220, durationMs: 110, type: 'square', gain: 0.2 },
  draft: { frequency: 660, durationMs: 90, type: 'sine', gain: 0.18 },
  undo: { frequency: 330, durationMs: 70, type: 'sine', gain: 0.14 },
  // Deliberately unmusical: the one sound whose job is to say "no".
  illegal: { frequency: 150, durationMs: 130, type: 'sawtooth', gain: 0.15 },
  win: { frequency: 880, durationMs: 320, type: 'sine', gain: 0.22 },
  // Lower and flatter than a win. A draw ending like a victory told both
  // players the wrong thing about the match they had just played.
  draw: { frequency: 392, durationMs: 300, type: 'sine', gain: 0.18 },
  // Higher and brighter than a move, and longer than one, because a card is
  // the rarer thing and the banner it accompanies is asking to be looked at.
  // Still short: a card can be played every turn, and a tail would be noise by
  // the third one — the same constraint that keeps `move` dry.
  card: { frequency: 740, durationMs: 130, type: 'triangle', gain: 0.19 },
}

/** Haptic pulse lengths, ms. Absent means this event does not buzz. */
const BUZZ: Partial<Record<SoundEvent, number>> = {
  move: 8,
  capture: 18,
  draft: 12,
  illegal: 24,
  win: 40,
  draw: 30,
  // Between a move and a capture: felt, but not the heaviest thing a turn can do.
  card: 14,
}

export function synthFor(event: SoundEvent): SynthSpec {
  return TABLE[event]
}

/**
 * Whether this platform can buzz at all.
 *
 * iOS Safari has no `navigator.vibrate` (ADR-023's own consequence), so the
 * toggle has to reflect what the device can do rather than what the app would
 * like it to do — a switch that promises a buzz and delivers nothing is worse
 * than no switch.
 */
export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export interface AudioBackend {
  tone: (event: SoundEvent, spec: SynthSpec) => void
}

let shared: AudioContext | null = null

/** The real one. Created lazily — a context made before a user gesture is born suspended. */
export const webAudio: AudioBackend = {
  tone(_event, spec) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      shared ??= new Ctor()
      const ctx = shared
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = spec.type
      osc.frequency.value = spec.frequency
      const now = ctx.currentTime
      const end = now + spec.durationMs / 1000
      gain.gain.setValueAtTime(spec.gain, now)
      // Exponential ramp to near-zero rather than a hard stop: an abrupt cut is
      // a click, and a click on every move is the thing this is trying to avoid.
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now)
      osc.stop(end)
    } catch {
      // An audio context the browser refuses to create, or a tab policy that
      // blocks it. Sound is never worth an exception reaching the board.
    }
  },
}

/**
 * Fire an event's feedback, subject to the player's settings.
 *
 * Sound and haptics are independent: a muted game can still buzz. The backend
 * is injectable so a test can assert what was and was not played.
 */
export function play(event: SoundEvent, settings: Settings, backend: AudioBackend = webAudio): void {
  if (settings.sound) backend.tone(event, TABLE[event])

  const ms = BUZZ[event]
  if (settings.haptics && ms && hapticsSupported()) {
    try {
      navigator.vibrate(ms)
    } catch {
      // Some browsers throw when vibrating without a user gesture.
    }
  }
}
