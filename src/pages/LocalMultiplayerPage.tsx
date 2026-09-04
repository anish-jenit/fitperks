import { useEffect, useRef, useState } from 'react'
import { Link } from '../router'

type PlayerId = 'p1' | 'p2'
type PlayerAction = 'idle' | 'jump' | 'duck'
type ObstacleMode = 'jump' | 'squat'

type RoundState = {
  id: number
  mode: ObstacleMode
  progress: number
}

type PlayerScores = Record<PlayerId, number>
type PlayerActions = Record<PlayerId, PlayerAction>

const PLAYER_LABELS: Record<PlayerId, string> = {
  p1: 'Player 1',
  p2: 'Player 2',
}

const ACTION_LABELS: Record<PlayerAction, string> = {
  idle: 'Ready',
  jump: 'Jump',
  duck: 'Squat',
}

function nextObstacle(id: number): RoundState {
  return {
    id,
    mode: Math.random() > 0.48 ? 'jump' : 'squat',
    progress: 0,
  }
}

function requiredAction(mode: ObstacleMode): PlayerAction {
  return mode === 'jump' ? 'jump' : 'duck'
}

export function LocalMultiplayerPage() {
  const [isRunning, setIsRunning] = useState(false)
  const [round, setRound] = useState<RoundState>(() => nextObstacle(1))
  const [scores, setScores] = useState<PlayerScores>({ p1: 0, p2: 0 })
  const [actions, setActions] = useState<PlayerActions>({ p1: 'idle', p2: 'idle' })
  const [message, setMessage] = useState('Start the round, then jump over trains and squat under flying bars.')
  const [flashPlayers, setFlashPlayers] = useState<PlayerId[]>([])

  const actionsRef = useRef(actions)
  const timeoutRef = useRef<Partial<Record<PlayerId, number>>>({})

  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  useEffect(() => {
    const activeTimeouts = timeoutRef.current
    return () => {
      Object.values(activeTimeouts).forEach((timeout) => {
        if (timeout) window.clearTimeout(timeout)
      })
    }
  }, [])

  function triggerAction(player: PlayerId, action: Exclude<PlayerAction, 'idle'>) {
    setActions((current) => {
      const next = { ...current, [player]: action }
      actionsRef.current = next
      return next
    })

    const existingTimeout = timeoutRef.current[player]
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    timeoutRef.current[player] = window.setTimeout(() => {
      setActions((current) => {
        const next = { ...current, [player]: 'idle' as PlayerAction }
        actionsRef.current = next
        return next
      })
    }, action === 'jump' ? 520 : 680)
  }

  function resetGame() {
    setIsRunning(false)
    setRound(nextObstacle(1))
    setScores({ p1: 0, p2: 0 })
    setActions({ p1: 'idle', p2: 'idle' })
    actionsRef.current = { p1: 'idle', p2: 'idle' }
    setFlashPlayers([])
    setMessage('Start the round, then jump over trains and squat under flying bars.')
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'w') triggerAction('p1', 'jump')
      if (event.key.toLowerCase() === 's') triggerAction('p1', 'duck')
      if (event.key === 'ArrowUp') triggerAction('p2', 'jump')
      if (event.key === 'ArrowDown') triggerAction('p2', 'duck')
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!isRunning) {
      return
    }

    let animationFrame = 0
    let lastFrame = performance.now()

    const tick = (now: number) => {
      const elapsed = now - lastFrame
      lastFrame = now

      setRound((current) => {
        const speed = Math.min(34, 17 + current.id * 0.8)
        const nextProgress = current.progress + (elapsed / 1000) * speed

        if (nextProgress < 100) {
          return { ...current, progress: nextProgress }
        }

        const expected = requiredAction(current.mode)
        const winners = (['p1', 'p2'] as PlayerId[]).filter((player) => actionsRef.current[player] === expected)

        if (winners.length) {
          setScores((currentScores) => ({
            p1: currentScores.p1 + (winners.includes('p1') ? 1 : 0),
            p2: currentScores.p2 + (winners.includes('p2') ? 1 : 0),
          }))
          setFlashPlayers(winners)
          window.setTimeout(() => setFlashPlayers([]), 420)
          setMessage(`${winners.map((player) => PLAYER_LABELS[player]).join(' & ')} scored.`)
        } else {
          setMessage(current.mode === 'jump' ? 'Train passed. Jump before it reaches you.' : 'Flying bar passed. Squat before it reaches you.')
        }

        return nextObstacle(current.id + 1)
      })

      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [isRunning])

  const obstacleLeft = `${Math.min(round.progress, 100)}%`
  const cue = round.mode === 'jump' ? 'Jump now' : 'Squat now'

  return (
    <main className="page multiplayer-page">
      <section className="multiplayer-arena" aria-label="Local multiplayer game">
        <div className="multiplayer-header">
          <div>
            <p className="hero-kicker">Local Multiplayer</p>
            <h1>Jump & Squat Duel</h1>
          </div>
          <Link className="button ghost button-small" to="/home">Home</Link>
        </div>

        <div className="multiplayer-scoreboard" aria-live="polite">
          {(['p1', 'p2'] as PlayerId[]).map((player) => (
            <article className={flashPlayers.includes(player) ? 'scored' : ''} key={player}>
              <span>{PLAYER_LABELS[player]}</span>
              <strong>{scores[player]}</strong>
              <em>{ACTION_LABELS[actions[player]]}</em>
            </article>
          ))}
        </div>

        <div className={`multiplayer-cue multiplayer-cue-${round.mode}`}>
          <span>{round.mode === 'jump' ? 'Train incoming' : 'Flying bar incoming'}</span>
          <strong>{cue}</strong>
        </div>

        <div className="multiplayer-track">
          {(['p1', 'p2'] as PlayerId[]).map((player) => (
            <div className={`multiplayer-lane ${actions[player] === 'jump' ? 'is-jumping' : ''} ${actions[player] === 'duck' ? 'is-ducking' : ''}`} key={player}>
              <div className="multiplayer-player">
                <span className="player-head" />
                <span className="player-body" />
                <span className="player-shadow" />
              </div>
              <div className={`multiplayer-obstacle obstacle-${round.mode}`} style={{ left: obstacleLeft }} aria-hidden="true">
                {round.mode === 'jump' ? (
                  <>
                    <span className="train-window" />
                    <span className="train-wheel train-wheel-left" />
                    <span className="train-wheel train-wheel-right" />
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <p className="multiplayer-message" aria-live="polite">{message}</p>

        <div className="multiplayer-controls">
          <button className="button primary" type="button" onClick={() => setIsRunning((value) => !value)}>
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button className="button ghost" type="button" onClick={resetGame}>Reset</button>
        </div>

        <div className="multiplayer-touch-controls">
          {(['p1', 'p2'] as PlayerId[]).map((player) => (
            <div className="multiplayer-pad" key={player}>
              <span>{PLAYER_LABELS[player]}</span>
              <button type="button" onPointerDown={() => triggerAction(player, 'jump')}>Jump</button>
              <button type="button" onPointerDown={() => triggerAction(player, 'duck')}>Squat</button>
            </div>
          ))}
        </div>

        <div className="multiplayer-keyboard-hints" aria-label="Keyboard controls">
          <span>P1: W jump / S squat</span>
          <span>P2: ArrowUp jump / ArrowDown squat</span>
        </div>
      </section>
    </main>
  )
}
