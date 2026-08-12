# Living Design System (LDS) Architecture

## Overview
LDS is a dynamic UI engine that synchronizes the application's visual state with environmental and temporal factors. Unlike traditional static themes, LDS implements a generative design approach where the UI evolves through multiple dimensions (Temporal, Lunar, Meteorological, and Organic).

## Core Components

### 1. Generative Hook: `useLivingDesign`
The centralized state provider located in `src/hooks/useLivingDesign.js`. 

**Key Implementation Details:**
- **SSR Resilience:** Implements guards for `window` and `document` access, ensuring compatibility with server-side rendering environments.
- **Weather API Integration:** Interacts with the Open-Meteo API using an `AbortController` for request timeouts (4s).
- **Caching Layer (TTL):** Implements a 1-hour Time-To-Live (TTL) cache for meteorological data in `localStorage` to mitigate API rate limiting and improve TTI (Time To Interactive).
- **Visibility Sync:** Subscribes to `visibilitychange` events to force-refresh design tokens when the user re-engages with the tab after it was backgrounded.

### 2. Design Tokens Bridge (CSS Variables)
State is synchronized with the DOM via CSS custom properties injected into the `:root` element.

| Variable | Dimension | Logic |
| :--- | :--- | :--- |
| `--dynamic-accent-hue` | Annual | Day-of-year mapped to 360° HSL rotation. |
| `--daylight` | Diurnal | Sine wave based on 24h cycle (range 0.3 - 1.0). |
| `--moon-intensity` | Lunar | Sine wave mapped to 29.5-day synodic month (range 0.0 - 1.0). |
| `--weather-saturation` | Meteorological | Inversely proportional to cloud cover (min 0.4). |
| `--weather-blur` | Meteorological | Linear mapping of wind speed to pixel blur (max 20px). |

## Multidimensional Logic

### 🌙 Lunar Cycles & Atmosphere
The system calculates the lunar phase from a known new moon epoch (`2000-01-06`).
- **Implementation:** Uses `Math.sin(moonPhase * Math.PI)` to derive `moonIntensity`.
- **UI Impact:** Applied via `.moon-glow` class to provide a white halo effect during full moon phases.

### ⚛️ Organic Noise (Pseudo-Random Jitter)
To avoid the "uncanny valley" of perfect mathematical orbits, a daily deterministic noise is injected.
- **Logic:** Derived from the current date seed to ensure visual consistency for all users on a given day.
- **UI Impact:** Influences orbital radius and tremor in background elements.

## Integration Guide

### Global Filters
Applied to `body` for holistic atmospheric changes:
```css
filter: saturate(var(--weather-saturation, 1));
transition: filter 1s ease, letter-spacing 1s ease;
```

### Component-Level Classes
- **`.moon-glow`**: Apply to primary containers to add lunar-reactive box-shadows.
- **`.weather-blur`**: Apply to background/ambient elements to respond to wind speed (uses `backdrop-filter` or `filter`).

## Performance Considerations
- **Computation:** All heavy math (Sine/Cosine/Date diffs) is calculated once per 10 minutes or upon tab focus.
- **Rendering:** CSS variables are used to offload styling calculations to the GPU.
- **Transitions:** Layout-neutral properties (`opacity`, `filter`, `box-shadow`) are prioritized for smooth 60fps transitions.

## Debugging & Simulation
For QA purposes, the environment can be simulated by mutating the `now` object within the hook's `updateDesign` method:
```javascript
// Example: Simulate midnight in winter
const now = new Date();
now.setMonth(0); now.setHours(0);
```