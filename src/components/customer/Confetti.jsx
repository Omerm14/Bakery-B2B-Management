const CONFETTI_COLORS = ['#3DD6A3', '#FFC24D', '#E8890C', '#3987E5', '#E8604C']

// Pure-CSS confetti burst — a brief celebratory moment after a successful
// order send. Purely decorative (no interaction, no content); the parent
// mounts it for a few seconds then unmounts it.
export default function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => i)
  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map(i => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.3
        const duration = 1.8 + Math.random() * 1.2
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const rotate = Math.random() * 360
        const size = 6 + Math.random() * 5
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              background: color,
              width: size,
              height: size * 0.4,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        )
      })}
    </div>
  )
}
