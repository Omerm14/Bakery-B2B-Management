import { useState, useEffect } from 'react'

function formatRemaining(ms) {
  if (ms <= 0) return null
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days >= 1) return `נותרו ${days} ${days === 1 ? 'יום' : 'ימים'} לעדכון`
  if (hours >= 1) return `נותרו ${hours}:${String(minutes).padStart(2, '0')} שעות לעדכון`
  return `נותרו ${minutes} דקות לעדכון`
}

// Ticks every minute so the UI naturally locks itself at the exact cutoff
// moment without needing a page refresh — `lockAt` re-evaluation happens
// in the parent (which flips `canEdit`), this component just renders the
// countdown text and goes quiet once time runs out.
export default function CutoffCountdown({ lockAt }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  if (!lockAt) return null
  const ms = new Date(lockAt).getTime() - now
  const text = formatRemaining(ms)
  if (!text) return null
  const urgent = ms < 2 * 60 * 60 * 1000

  return (
    <span className={`cutoff-countdown${urgent ? ' cutoff-countdown-urgent' : ''}`}>
      ⏰ {text}
    </span>
  )
}
