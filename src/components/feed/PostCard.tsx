import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Link, getRouteApi, useRouter } from '@tanstack/react-router'

// Root-scoped Link for the "open post modal via search param" case — the
// generic Link's search reducer can't resolve __root__'s search schema
// (see NotificationsDrawer.tsx for the same fix applied to useNavigate).
const rootRouteApi = getRouteApi('__root__')
import { Button } from '@/components/ui/Button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toggleLike, getPostLikersFn } from '@/server/actions/Database/services/like.service'
import { deletePost } from '@/server/actions/Database/services/post.service'
import { reportContent } from '@/server/actions/Database/services/moderation.service'
import { toggleSavePostFn } from '@/server/actions/Database/services/savedPost.service'
import { blockUserFn } from '@/server/actions/Database/services/block.service'
import { assignGlobalModeratorFn, getMyGlobalPermissionFn } from '@/server/actions/Database/services/role.service'
import { pinPostFn, unpinPostFn, getMyProfilePermissionFn } from '@/server/actions/Database/services/moderation.service'
import { cn } from '@/lib/utils/cn'
import { formatRelativeTime, formatCount, formatDuration } from '@/lib/utils/format'
import { clientEnv } from '@/lib/env/client-env'
import type { Post, Media, PostAuthor } from '@/lib/entities/Post'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { attachAudioWave } from '@/lib/media/audioWaveWorker'
import { drawWave, bandLevel } from '@/lib/media/audioWaveDraw'
import { ImageLightbox } from '@/components/media/ImageLightbox'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { LoginPromptModal } from '@/components/auth/LoginPromptModal'
import { SharePostSheet } from '@/components/share/SharePostSheet'
import { hasOpenOverlay } from '@/lib/overlay/overlayStack'
import { useOptimisticLike } from '@/lib/hooks/useOptimisticLike'
import { TurnstileWidget } from '@/components/auth/TurnstileWidget'
import { VerifiedBadge } from '@/components/ui/VerifiedBadge'
import { toast } from '@/components/ui/Toast'
import {
  Heart,
  MessageCircle,
  Share2,
  Eye,
  Trash2,
  Flag,
  Bookmark,
  Ban,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  UserCog,
  ShieldCheck,
  ShieldPlus,
  Pin,
  PinOff,
} from 'lucide-react'

// ── Avatar ────────────────────────────────────────────────────
function Avatar({ author }: { author: PostAuthor }) {
  const avatarMedia = author.profile?.avatar
  const initial = (author.name || author.nickname || '?').charAt(0).toUpperCase()

  if (avatarMedia) {
    const url = `${clientEnv.imagekitUrlEndpoint}/tr:w-80,h-80,fo-face,c-at_max,f-avif/${avatarMedia}`
    return (
      <img
        src={url}
        alt={author.name}
        className="w-8 h-8 rounded-full object-cover shadow-sm"
      />
    )
  }

  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-accent-bg text-accent shadow-sm">
      {initial}
    </div>
  )
}

// Shared imperative surface for whichever media slide (video/audio) is
// currently active — lets MediaGrid route keyboard shortcuts (space to
// play/pause, arrows to seek) to the right slide without it knowing
// anything about video vs audio internals.
export interface MediaSlideHandle {
  togglePlay: () => void
  seek: (deltaSeconds: number) => void
}

// ── Themed video slide ──────────────────────────────────────────
// Native <video> with the browser chrome stripped (no `controls`) and a
// custom bar in the app's own palette — a video in the feed should feel
// like part of the post, not an embedded player from somewhere else.
const VideoSlide = forwardRef<MediaSlideHandle, { src: string; poster?: string; isActive: boolean }>(function VideoSlide({ src, poster, isActive }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // Starts muted so the autoplay-on-switch below is actually allowed to run —
  // browsers block autoplay-with-sound outside a user gesture, but always
  // allow a muted autoplay. The existing mute button still lets the viewer
  // turn sound on for whichever slide is currently active.
  const [muted, setMuted] = useState(true)
  // While the user is actively dragging/pressing the seek bar, the displayed
  // position must come from the input itself, not from onTimeUpdate — video
  // playback fires timeupdate many times a second, and with the range's
  // value bound straight to that state, an in-progress seek kept getting
  // overwritten by a stale currentTime before the browser could commit it.
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)

  // Switching to this slide plays it; switching away pauses it — matches
  // the feed's "one thing playing at a time" model.
  //
  // playPromiseRef exists to dodge a real, well-known browser gotcha: calling
  // .pause() while a .play() promise from a moment ago hasn't resolved yet
  // throws "play() request was interrupted by a call to pause()" — and on
  // some browsers that leaves the element in a state where the *next*
  // .play() call silently no-ops, which read exactly like "the video just
  // never starts, seek bar frozen at 0". Waiting for any in-flight play()
  // to settle before pausing avoids the race instead of just swallowing
  // its symptom.
  const playPromiseRef = useRef<Promise<void> | null>(null)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (isActive) {
      const p = v.play()
      playPromiseRef.current = p ?? null
      p?.catch(() => {})
    } else {
      Promise.resolve(playPromiseRef.current).catch(() => {}).finally(() => v.pause())
    }
  }, [isActive])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      // Can race the autoplay-on-switch effect's own in-flight play()
      // promise (see playPromiseRef above) — if this rejects, `playing`
      // never gets an onPlay event to flip it, so the overlay button
      // silently stays wrong with no error surfaced. Reconciling from the
      // element's real `paused` state once the promise settles keeps it
      // honest even when playback didn't actually start.
      v.play().catch(() => setPlaying(!v.paused))
    } else {
      v.pause()
    }
  }

  function seekTo(value: number) {
    setSeekValue(value)
    if (videoRef.current) videoRef.current.currentTime = value
  }

  // Catches metadata that resolved before this component's onLoadedMetadata/
  // onDurationChange handlers were wired up — the browser starts fetching
  // preload="metadata" the moment it parses the server-rendered <video> tag,
  // which can resolve before React finishes hydrating and attaching its
  // handlers, so the native event fires with nothing listening yet. Without
  // this, `duration` state (and therefore the seek bar's max) stays stuck at
  // 0 forever even though the element itself already knows its real length.
  useEffect(() => {
    const v = videoRef.current
    if (v && Number.isFinite(v.duration)) setDuration(v.duration)
  }, [])

  useImperativeHandle(ref, () => ({
    togglePlay,
    seek: (deltaSeconds: number) => {
      const v = videoRef.current
      if (!v) return
      seekTo(Math.min(Math.max(v.currentTime + deltaSeconds, 0), duration || v.duration || 0))
    },
  }), [duration])

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black flex items-center justify-center [&:fullscreen]:[&>video]:object-contain">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-cover"
        preload="metadata"
        playsInline
        muted={muted}
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        // Some MP4/WebM streams (ImageKit-transcoded ones especially) report
        // duration as NaN right at loadedmetadata and only resolve the real
        // value afterward via durationchange — see AudioSlide's identical fix.
        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
        onDurationChange={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
      />

      {!playing && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center" aria-label="Play video">
          <span className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:scale-105">
            <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
          </span>
        </button>
      )}

      <div className="absolute bottom-0 inset-x-0 px-3 pb-2.5 pt-8 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-2.5">
        <button onClick={(e) => { e.stopPropagation(); togglePlay() }} className="text-white shrink-0" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={seeking ? seekValue : currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          onPointerDown={(e) => { e.stopPropagation(); setSeeking(true); setSeekValue(currentTime) }}
          onPointerUp={(e) => { e.stopPropagation(); setSeeking(false) }}
          onClick={(e) => e.stopPropagation()}
          style={{ accentColor: 'var(--brand)' }}
          className="flex-1 h-1 cursor-pointer"
          aria-label="Seek"
        />
        <span className="text-[11px] text-white/90 font-mono tabular-nums shrink-0">
          {formatDuration(seeking ? seekValue : currentTime)} / {formatDuration(duration)}
        </span>
        <button onClick={(e) => { e.stopPropagation(); setMuted((m) => !m) }} className="text-white shrink-0" aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); containerRef.current?.requestFullscreen?.() }}
          className="text-white shrink-0"
          aria-label="Fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
})

// ── Themed audio slide ───────────────────────────────────────────
// Design intent: a calm listening moment where the accent visibly breathes
// with the sound — a real AnalyserNode-driven water-wave background
// reacting to actual playback amplitude, not a decorative loop — rather
// than a bare browser audio bar dropped into a square frame.
const AudioSlide = forwardRef<MediaSlideHandle, { src: string; isActive: boolean }>(function AudioSlide({ src, isActive }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The Web Audio graph (context/source/analyser) is created once per
  // mounted <audio> element and never rebuilt — calling
  // createMediaElementSource twice on the same element throws, so
  // `sourceRef` doubles as the "already wired up" guard.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // See VideoSlide's identical comment — decouples the displayed seek
  // position from onTimeUpdate while the user is actively pressing/dragging.
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)
  const prefersReducedMotion = useReducedMotion()
  // Read by the wave-driving effect below without making `playing` a effect
  // dependency — the effect attaches this canvas to the wave Worker exactly
  // once (transferControlToOffscreen can only ever be called once per
  // canvas element), so it can't re-run every time playback toggles.
  const playingRef = useRef(false)
  useEffect(() => { playingRef.current = playing }, [playing])

  // Deliberately no autoplay-on-switch here, unlike VideoSlide: audio has no
  // silent/muted middle ground the way a muted video does — playing sound
  // the instant a slide scrolls into view (no click, no warning) is exactly
  // the surprise-noise pattern feed UX conventions avoid. Switching away
  // still pauses it, matching the "one thing playing at a time" model.
  useEffect(() => {
    if (!isActive) audioRef.current?.pause()
  }, [isActive])

  // Built lazily on the first play — AudioContext starts (or browsers force
  // it to start) "suspended" outside a user gesture, and togglePlay is
  // always reached via a click/keypress, so this is a safe place to both
  // create and resume it.
  function ensureAudioGraph() {
    const a = audioRef.current
    if (!a || sourceRef.current) return
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 128
    analyser.smoothingTimeConstant = 0.75
    const source = ctx.createMediaElementSource(a)
    // The analyser only taps the signal — it must still be routed to the
    // destination itself, otherwise inserting it silences playback.
    source.connect(analyser)
    analyser.connect(ctx.destination)
    audioCtxRef.current = ctx
    analyserRef.current = analyser
    sourceRef.current = source
  }

  // Release the audio graph when this slide unmounts (e.g. scrolled out of
  // an unmounted post) — an AudioContext left open keeps its audio thread
  // alive for no reason otherwise.
  useEffect(() => {
    return () => {
      sourceRef.current?.disconnect()
      analyserRef.current?.disconnect()
      audioCtxRef.current?.close().catch(() => {})
    }
  }, [])

  function togglePlay() {
    const a = audioRef.current
    if (!a) return
    ensureAudioGraph()
    audioCtxRef.current?.resume()
    if (a.paused) {
      // Unlike VideoSlide's autoplay-on-switch, this play() call is never
      // handed a .catch() elsewhere — if it rejects (a slow AudioContext
      // resume, a transient decode error), the button's `playing` state
      // never gets an onPlay event to flip it, so it silently stays wrong
      // with no error surfaced. Reconciling from the element's real
      // `paused` state once the promise settles keeps the icon honest even
      // when playback didn't actually start.
      a.play().catch(() => setPlaying(!a.paused))
    } else {
      a.pause()
    }
  }

  function seekTo(value: number) {
    setSeekValue(value)
    if (audioRef.current) audioRef.current.currentTime = value
  }

  // See VideoSlide's identical fix: catches duration metadata that resolved
  // before React finished hydrating and attaching onLoadedMetadata/
  // onDurationChange, which otherwise leaves the seek bar's max stuck at 0
  // forever even once the element itself has a real duration.
  useEffect(() => {
    const a = audioRef.current
    if (a && Number.isFinite(a.duration)) setDuration(a.duration)
  }, [])

  useImperativeHandle(ref, () => ({
    togglePlay,
    seek: (deltaSeconds: number) => {
      const a = audioRef.current
      if (!a) return
      seekTo(Math.min(Math.max(a.currentTime + deltaSeconds, 0), duration || a.duration || 0))
    },
  }), [duration])

  // Attaches this canvas to the shared audioWave Worker exactly once on
  // mount — deliberately an empty deps array, not [playing]: canvas.
  // transferControlToOffscreen() can only be called once per canvas element
  // for its whole lifetime, so this can't re-run every play/pause toggle.
  // Whether the wave reacts to real audio or settles to its idle swell is
  // instead driven by playingRef inside the per-frame loop below — pausing
  // just stops fresh analyser data from arriving, and the Worker (or the
  // fallback loop, on browsers without OffscreenCanvas) decays toward the
  // idle baseline on its own once data goes stale.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'currentColor'

    // Reduced motion is captured once here, at mount — same one-shot
    // constraint as above. A visitor toggling their OS motion setting
    // mid-session on this exact slide is an acceptable edge case to miss.
    if (prefersReducedMotion) {
      const ctx2d = canvas.getContext('2d')
      if (!ctx2d) return
      const dpr = window.devicePixelRatio || 1
      const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.round(cssWidth * dpr))
      canvas.height = Math.max(1, Math.round(cssHeight * dpr))
      drawWave(ctx2d, canvas.width, canvas.height, 0, 0, 0, accentColor)
      return
    }

    const dpr = window.devicePixelRatio || 1
    const handle = attachAudioWave(canvas, accentColor)

    if (handle) {
      // Rebound to a fresh, non-nullable const — TS's control-flow narrowing
      // from `if (handle)` doesn't carry into the nested `loop` closure below.
      const waveHandle = handle
      const resizeObserver = new ResizeObserver(() => {
        const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()
        waveHandle.resize(Math.max(1, Math.round(cssWidth * dpr)), Math.max(1, Math.round(cssHeight * dpr)))
      })
      resizeObserver.observe(canvas)

      let rafId: number
      let data: Uint8Array<ArrayBuffer> | null = null
      function loop() {
        rafId = requestAnimationFrame(loop)
        const analyser = analyserRef.current
        // Nothing to report before the audio graph exists (never played
        // yet) — the Worker's instance already starts in its idle mode by
        // default. Once it exists, push every frame regardless of playing
        // state so the Worker's `playing` flag flips promptly in both
        // directions instead of inferring pause from data going stale.
        if (!analyser) return
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount)
        if (playingRef.current) analyser.getByteFrequencyData(data)
        else data.fill(0)
        waveHandle.pushLevels(data, playingRef.current)
      }
      loop()

      return () => {
        cancelAnimationFrame(rafId)
        resizeObserver.disconnect()
        waveHandle.destroy()
      }
    }

    // No Worker/OffscreenCanvas support — draw the identical wave directly
    // on the main thread instead of losing the feature outright.
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    let rafId: number
    // Accumulated clock, not elapsed wall-clock seconds — see drawWave's
    // doc comment for why: recomputing phase as elapsedTime × currentSpeed
    // would rescale the whole animation history every time the audio level
    // (and therefore intended speed) changes, which is constantly once
    // real music plays — the animation would jump to a different phase on
    // every fluctuation instead of continuing smoothly.
    let clock = 0
    let smoothedLevel = 0
    // Eased toward 1 while playing, 0 while paused — drives the crossfade
    // between the two animations in drawWave rather than a hard cut.
    let transition = 0
    let lastFrameTime = performance.now()
    let data: Uint8Array<ArrayBuffer> | null = null
    function loop(now: number) {
      rafId = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000)
      lastFrameTime = now

      const { width: cssWidth, height: cssHeight } = canvas!.getBoundingClientRect()
      const width = Math.max(1, Math.round(cssWidth * dpr))
      const height = Math.max(1, Math.round(cssHeight * dpr))
      if (canvas!.width !== width) canvas!.width = width
      if (canvas!.height !== height) canvas!.height = height

      const analyser = analyserRef.current
      const playing = playingRef.current
      let rawLevel = 0
      if (playing && analyser) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        rawLevel = bandLevel(data)
      }
      smoothedLevel += (rawLevel - smoothedLevel) * 0.15
      transition += ((playing ? 1 : 0) - transition) * Math.min(1, 3.5 * dt)
      const speed = playing ? 0.06 + smoothedLevel * 0.15 : 0.05
      clock += dt * speed
      drawWave(ctx2d!, width, height, clock, smoothedLevel, transition, accentColor)
    }
    loop(performance.now())
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="relative w-full h-full flex flex-col bg-accent-bg">
      <audio
        ref={audioRef}
        src={src}
        // Required once createMediaElementSource() reroutes this element's
        // output through the Web Audio graph: the media is cross-origin
        // (ImageKit CDN), and without this attribute Chrome treats the
        // graph as tainted and silently mutes playback entirely instead of
        // just blocking analyser readback — this is what made audio posts
        // go silent the moment the visualizer was wired in.
        crossOrigin="anonymous"
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        // Some MP3s (VBR-encoded ones especially) report duration as NaN or
        // Infinity right at loadedmetadata and only resolve the real value
        // afterward once the browser has buffered enough to calculate it —
        // durationchange fires again when that happens, which is what was
        // missing before (loadedmetadata alone left duration stuck at 0:00).
        onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
        onDurationChange={(e) => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration) }}
      />

      {/* Primary zone: there's no photo/video frame to look at here, so the
          equalizer itself is the content — filling the card, with the play
          button as the one clear primary action elevated above it. The
          transport strip below is deliberately a separate, lower-emphasis
          tier rather than another block stacked in the same centered column
          (Refactoring UI's core lesson: hierarchy comes from real
          size/weight/placement differences, not uniform centered stacking). */}
      {/* No visible play/pause control here by design — the wave animation
          itself is the indicator (ripples while playing, drifting motes
          while paused), and the whole zone is the tap target. Still a real
          button semantically (role, tabIndex, aria-label, Enter/Space) so
          it stays keyboard- and screen-reader-operable despite having no
          visible affordance. */}
      <div
        role="button"
        tabIndex={0}
        onClick={togglePlay}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          togglePlay()
        }}
        aria-label={playing ? 'Pause' : 'Play'}
        className="relative flex-1 min-h-0 flex items-center justify-center px-8 cursor-pointer"
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      </div>

      {/* Secondary zone: the transport strip, permanently docked to the
          bottom of the card in normal flow — always visible, never fading,
          visually subdued (translucent surface tint + a top hairline)
          relative to the primary content above it. */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 bg-surface/50 backdrop-blur-sm border-t border-accent-border">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={seeking ? seekValue : currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          onPointerDown={() => { setSeeking(true); setSeekValue(currentTime) }}
          onPointerUp={() => setSeeking(false)}
          style={{ accentColor: 'var(--brand)' }}
          className="flex-1 h-1.5 cursor-pointer"
          aria-label="Seek"
        />
        <span className="text-[11px] text-text-s font-mono tabular-nums shrink-0">
          {formatDuration(seeking ? seekValue : currentTime)} / {formatDuration(duration)}
        </span>
      </div>
    </div>
  )
})

// ── Media Grid ────────────────────────────────────────────────
// A single scroll-snap slider spanning every media item in the order they
// were shared — image, video, and audio slides sit side by side in one
// thread instead of being stacked as separate blocks. Native horizontal
// scroll-snap, not a framer-driven carousel: this is the feed's own scroll,
// just gently assisted.
export interface MediaGridHandle {
  next: () => void
  prev: () => void
  /** Space — play/pause whichever slide is currently active (no-op on an image slide). */
  togglePlay: () => void
  /**
   * Arrow key on the active slide: seeks 3s if that slide is video/audio,
   * or changes slides outright if it's an image (nothing to seek). A second
   * press in the SAME direction within 500ms changes slides instead of
   * seeking further — one arrow tap adjusts playback, two in a row means
   * "move on".
   */
  seekOrSlide: (direction: 'left' | 'right') => void
}

// How many seconds one arrow-key press seeks video/audio.
const SEEK_STEP_SECONDS = 3
// How quickly a second same-direction arrow press must follow the first to
// count as "change slides" instead of "seek again".
const DOUBLE_PRESS_WINDOW_MS = 500

const MediaGrid = forwardRef<MediaGridHandle, { media: Media[], mediaQuality?: 'compressed' | 'original' }>(function MediaGrid({ media, mediaQuality = 'compressed' }, ref) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const slideRefs = useRef<Record<number, MediaSlideHandle | null>>({})
  const lastArrowRef = useRef<{ direction: 'left' | 'right'; time: number } | null>(null)

  const scrollToIndex = useCallback((next: number) => {
    const el = scrollerRef.current
    if (!el || next < 0 || next >= media.length) return
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }, [media.length])

  useImperativeHandle(ref, () => ({
    next: () => scrollToIndex(index + 1),
    prev: () => scrollToIndex(index - 1),
    togglePlay: () => slideRefs.current[index]?.togglePlay(),
    seekOrSlide: (direction) => {
      const activeSlide = slideRefs.current[index]
      const now = Date.now()
      const last = lastArrowRef.current
      const isRepeatPress = !!last && last.direction === direction && now - last.time < DOUBLE_PRESS_WINDOW_MS

      // No seekable media on this slide (it's an image) or a deliberate
      // second press in a row — either way, move to the next/previous slide.
      if (!activeSlide || isRepeatPress) {
        lastArrowRef.current = null
        if (direction === 'right') scrollToIndex(index + 1)
        else scrollToIndex(index - 1)
      } else {
        activeSlide.seek(direction === 'right' ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS)
        lastArrowRef.current = { direction, time: now }
      }
    },
  }), [index, scrollToIndex])

  function handleScroll() {
    const el = scrollerRef.current
    if (!el || el.clientWidth === 0) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  if (!media.length) return null

  const IK = clientEnv.imagekitUrlEndpoint
  // The lightbox only ever shows images — it needs its own index within the
  // image-only subset, separate from this slide's position in the full,
  // mixed-type media array.
  const imagePaths = media.filter((m) => m.media_type === 'image').map((m) => m.mediaUrl)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="mt-4 relative rounded-lg overflow-hidden bg-surface border border-border group/slider"
      style={{ aspectRatio: '1 / 1' }}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((m, i) => (
          <div key={m.media_id} className="relative w-full h-full shrink-0 snap-center">
            {m.media_type === 'image' && (
              <div className="relative w-full h-full">
                <ProgressiveImage
                  blurSrc={`${IK}/tr:w-100,bl-10,q-20,c-at_max,f-avif/${m.mediaUrl}`}
                  fullSrc={mediaQuality === 'original'
                    ? `${IK}/${m.mediaUrl}`
                    : `${IK}/tr:w-800,c-at_max,f-avif/${m.mediaUrl}`}
                  fit="contain"
                />
                {/* Dedicated full-preview trigger — the image itself is no
                    longer clickable, only this button opens the lightbox, so
                    a tap on the slide is never mistaken for "open fullscreen". */}
                <button
                  onClick={() => setLightboxIndex(imagePaths.indexOf(m.mediaUrl))}
                  aria-label="View full preview"
                  className="absolute top-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/90 transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:scale-105"
                  style={{ right: '0.75rem' }}
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            )}
            {m.media_type === 'video' && (
              <VideoSlide
                ref={(handle) => { slideRefs.current[i] = handle }}
                src={`${IK}/${m.mediaUrl}`}
                poster={m.thumbnailUrl ? `${IK}/tr:w-800,c-at_max,f-avif/${m.thumbnailUrl}` : undefined}
                isActive={i === index}
              />
            )}
            {m.media_type === 'audio' && (
              <AudioSlide
                ref={(handle) => { slideRefs.current[i] = handle }}
                src={`${IK}/${m.mediaUrl}`}
                isActive={i === index}
              />
            )}
          </div>
        ))}
      </div>

      {media.length > 1 && (
        <>
          {index > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); scrollToIndex(index - 1) }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-80 sm:opacity-0 sm:group-hover/slider:opacity-100 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              aria-label="Previous media"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {index < media.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); scrollToIndex(index + 1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-80 sm:opacity-0 sm:group-hover/slider:opacity-100 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              aria-label="Next media"
            >
              <ChevronRight size={16} />
            </button>
          )}
          {/* top-left, not top-right — the per-image "View full preview"
              button sits at top-3 right-3 on image slides, and this badge
              used to sit directly on top of it. */}
          <div
            className="absolute top-3 px-2 py-0.5 rounded-full bg-black/50 text-white text-[11px] font-medium backdrop-blur-sm pointer-events-none"
            style={{ left: '0.75rem' }}
          >
            {index + 1}/{media.length}
          </div>
          {/* Raised clear of the bottom edge on audio/video slides — those
              have their own transport strip (seek bar + time) docked to the
              card's bottom, and this indicator used to sit right on top of
              it. Image slides have no bottom UI, so it can sit low there. */}
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none",
              media[index]?.media_type === 'image' ? 'bottom-3' : 'bottom-14',
            )}
          >
            {media.map((m, i) => (
              <div
                key={m.media_id}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
                  i === index ? "w-4 bg-brand" : "w-1.5 bg-white/50"
                )}
              />
            ))}
          </div>
        </>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox
          images={imagePaths}
          startIndex={lightboxIndex}
          initialFormat={mediaQuality === 'original' ? 'original' : 'avif'}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </motion.div>
  )
})

function ProgressiveImage({ blurSrc, fullSrc, fit = 'cover' }: { blurSrc: string, fullSrc: string, fit?: 'cover' | 'contain' }) {
  const [status, setStatus] = useState<'skeleton' | 'blur' | 'loaded' | 'error'>('skeleton')
  const blurRef = useRef<HTMLImageElement>(null)
  const fullRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (fullRef.current?.complete) {
      if (fullRef.current.naturalWidth > 0) setStatus('loaded')
      else setStatus('error')
    } else if (blurRef.current?.complete) {
      if (blurRef.current.naturalWidth > 0 && status === 'skeleton') setStatus('blur')
    }
  }, [blurSrc, fullSrc, status])

  return (
    <>
      {(status === 'skeleton' || status === 'error') && (
        <div className="absolute inset-0 bg-surface-translucent animate-pulse flex items-center justify-center">
          {status === 'error' && <span className="text-xs text-text-s">Unavailable</span>}
        </div>
      )}
      <img
        ref={blurRef}
        src={blurSrc}
        alt=""
        loading="lazy"
        className={cn("absolute inset-0 w-full h-full transition-opacity duration-500", fit === 'contain' ? 'object-contain' : 'object-cover', status === 'blur' ? 'opacity-100' : 'opacity-0')}
        onLoad={() => setStatus(prev => prev === 'skeleton' ? 'blur' : prev)}
        onError={() => setStatus('error')}
      />
      <img
        ref={fullRef}
        src={fullSrc}
        alt=""
        loading="lazy"
        className={cn("absolute inset-0 w-full h-full transition-opacity duration-300", fit === 'contain' ? 'object-contain' : 'object-cover', status === 'loaded' ? 'opacity-100' : 'opacity-0')}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </>
  )
}

// ── PostCard ──────────────────────────────────────────────────
export function PostCard({ post, currentUserId, isFocused = false, profileId, isPinned = false }: { post: Post, currentUserId?: string, isFocused?: boolean, profileId?: string, isPinned?: boolean }) {
  const { liked, likes: localLikes, toggle: toggleLikeOptimistic, isPending: likePending } =
    useOptimisticLike(() => toggleLike({ data: { postId: post.postId } }), post.likes)
  const [localShares, setLocalShares] = useState(post.shares)
  const [expanded, setExpanded] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportTurnstileToken, setReportTurnstileToken] = useState<string | undefined>(undefined)
  const queryClient = useQueryClient()
  const articleRef = useRef<HTMLElement>(null)
  const mediaGridRef = useRef<MediaGridHandle>(null)
  const navigate = rootRouteApi.useNavigate()

  // Login prompt for guest users
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [loginPromptAction, setLoginPromptAction] = useState<'like' | 'save' | 'comment' | 'report' | 'generic'>('generic')
  function requireAuth(action: typeof loginPromptAction): boolean {
    if (currentUserId) return true
    setLoginPromptAction(action)
    setShowLoginPrompt(true)
    return false
  }

  const author = post.primaryAuthor
  const isLong = (post.content?.length ?? 0) > 280
  // Aware-intention preference: the author has opted to hide numeric
  // engagement counts on their own posts, for every viewer — same
  // anti-anxiety "hide like counts" pattern Instagram/Twitter both shipped.
  const hideEngagementCounts = author?.profile?.hideEngagementCounts ?? false

  useEffect(() => {
    if (isFocused) articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isFocused])

  const reportMutation = useMutation({
    mutationFn: (data: { reason: string, details?: string }) =>
      reportContent({ data: { targetType: 'post', targetId: post.postId, reason: data.reason, details: data.details, turnstileToken: reportTurnstileToken } }),
    onSuccess: (res) => {
      if (!res.ok) { toast(res.message, { variant: 'danger' }); return }
      setShowReportDialog(false)
      setReportReason('')
      setReportDetails('')
      setReportTurnstileToken(undefined)
      toast('Post reported. Thank you.', { variant: 'success' })
    }
  })

  function handleLike() {
    if (!requireAuth('like')) return
    if (likePending) return
    toggleLikeOptimistic()
  }

  const [showLikersModal, setShowLikersModal] = useState(false)
  const likersQuery = useQuery({
    queryKey: ['postLikers', post.postId],
    queryFn: () => getPostLikersFn({ data: { postId: post.postId } }),
    enabled: showLikersModal,
  })
  const likers = likersQuery.data?.ok ? likersQuery.data.data : []

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(false)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deleteMutation = useMutation({
    mutationFn: () => deletePost({ data: { postId: post.postId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
    onError: () => {
      // The actual server delete only fires after the undo window — if it
      // fails, the post needs to come back, not stay hidden forever.
      setPendingDelete(false)
      toast('Failed to delete post.', { variant: 'danger' })
    }
  })

  function handleDelete() {
    setShowDeleteConfirm(true)
  }

  // Undo window: hides the post immediately (optimistic) but the real
  // server delete is deferred until the toast's timer actually elapses —
  // clicking Undo just clears that timer, nothing is ever sent to the
  // server if the user changes their mind in time.
  function handleConfirmDelete() {
    setShowDeleteConfirm(false)
    setPendingDelete(true)
    toast('Post deleted.', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
          deleteTimerRef.current = null
          setPendingDelete(false)
        },
      },
    })
    deleteTimerRef.current = setTimeout(() => {
      deleteMutation.mutate()
    }, 5000)
  }

  const [saved, setSaved] = useState(false)
  const saveMutation = useMutation({
    mutationFn: () => toggleSavePostFn({ data: { postId: post.postId } }),
    onSuccess: (res) => {
      if (res.ok) setSaved(res.data.saved)
    },
  })

  // Sharing lives in SharePostSheet now — a single button that jumped straight
  // to the OS share sheet hid copy-link entirely and behaved differently on
  // every desktop browser that happens to implement navigator.share.
  const [shareOpen, setShareOpen] = useState(false)

  // Per-post keyboard shortcuts — only the focused card (FeedList tracks
  // which one) listens, so pressing "l" doesn't like every post on screen.
  // Guarded against typing targets so shortcuts don't hijack comment/report
  // text fields. Mutation `.mutate`/navigate function identities are stable
  // across renders, so it's safe to depend on just isFocused here.
  useEffect(() => {
    if (!isFocused) return

    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    }

    function handleKeyDown(e: KeyboardEvent) {
      // An open overlay owns the keyboard. Without this, pressing L or S while
      // the likers modal or share sheet is up still liked/shared the card
      // underneath it, and arrows scrubbed this card's media while the user
      // was paging through the lightbox.
      if (hasOpenOverlay()) return
      if (isTypingTarget(e.target)) return
      // Ctrl/Cmd+C to copy selected text is "c" with no shiftKey — without
      // this guard it was indistinguishable from the "open comments"
      // shortcut, so copying text on a focused post opened the comment
      // view instead. Same reasoning for any other Ctrl/Cmd/Alt combo.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // A non-empty selection means the user is mid text-selection/copy —
      // don't let a plain letter keystroke (extending selection, etc.)
      // trigger an app shortcut underneath it.
      if (window.getSelection()?.toString()) return

      // Arrow keys report the same e.key regardless of layout, so those stay
      // key-based. Letters don't: e.key reflects the CHARACTER the active
      // layout produces (Cyrillic, Arabic, AZERTY, ...), so "l" only matches
      // on layouts that put an "l" there at all. e.code instead reports the
      // PHYSICAL key position using its US-QWERTY name always, regardless of
      // layout or what character it actually types — the same technique
      // games use for WASD — so the shortcut fires from the same physical
      // key everywhere.
      const key = e.key.toLowerCase()
      const code = e.code

      if (key === 'arrowright') { e.preventDefault(); mediaGridRef.current?.seekOrSlide('right') }
      else if (key === 'arrowleft') { e.preventDefault(); mediaGridRef.current?.seekOrSlide('left') }
      else if (code === 'Space') { e.preventDefault(); mediaGridRef.current?.togglePlay() }
      else if ((code === 'KeyL' || code === 'KeyK') && !e.shiftKey) { e.preventDefault(); handleLike() }
      else if (code === 'KeyC' && !e.shiftKey) { e.preventDefault(); navigate({ search: (prev) => ({ ...prev, post: post.postId }) }) }
      else if (code === 'KeyS' && e.shiftKey) { e.preventDefault(); if (requireAuth('save')) saveMutation.mutate() }
      else if (code === 'KeyS' && !e.shiftKey) { e.preventDefault(); setShareOpen(true) }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
    // handleLike/handleShare/navigate/saveMutation are intentionally omitted:
    // they're re-captured whenever this effect re-runs (isFocused/postId/
    // currentUserId cover every input that actually changes their behavior),
    // and re-subscribing on every render would defeat listening only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, post.postId, currentUserId])

  const [blocked, setBlocked] = useState(false)
  const blockMutation = useMutation({
    mutationFn: () => blockUserFn({ data: { targetUserId: author?.userId ?? '' } }),
    onSuccess: (res) => {
      if (res.ok) setBlocked(true)
      else toast(res.message, { variant: 'danger' })
    },
  })

  // Gates the "Make moderator" action. Server-side re-checks this
  // independently — hiding the button is UX only, not the security boundary.
  const permQuery = useQuery({
    queryKey: ['myGlobalPermission'],
    queryFn: () => getMyGlobalPermissionFn(),
    enabled: !!currentUserId && currentUserId !== author?.userId,
  })
  const canAssignModerator = permQuery.data?.authorized && permQuery.data.canAssignModerator
  const canDeleteContent = permQuery.data?.authorized && permQuery.data.canDeleteContent

  const assignModMutation = useMutation({
    mutationFn: (level: 'moderator' | 'senior_moderator') =>
      assignGlobalModeratorFn({ data: { targetUserId: author?.userId ?? '', level } }),
    onSuccess: (res) => {
      toast(res.ok ? `Assigned ${res.data.level.replace('_', ' ')}.` : res.message, { variant: res.ok ? 'success' : 'danger' })
      setUpgradeMenuOpen(false)
    },
  })

  // Pin/unpin — only meaningful in a profile-page context (profileId passed
  // down), not in the general feed. Gates on the profile-scoped permission,
  // distinct from the global canAssignModerator/canDeleteContent above.
  const pinPermQuery = useQuery({
    queryKey: ['myProfilePermission', profileId],
    queryFn: () => getMyProfilePermissionFn({ data: { profileId: profileId! } }),
    enabled: !!profileId && !!currentUserId,
  })
  const canPinPost = pinPermQuery.data?.authorized && pinPermQuery.data.canPinPost
  const router = useRouter()
  const pinMutation = useMutation({
    mutationFn: () => pinPostFn({ data: { postId: post.postId, profileId: profileId! } }),
    onSuccess: (res) => {
      if (!res.ok) { toast(res.message, { variant: 'danger' }); return }
      router.invalidate()
    },
  })
  const unpinMutation = useMutation({
    mutationFn: () => unpinPostFn({ data: { profileId: profileId! } }),
    onSuccess: (res) => {
      if (!res.ok) { toast(res.message, { variant: 'danger' }); return }
      router.invalidate()
    },
  })

  const [upgradeMenuOpen, setUpgradeMenuOpen] = useState(false)
  const upgradeMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (upgradeMenuRef.current && !upgradeMenuRef.current.contains(e.target as Node)) setUpgradeMenuOpen(false)
    }
    if (upgradeMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [upgradeMenuOpen])

  if (pendingDelete) return null

  return (
    <motion.article
      ref={articleRef}
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      className={cn(
        "px-2 pt-4 pb-5 border-b border-border scroll-mt-20",
        isFocused && "bg-accent-bg/40 rounded-lg"
      )}
    >
      {/* Header — everything on one compact line (avatar, name, nickname,
          time all inline) rather than a two-line block, so it reads as a
          byline, not a section competing with the media for vertical space. */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/profile/$nickname" params={{ nickname: author?.nickname || '' }} className="shrink-0 hover:opacity-80 transition-opacity duration-[var(--motion-fast)] ease-[var(--motion-ease)]">
            <Avatar author={author as PostAuthor} />
          </Link>
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap text-[13px] leading-tight">
            <Link to="/profile/$nickname" params={{ nickname: author?.nickname || '' }} className="font-bold text-text-h hover:underline decoration-border underline-offset-4 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] truncate">
              {author?.name ?? 'Unknown'}
            </Link>
            {author?.profile?.isVerified && <VerifiedBadge className="w-3.5 h-3.5 shrink-0" />}
            <span className="text-text-s">@{author?.nickname}</span>
            <span className="text-text-s">·</span>
            <span className="text-text-s hover:underline cursor-pointer transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]">{formatRelativeTime(post.publishedAt)}</span>
            {post.postType === 'collab' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent-bg text-accent uppercase tracking-wide shrink-0">
                Collab
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { if (requireAuth('save')) saveMutation.mutate() }}
            isPending={saveMutation.isPending}
            className="text-text-s hover:text-text-h rounded-full w-7 h-7 p-0 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            title={saved ? 'Unsave post' : 'Save post'}>
            <Bookmark className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} />
          </Button>
          {profileId && (currentUserId === author?.userId || canPinPost) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (isPinned ? unpinMutation.mutate() : pinMutation.mutate())}
              isPending={pinMutation.isPending || unpinMutation.isPending}
              className="text-text-s hover:text-text-h rounded-full w-7 h-7 p-0 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              title={isPinned ? 'Unpin from profile' : 'Pin to profile'}>
              {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </Button>
          )}
          {currentUserId === author?.userId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              isPending={deleteMutation.isPending}
              className="text-text-s hover:text-white hover:bg-danger rounded-full w-7 h-7 p-0 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
              title="Delete post">
              <Trash2 className="w-4 h-4" />
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { if (requireAuth('report')) setShowReportDialog(true) }}
                className="text-text-s hover:text-text-h rounded-full w-7 h-7 p-0 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                title="Report post">
                <Flag className="w-4 h-4" />
              </Button>
              {currentUserId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => blockMutation.mutate()}
                  isPending={blockMutation.isPending}
                  disabled={blocked}
                  className="text-text-s hover:text-text-h rounded-full w-7 h-7 p-0 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                  title={blocked ? 'Blocked' : 'Block user'}>
                  <Ban className="w-4 h-4" />
                </Button>
              )}
              {canDeleteContent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  isPending={deleteMutation.isPending}
                  className="text-text-s hover:text-white hover:bg-danger rounded-full w-7 h-7 p-0 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                  title="Delete post (admin)">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              {canAssignModerator && (
                <div ref={upgradeMenuRef} className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUpgradeMenuOpen((v) => !v)}
                    className="text-brand hover:bg-accent-bg rounded-full w-7 h-7 p-0 transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                    title="Upgrade role"
                    aria-expanded={upgradeMenuOpen}>
                    <UserCog className="w-4 h-4" />
                  </Button>
                  <AnimatePresence>
                    {upgradeMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-52 bg-surface border border-border rounded-lg shadow-md p-1.5 z-20"
                      >
                        <button
                          onClick={() => assignModMutation.mutate('moderator')}
                          disabled={assignModMutation.isPending}
                          className="upgrade-shimmer w-full flex items-center gap-2.5 text-left px-3 py-2 text-sm font-semibold text-text rounded-md hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] disabled:opacity-50"
                        >
                          <ShieldCheck className="w-4 h-4 shrink-0 text-accent" />
                          Make moderator
                        </button>
                        <button
                          onClick={() => assignModMutation.mutate('senior_moderator')}
                          disabled={assignModMutation.isPending}
                          className="upgrade-shimmer w-full flex items-center gap-2.5 text-left px-3 py-2 text-sm font-semibold text-text rounded-md hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] disabled:opacity-50"
                        >
                          <ShieldPlus className="w-4 h-4 shrink-0 text-brand" />
                          Make senior moderator
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* Content */}
      {post.content && (
        <div className="mb-2.5">
          <p className={cn(
            "text-[15px] leading-relaxed text-text whitespace-pre-wrap",
            !expanded && isLong && "line-clamp-4"
          )}>
            {post.content}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-brand font-semibold text-sm mt-1 hover:underline transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Media — the focal point: full-bleed within the post's own
          horizontal padding, no extra chrome competing with it. */}
      <MediaGrid ref={mediaGridRef} media={post.media} mediaQuality={post.media_quality}/>

      {/* Actions */}
      <div className="flex items-center gap-5 mt-2.5 pt-2.5 border-t border-border">
        <div className="flex items-center">
          <button
            onClick={handleLike}
            className={cn(
              "group flex items-center gap-2 text-sm font-semibold transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
              liked ? "text-brand" : "text-text-s hover:text-brand"
            )}
          >
            <div className={cn("p-1.5 rounded-full transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]", liked ? "bg-accent-bg" : "group-hover:bg-accent-bg")}>
              <Heart className="w-4 h-4 transition-transform group-hover:scale-110" fill={liked ? 'currentColor' : 'none'} />
            </div>
          </button>
          {!hideEngagementCounts && localLikes > 0 && (
            <button
              onClick={() => setShowLikersModal(true)}
              className="text-sm font-semibold text-text-s hover:text-brand hover:underline transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
            >
              {formatCount(localLikes)}
            </button>
          )}
        </div>

        <rootRouteApi.Link
          search={(prev) => ({ ...prev, post: post.postId })}
          className="group flex items-center gap-2 text-sm font-semibold text-text-s hover:text-brand transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
        >
          <div className="p-1.5 rounded-full group-hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]">
            <MessageCircle className="w-4 h-4 transition-transform group-hover:scale-110" />
          </div>
          {!hideEngagementCounts && <span>{formatCount(post.comments)}</span>}
        </rootRouteApi.Link>

        <button
          onClick={() => setShareOpen(true)}
          aria-label="Share post"
          aria-haspopup="dialog"
          className="group flex items-center gap-2 text-sm font-semibold text-text-s hover:text-brand transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
        >
          <div className="p-1.5 rounded-full group-hover:bg-accent-bg transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]">
            <Share2 className="w-4 h-4 transition-transform group-hover:scale-110" />
          </div>
          {!hideEngagementCounts && <span>{formatCount(localShares)}</span>}
        </button>

        {!hideEngagementCounts && (
          <div className="flex items-center gap-2 text-sm font-semibold text-text-s ml-auto pointer-events-none">
            <Eye className="w-4 h-4" />
            <span>{formatCount(post.views)}</span>
          </div>
        )}
      </div>

      {/* Report Dialog Overlay */}
      <AnimatePresence>
        {showReportDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Fixed dark scrim (not the swappable bg token — see Modal.tsx for
            // the same fix; bg-bg would render as a light overlay in light mode).
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-surface rounded-lg p-6 w-full max-w-md shadow-md border border-border"
            >
              <h3 className="text-xl font-bold text-text-h mb-2">Report Post</h3>
              <p className="text-sm text-text-s mb-6">Why are you reporting this post?</p>

              <div className="flex flex-col gap-3 mb-6">
                {['Spam', 'Harassment', 'Hate Speech', 'Graphic Content'].map((reason) => (
                  <label key={reason} className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-translucent cursor-pointer border border-transparent has-[:checked]:border-accent-border has-[:checked]:bg-accent-bg transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]">
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason}
                      checked={reportReason === reason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="accent-accent"
                    />
                    <span className="text-[15px] font-medium text-text">{reason}</span>
                  </label>
                ))}
              </div>

              {reportReason && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6 flex flex-col gap-4">
                  <textarea
                    placeholder="Additional details (optional)..."
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg p-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent-border resize-none h-24"
                  />
                  <TurnstileWidget onVerify={setReportTurnstileToken} />
                </motion.div>
              )}

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowReportDialog(false)
                    setReportReason('')
                    setReportDetails('')
                    setReportTurnstileToken(undefined)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => reportMutation.mutate({ reason: reportReason, details: reportDetails })}
                  disabled={!reportReason || !reportTurnstileToken}
                  isPending={reportMutation.isPending}
                >
                  Submit Report
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete this post?"
        description="The post and all its comments will be removed — you'll have a few seconds to undo right after."
        confirmLabel="Delete post"
      />

      <Modal isOpen={showLikersModal} onClose={() => setShowLikersModal(false)} title="Liked by">
        {likersQuery.isLoading ? (
          <p className="text-sm text-text-s">Loading…</p>
        ) : likers.length === 0 ? (
          <p className="text-sm text-text-s">No likes yet.</p>
        ) : (
          <ul className="space-y-2">
            {likers.map((u) => (
              <li key={u.userId}>
                <Link
                  to="/profile/$nickname"
                  params={{ nickname: u.nickname ?? '' }}
                  onClick={() => setShowLikersModal(false)}
                  className="flex items-center gap-2 p-2 -mx-2 rounded-md text-text hover:bg-surface-translucent transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
                >
                  <span className="font-semibold">{u.name}</span>
                  <span className="text-text-s">@{u.nickname}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <LoginPromptModal
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        action={loginPromptAction}
      />

      <SharePostSheet
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        post={post}
        onShareCounted={() => setLocalShares((n) => n + 1)}
      />
    </motion.article>
  )
}
