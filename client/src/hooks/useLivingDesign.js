import { useState, useEffect, useCallback } from 'react'

/**
 * Production-grade Living Design Hook.
 * Features: SSR safety, caching, fetch timeouts, and visibility sync.
 */
export function useLivingDesign() {
  const [design, setDesign] = useState({
    accentHue: 20,
    orbit: { x: 0, y: 0, z: 1 },
    daylight: 1,
    moonPhase: 0,
    weather: { blur: 0, saturation: 1, temp: 20 },
    noise: 0
  })

  // --- Helper Functions ---

  const getMoonPhase = (date) => {
    if (!date || isNaN(date.getTime())) return 0
    const LUNAR_MONTH = 29.53058867
    const KNOWN_NEW_MOON = new Date('2000-01-06T18:14:00Z')
    const daysSince = (date - KNOWN_NEW_MOON) / 86400000
    return (daysSince % LUNAR_MONTH) / LUNAR_MONTH
  }

  const getDailyNoise = (date, offset = 0) => {
    if (!date || isNaN(date.getTime())) return 0
    const seed = date.getFullYear() * 1000 + date.getMonth() * 100 + date.getDate() + offset
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  const fetchWithTimeout = async (url, timeout = 3000) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      return res
    } catch (e) {
      clearTimeout(timer)
      throw e
    }
  }

  // --- Core Update Logic ---

  const updateDesign = useCallback(async () => {
    const now = new Date()
    now.setMonth(3)
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000)
    const hourAngle = (now.getHours() * 60 + now.getMinutes()) / 1440 * Math.PI * 2
    const yearAngle = (dayOfYear / 365) * Math.PI * 2
    const moonPhase = getMoonPhase(now)
    
    // 1. Weather Logic (with caching)
    let weatherParams = { blur: 0, saturation: 1, temp: 20 }
    const cachedWeather = typeof localStorage !== 'undefined' ? localStorage.getItem('living_ui_weather') : null
    const cacheTimestamp = typeof localStorage !== 'undefined' ? localStorage.getItem('living_ui_weather_ts') : null
    
    const isCacheValid = cacheTimestamp && (Date.now() - parseInt(cacheTimestamp)) < 3600000 // 1 hour

    if (isCacheValid && cachedWeather) {
      weatherParams = JSON.parse(cachedWeather)
    } else {
      try {
        const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=36.72&longitude=-4.42&current=temperature_2m,wind_speed_10m,cloud_cover`, 4000)
        const data = await res.json()
        if (data?.current && typeof data.current.wind_speed_10m === 'number') {
          weatherParams = {
            blur: Math.min(data.current.wind_speed_10m * 0.5, 20), // Max blur 20px
            saturation: Math.max(1 - data.current.cloud_cover / 200, 0.4), // Min saturation 40%
            temp: data.current.temperature_2m
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('living_ui_weather', JSON.stringify(weatherParams))
            localStorage.setItem('living_ui_weather_ts', Date.now().toString())
          }
        }
      } catch (e) {
        console.warn("Weather sync failed, using last known or default.", e.message)
        if (cachedWeather) weatherParams = JSON.parse(cachedWeather)
      }
    }

    // 2. Calculations
    const noise1 = getDailyNoise(now)
    const noise2 = getDailyNoise(now, 500)
    const radius = 35 + noise1 * 5
    const orbitX = Math.cos(yearAngle + noise2 * 0.1) * radius
    const orbitY = Math.sin(yearAngle + noise1 * 0.1) * radius
    const orbitZ = 0.5 + (Math.sin(yearAngle + Math.PI/2) + 1) / 2
    const daylight = 0.3 + (Math.sin(hourAngle - Math.PI/2) + 1) / 2 * 0.7
    const hue = (20 + dayOfYear) % 360

    // 3. Apply to DOM (SSR safe)
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      root.style.setProperty('--dynamic-accent-hue', hue.toString())
      root.style.setProperty('--daylight', daylight.toString())
      root.style.setProperty('--weather-blur', `${weatherParams.blur}px`)
      root.style.setProperty('--weather-saturation', weatherParams.saturation.toString())
      root.style.setProperty('--moon-phase', moonPhase.toFixed(3))
      
      // Вираховуємо інтенсивність сяйва (0 до 1)
      const moonIntensity = Math.max(0, Math.sin(moonPhase * Math.PI))
      root.style.setProperty('--moon-intensity', moonIntensity.toFixed(3))
      
      const season = Math.floor(dayOfYear / 91.25)
      root.style.setProperty('--font-size-base', `${14 + season}px`)
      root.style.setProperty('--letter-spacing', `${0.5 + Math.sin(dayOfYear / 30) * 0.5}px`)
    }

    setDesign({
      accentHue: hue,
      orbit: { x: orbitX, y: orbitY, z: orbitZ },
      daylight,
      moonPhase,
      weather: weatherParams,
      noise: noise1
    })
  }, [])

  useEffect(() => {
    updateDesign()

    // Sync on tab visibility change
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        updateDesign()
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    const interval = setInterval(updateDesign, 600000) // 10 min refresh
    
    return () => {
      clearInterval(interval)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [updateDesign])

  return design
}
