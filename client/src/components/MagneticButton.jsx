import { useState, useRef } from 'react'

export const MagneticButton = ({ children, className, ...props }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const buttonRef = useRef(null)

  const handleMouseMove = (e) => {
    const { clientX, clientY } = e
    const rect = buttonRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distanceX = clientX - centerX
    const distanceY = clientY - centerY

    const radius = 100
    const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY)

    if (distance < radius) {
      const force = 0.15 
      setPosition({ x: distanceX * force, y: distanceY * force })
    } else {
      setPosition({ x: 0, y: 0 })
    }
  }

  const handleMouseLeave = () => setPosition({ x: 0, y: 0 })

  return (
    <div className="inline-block w-full" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <button
        ref={buttonRef}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: position.x === 0 ? 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)' : 'transform 0.2s ease-out'
        }}
        className={className}
        {...props}
      >
        {children}
      </button>
    </div>
  )
}
