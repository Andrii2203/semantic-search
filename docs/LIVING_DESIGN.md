# Living Design System (LDS)

The LDS is a multidimensional UI framework that synchronizes the application's appearance with real-world time, cycles, and environment.

## 🌟 Concept: The "Breathing Showcase"
The UI is not static; it evolves slowly and naturally. It functions like a storefront that changes based on the season, the phase of the moon, and local weather conditions.

## 🧩 Key Components

### 1. The "Brain": `useLivingDesign` Hook
Located in `src/hooks/useLivingDesign.js`, this hook orchestrates all calculations.
- **SSR Safety:** Checks for `window` and `document` to prevent server-side crashes.
- **Caching:** Weather data is cached in `localStorage` for 1 hour to prevent API rate limiting.
- **Sync:** Uses `visibilitychange` to refresh the UI immediately when the user returns to the tab.
- **Interval:** Performs a silent update every 10 minutes.

### 2. The "Atmosphere": CSS Integration
The hook injects dynamic values into the CSS root (`:root`) as variables:

| CSS Variable | Source | Influence |
| :--- | :--- | :--- |
| `--dynamic-accent-hue` | Day of the Year | Primary brand color (rotates annually) |
| `--daylight` | Current Hour | UI Brightness (darker at night, brighter at day) |
| `--moon-intensity` | Lunar Phase | Glow effects and shadow depth (0 to 1) |
| `--weather-blur` | Wind Speed | Background element softness |
| `--weather-saturation` | Cloud Cover | Color vibrancy (muted on cloudy days) |
| `--font-size-base` | Season | Typography size (breathing through the year) |

## 📐 Multidimensional Factors

### 🌑 Lunar Cycle
We calculate the phase of the moon based on a 29.5-day cycle.
- **Effect:** The `.moon-glow` class adds a white halo around components. It is strongest during a Full Moon.
- **CSS Usage:** `box-shadow: 0 0 calc(var(--moon-intensity) * 50px) rgba(255,255,255,0.15)`

### ☁️ Weather Integration (Kyiv by default)
Using the Open-Meteo API (no key required):
- **Clouds:** Desaturate the entire UI.
- **Wind:** Blurs the orbital background elements.

### ⚛️ Organic Noise (Daily Jitter)
A Perlin-like pseudo-random noise is generated daily. 
- **Effect:** Prevents the orbital paths from being perfectly mathematical. It adds "human" imperfection to the movement.

## 🛠 How to Use

### Adding Living Effects to Components
To make a new component reactive to the environment, use the predefined CSS classes:

```html
<!-- Blurs only this element during high wind -->
<div class="weather-blur">...</div>

<!-- Adds a lunar halo during full moon -->
<div class="moon-glow">...</div>
```

### Accessing Data in React
```javascript
const { accentHue, orbit, weather } = useLivingDesign();
```

## 🧪 Testing (Time Machine)
To verify the system, you can manually override the date in `useLivingDesign.js`:
```javascript
const now = new Date();
now.setMonth(11); // Simulate December (Winter)
now.setHours(2);  // Simulate 2:00 AM (Night)
```
