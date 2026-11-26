/**
 * Futuristic "HUD" building blocks of the overview page: glowing panels with corner brackets and a
 * running light edge, count-up numbers, arc gauges, a liquid battery gauge, a ring of light segments
 * and the animated "Home Core". All continuous animations are CSS transforms / opacity (cheap on wall
 * tablets) and stop when the system asks for reduced motion (see styles/effects.css).
 * The building blocks live in components/hud/; this module re-exports them.
 */
export { toneStyle } from './hud/shared';
export { HudPanel } from './hud/HudPanel';
export { HudScale, ScaleUp, FitBox } from './hud/scale';
export { AnimatedNumber, ArcGauge, LiquidGauge, SegmentRing } from './hud/gauges';
export { HomeCore } from './hud/HomeCore';
