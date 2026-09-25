/**
 * poly 谱面里 `ease` 字段的取值表（0~30），对应 GameMaker 内置的缓动函数。
 * hold 的每段与 hazard 的左右边界都会用到。
 *
 * | 0 | linear | 11 | outCirc | 22 | inExpo |
 * | 1 | inSine | 12 | inOutCirc | 23 | outExpo |
 * | 2 | outSine | 13 | inElastic | 24 | inOutExpo |
 * | 3 | inOutSine | 14 | outElastic | 25 | inBack |
 * | 4 | inCubic | 15 | inOutElastic | 26 | outBack |
 * | 5 | outCubic | 16 | inQuad | 27 | inOutBack |
 * | 6 | inOutCubic | 17 | outQuad | 28 | inBounce |
 * | 7 | inQuint | 18 | inOutQuad | 29 | outBounce |
 * | 8 | outQuint | 19 | inQuart | 30 | inOutBounce |
 * | 9 | inOutQuint | 20 | outQuart | | |
 * | 10 | inCirc | 21 | inOutQuart | | |
 * */
export const EASE_NAMES = [
  'linear',
  'inSine',
  'outSine',
  'inOutSine',
  'inCubic',
  'outCubic',
  'inOutCubic',
  'inQuint',
  'outQuint',
  'inOutQuint',
  'inCirc',
  'outCirc',
  'inOutCirc',
  'inElastic',
  'outElastic',
  'inOutElastic',
  'inQuad',
  'outQuad',
  'inOutQuad',
  'inQuart',
  'outQuart',
  'inOutQuart',
  'inExpo',
  'outExpo',
  'inOutExpo',
  'inBack',
  'outBack',
  'inOutBack',
  'inBounce',
  'outBounce',
  'inOutBounce'
] as const

const c1 = 1.70158
const c2 = c1 * 1.525
const c3 = c1 + 1
const c4 = (2 * Math.PI) / 3
const c5 = (2 * Math.PI) / 4.5
const n1 = 7.5625
const d1 = 2.75

function bounce_out(t: number) {
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}

/** ease id -> 归一化函数 f(t), t∈[0,1] */
const EASE_FNS: ((t: number) => number)[] = [
  (t) => t,
  (t) => 1 - Math.cos((t * Math.PI) / 2),
  (t) => Math.sin((t * Math.PI) / 2),
  (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  (t) => t * t * t,
  (t) => 1 - Math.pow(1 - t, 3),
  (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  (t) => t ** 5,
  (t) => 1 - Math.pow(1 - t, 5),
  (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  (t) => 1 - Math.sqrt(1 - t * t),
  (t) => Math.sqrt(1 - (t - 1) ** 2),
  (t) => (t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2),
  (t) => (t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4)),
  (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
  (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
          : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1,
  (t) => t * t,
  (t) => 1 - (1 - t) * (1 - t),
  (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  (t) => t * t * t * t,
  (t) => 1 - Math.pow(1 - t, 4),
  (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? Math.pow(2, 20 * t - 10) / 2
          : (2 - Math.pow(2, -20 * t + 10)) / 2,
  (t) => c3 * t * t * t - c1 * t * t,
  (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  (t) => 1 - bounce_out(1 - t),
  (t) => bounce_out(t),
  (t) => (t < 0.5 ? (1 - bounce_out(1 - 2 * t)) / 2 : (1 + bounce_out(2 * t - 1)) / 2)
]

/**
 * 取得 id 对应的缓动函数；越界时退化成 linear。
 * @param id 0~30 的缓动 id
 */
export function ease_fn(id: number): (t: number) => number {
  return EASE_FNS[id] ?? EASE_FNS[0]
}

/**
 * 在 a、b 之间按缓动插值。
 * @param a 起点值
 * @param b 终点值
 * @param t 进度 0~1
 * @param id 缓动 id
 */
export function ease_lerp(a: number, b: number, t: number, id: number) {
  const p = t <= 0 ? 0 : t >= 1 ? 1 : t
  return a + (b - a) * ease_fn(id)(p)
}
