/**
 * Node.js compatibility layer for browser APIs used in web app utils.
 */

/** Replaces browser atob() for base64 decoding */
export function base64Decode(str: string): string {
  return Buffer.from(str, "base64").toString("binary");
}

/** Replaces browser btoa() for base64 encoding */
export function base64Encode(str: string): string {
  return Buffer.from(str, "binary").toString("base64");
}

/**
 * CSS named color map — replaces Canvas API parseNamedColor().
 * Subset of most commonly used colors.
 */
export const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  brown: [165, 42, 42],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  silver: [192, 192, 192],
  fuchsia: [255, 0, 255],
  coral: [255, 127, 80],
  salmon: [250, 128, 114],
  gold: [255, 215, 0],
  khaki: [240, 230, 140],
  indigo: [75, 0, 130],
  violet: [238, 130, 238],
  plum: [221, 160, 221],
  tan: [210, 180, 140],
  crimson: [220, 20, 60],
  tomato: [255, 99, 71],
  turquoise: [64, 224, 208],
  chocolate: [210, 105, 30],
  firebrick: [178, 34, 34],
  darkblue: [0, 0, 139],
  darkgreen: [0, 100, 0],
  darkred: [139, 0, 0],
  darkcyan: [0, 139, 139],
  darkmagenta: [139, 0, 139],
  darkorange: [255, 140, 0],
  darkviolet: [148, 0, 211],
  deeppink: [255, 20, 147],
  deepskyblue: [0, 191, 255],
  dodgerblue: [30, 144, 255],
  forestgreen: [34, 139, 34],
  hotpink: [255, 105, 180],
  lawngreen: [124, 252, 0],
  lightblue: [173, 216, 230],
  lightcoral: [240, 128, 128],
  lightgreen: [144, 238, 144],
  lightyellow: [255, 255, 224],
  limegreen: [50, 205, 50],
  mediumblue: [0, 0, 205],
  midnightblue: [25, 25, 112],
  orangered: [255, 69, 0],
  royalblue: [65, 105, 225],
  seagreen: [46, 139, 87],
  skyblue: [135, 206, 235],
  slateblue: [106, 90, 205],
  slategray: [112, 128, 144],
  springgreen: [0, 255, 127],
  steelblue: [70, 130, 180],
  yellowgreen: [154, 205, 50],
  rebeccapurple: [102, 51, 153],
  aliceblue: [240, 248, 255],
  antiquewhite: [250, 235, 215],
  beige: [245, 245, 220],
  ivory: [255, 255, 240],
  lavender: [230, 230, 250],
  linen: [250, 240, 230],
  mintcream: [245, 255, 250],
  mistyrose: [255, 228, 225],
  oldlace: [253, 245, 230],
  snow: [255, 250, 250],
  wheat: [245, 222, 179],
};
