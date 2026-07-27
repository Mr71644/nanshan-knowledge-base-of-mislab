import { memo, useEffect, useRef, useState } from 'react'
import style from './index.module.less'

const BRAND_TEXT = 'MISLAB'

/**
 * 为每个字母生成多层 3D 挤压 text-shadow
 * 模拟金属立体字厚度 —— 光源从右上方打光
 * 随 scrollOffset 旋转光源角度
 */
const buildExtrusion = (layers, scrollOffset) => {
  const angle = 38 + scrollOffset * 22       // 光源旋转 38°→60°
  const rad = (angle * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const shadows = []
  for (let i = 1; i <= layers; i++) {
    const d = i * 1.15                          // 层间距
    const x = (cos * d).toFixed(1)
    const y = (sin * d).toFixed(1)
    const blur = (i * 0.25).toFixed(1)
    // 从亮面到暗面：颜色从铜金过渡到深棕
    const r = Math.max(60, 185 - i * 8)
    const g = Math.max(38, 130 - i * 6)
    const b = Math.max(12, 70 - i * 4)
    const a = (0.22 - i * 0.012).toFixed(3)
    shadows.push(`${x}px ${y}px ${blur}px rgba(${r},${g},${b},${a})`)
  }
  return shadows.join(', ')
}

const BrandMarquee = () => {
  const containerRef = useRef(null)
  const [revealed, setRevealed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [visibleLetters, setVisibleLetters] = useState(0)

  // 进入视口检测 —— 提前 200px 触发，确保文字在屏幕中部就入场
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !revealed) setRevealed(true) },
      { threshold: 0.05, rootMargin: '0px 0px -200px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [revealed])

  // 逐字母揭示
  useEffect(() => {
    if (!revealed) return
    let i = 0
    const timer = setInterval(() => {
      i++
      setVisibleLetters(i)
      if (i >= BRAND_TEXT.length) clearInterval(timer)
    }, 150)
    return () => clearInterval(timer)
  }, [revealed])

  // 滚动进度
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const on = () => {
      const r = el.getBoundingClientRect()
      const h = window.innerHeight
      const v = (h - r.top) / (h + r.height)
      setProgress(Math.max(0, Math.min(1, v)))
    }
    window.addEventListener('scroll', on, { passive: true })
    on()
    return () => window.removeEventListener('scroll', on)
  }, [])

  const glory = Math.sin(progress * Math.PI)
  const extLayers = 6 + Math.floor(glory * 14)
  const scale = 0.88 + glory * 0.2
  const spacing = -2 + glory * 30
  const rotateX = (progress - 0.5) * 10
  const parallaxY = (progress - 0.5) * -40
  const lightPos = progress * 200

  return (
    <div ref={containerRef} className={style.wrapper}>
      {/* 背景光晕 */}
      <div
        className={style.megaGlow}
        style={{
          opacity: glory * 0.55,
          transform: `translate(-50%, -50%) scale(${0.8 + glory * 0.7})`,
        }}
      />

      {/* 顶饰 */}
      <div className={style.ornament}>
        <span className={style.diamondL} style={{ opacity: revealed ? 1 : 0 }} />
        <span className={style.line} style={{ transform: `scaleX(${glory})` }} />
        <span className={style.dot} style={{ opacity: revealed ? 1 : 0 }} />
        <span className={style.line} style={{ transform: `scaleX(${glory})` }} />
        <span className={style.diamondR} style={{ opacity: revealed ? 1 : 0 }} />
      </div>

      {/* 文字舞台 */}
      <div
        className={style.stage}
        style={{
          perspective: '1200px',
          transform: `rotateX(${rotateX}deg) translateY(${parallaxY}px) scale(${scale})`,
          letterSpacing: `${spacing}px`,
          opacity: glory < 0.04 ? 0 : glory < 0.1 ? glory / 0.1 : 1,
        }}
      >
        {BRAND_TEXT.split('').map((char, idx) => {
          const visible = idx < visibleLetters
          const t = idx / (BRAND_TEXT.length - 1)
          const waveY = (t - 0.5) * 90 * glory

          return (
            <span
              key={idx}
              className={`${style.letter} ${visible ? style.letterIn : ''}`}
              style={{
                // 错位延迟由 CSS animation-delay 控制
                animationDelay: `${idx * 0.15}s`,
                // 3D 挤压
                textShadow: visible ? buildExtrusion(extLayers, progress) : 'none',
                // 金属梯度扫光
                backgroundPosition: `${lightPos + t * 50}% center`,
                // 波浪浮动
                transform: visible
                  ? `translateY(${waveY}px) translateZ(${glory * 40 + t * 25}px)`
                  : 'translateY(0)',
              }}
            >
              {char}
              {/* 底部投影 */}
              {visible && (
                <span
                  className={style.floorShadow}
                  style={{
                    opacity: glory * 0.45,
                    transform: `translateX(-50%) scaleX(${0.7 + glory * 0.3})`,
                    width: `${60 + t * 40}px`,
                    filter: `blur(${6 + glory * 6}px)`,
                  }}
                />
              )}
            </span>
          )
        })}
      </div>

      {/* 底饰 */}
      <div className={style.ornament}>
        <span className={style.diamondL} style={{ opacity: revealed ? 1 : 0 }} />
        <span className={style.line} style={{ transform: `scaleX(${glory})` }} />
        <span className={style.dot} style={{ opacity: revealed ? 1 : 0 }} />
        <span className={style.line} style={{ transform: `scaleX(${glory})` }} />
        <span className={style.diamondR} style={{ opacity: revealed ? 1 : 0 }} />
      </div>
    </div>
  )
}

export const MemoBrandMarquee = memo(BrandMarquee)
