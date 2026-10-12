import * as THREE from 'three';

/**
 * Sponsor ads for the arena's LED boards: a dozen made-up brands, each with its own colours,
 * logo and type, painted once into a 4x3 texture atlas (one 4:1 cell per ad). The board shader
 * picks a cell per board segment and rotates them with a wipe, like real ringside LED boards.
 */

export const AD_COLS = 4;
export const AD_ROWS = 3;
export const AD_COUNT = AD_COLS * AD_ROWS;
/** Width / height of one ad. */
export const AD_ASPECT = 4;

const W = 512;
const H = 128;
const DISPLAY = '"Russo One", Impact, "Arial Black", sans-serif';
const CONDENSED = '"Rajdhani", "Arial Narrow", sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
const SCRIPT = '"Brush Script MT", "Segoe Script", cursive';

type G = CanvasRenderingContext2D;

function lin(g: G, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

function text(g: G, s: string, x: number, y: number, font: string, fill: string | CanvasGradient, align: CanvasTextAlign = 'left', maxW?: number) {
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  g.fillText(s, x, y, maxW);
}

/** Letter-spaced text (canvas letterSpacing is not everywhere yet). */
function spaced(g: G, s: string, x: number, y: number, font: string, fill: string, gap: number) {
  g.font = font;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = fill;
  let w = 0;
  for (const ch of s) w += g.measureText(ch).width + gap;
  w -= gap;
  let cx = x - w / 2;
  for (const ch of s) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + gap;
  }
}

const ADS: ((g: G) => void)[] = [
  // VOLTCELL batteries: black, acid lime, battery icon
  (g) => {
    g.fillStyle = '#07090a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = lin(g, 0, 0, 0, H, [
      [0, '#d8ff3a'],
      [1, '#7fc812'],
    ]);
    g.beginPath();
    g.roundRect(28, 30, 92, 68, 8);
    g.fill();
    g.fillRect(120, 50, 10, 28);
    g.fillStyle = '#07090a';
    g.beginPath();
    g.moveTo(80, 38);
    g.lineTo(58, 68);
    g.lineTo(74, 68);
    g.lineTo(66, 92);
    g.lineTo(92, 58);
    g.lineTo(76, 58);
    g.closePath();
    g.fill();
    text(g, 'VOLTCELL', 152, 54, `64px ${DISPLAY}`, '#ffffff', 'left', 330);
    text(g, 'POWER THAT HITS BACK', 154, 100, `700 26px ${CONDENSED}`, '#c4f02a', 'left', 330);
  },
  // TITAN motor oil: deep red to gold, oil drop, italic serif
  (g) => {
    g.fillStyle = lin(g, 0, 0, W, 0, [
      [0, '#5a0a0a'],
      [0.55, '#8c1010'],
      [1, '#2a0606'],
    ]);
    g.fillRect(0, 0, W, H);
    g.fillStyle = lin(g, 0, 0, W, 0, [
      [0, '#f6d27a'],
      [1, '#b7862a'],
    ]);
    g.fillRect(0, 104, W, 6);
    g.fillRect(0, 18, W, 3);
    g.beginPath();
    g.moveTo(70, 26);
    g.bezierCurveTo(92, 58, 100, 70, 100, 82);
    g.arc(70, 82, 30, 0, Math.PI);
    g.bezierCurveTo(40, 70, 48, 58, 70, 26);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(60, 84, 6, 12, -0.4, 0, Math.PI * 2);
    g.fill();
    text(g, 'TITAN', 124, 60, `italic bold 68px ${SERIF}`, '#f6d27a', 'left', 210);
    text(g, 'FULL SYNTHETIC', 350, 50, `700 24px ${CONDENSED}`, '#ffffff', 'left', 150);
    text(g, 'MOTOR OIL 5W-30', 350, 78, `700 24px ${CONDENSED}`, '#f6d27a', 'left', 150);
  },
  // GEARHEAD tools: hazard yellow, black stripes, wrench
  (g) => {
    g.fillStyle = '#ffc61a';
    g.fillRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.rect(0, 0, 112, H);
    g.clip();
    g.fillStyle = '#141414';
    for (let x = -H; x < 140; x += 36) {
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x + 18, H);
      g.lineTo(x + 18 + H, 0);
      g.lineTo(x + H, 0);
      g.fill();
    }
    g.restore();
    g.fillStyle = '#141414';
    g.fillRect(112, 0, 6, H);
    // wrench
    g.save();
    g.translate(176, 64);
    g.rotate(-0.7);
    g.fillRect(-6, -8, 52, 16);
    g.beginPath();
    g.arc(-14, 0, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffc61a';
    g.fillRect(-40, -7, 26, 14);
    g.restore();
    text(g, 'GEARHEAD', 226, 56, `60px ${DISPLAY}`, '#141414', 'left', 270);
    text(g, 'PRO TOOLS  •  LIFETIME WARRANTY', 228, 100, `700 22px ${CONDENSED}`, '#3a2a00', 'left', 270);
  },
  // ROBO FUEL energy drink: electric blue to magenta, can and bolt
  (g) => {
    g.fillStyle = lin(g, 0, 0, W, H, [
      [0, '#1230ff'],
      [0.6, '#7a1cff'],
      [1, '#ff2ab8'],
    ]);
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 7; i++) g.fillRect(i * 80 - 20, 0, 18, H);
    // can
    g.fillStyle = lin(g, 30, 0, 90, 0, [
      [0, '#9aa4b8'],
      [0.4, '#ffffff'],
      [1, '#6b7488'],
    ]);
    g.beginPath();
    g.roundRect(34, 12, 56, 104, 10);
    g.fill();
    g.fillStyle = '#0a0a20';
    g.fillRect(34, 40, 56, 50);
    g.fillStyle = '#5effff';
    g.beginPath();
    g.moveTo(66, 44);
    g.lineTo(50, 68);
    g.lineTo(62, 68);
    g.lineTo(56, 88);
    g.lineTo(76, 62);
    g.lineTo(64, 62);
    g.closePath();
    g.fill();
    text(g, 'ROBO FUEL', 112, 54, `italic 58px ${DISPLAY}`, '#ffffff', 'left', 380);
    text(g, 'ZERO SUGAR  •  MAX VOLTAGE', 116, 100, `700 24px ${CONDENSED}`, '#5effff', 'left', 380);
  },
  // ORBIT mobile: soft purple gradient, ring logo, lowercase
  (g) => {
    g.fillStyle = lin(g, 0, 0, W, 0, [
      [0, '#2a0a4a'],
      [1, '#6a2ad0'],
    ]);
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(70, 64, 30, 0, Math.PI * 2);
    g.stroke();
    g.save();
    g.translate(70, 64);
    g.rotate(-0.4);
    g.strokeStyle = '#ff9be8';
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(0, 0, 48, 13, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    text(g, 'orbit', 132, 58, `bold 72px "Trebuchet MS", "Segoe UI", sans-serif`, '#ffffff');
    g.fillStyle = '#ff9be8';
    g.beginPath();
    g.roundRect(330, 38, 160, 52, 26);
    g.fill();
    text(g, '5G EVERYWHERE', 410, 65, `700 24px ${CONDENSED}`, '#2a0a4a', 'center', 140);
  },
  // STEELGUARD insurance: navy and white, shield
  (g) => {
    g.fillStyle = '#0c1d3e';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, 8);
    g.fillRect(0, 120, W, 8);
    g.fillStyle = lin(g, 0, 20, 0, 110, [
      [0, '#e9eef8'],
      [1, '#9fb2d8'],
    ]);
    g.beginPath();
    g.moveTo(68, 20);
    g.lineTo(104, 32);
    g.quadraticCurveTo(104, 90, 68, 110);
    g.quadraticCurveTo(32, 90, 32, 32);
    g.closePath();
    g.fill();
    g.fillStyle = '#0c1d3e';
    g.beginPath();
    g.moveTo(68, 34);
    g.lineTo(90, 42);
    g.quadraticCurveTo(90, 82, 68, 96);
    g.closePath();
    g.fill();
    spaced(g, 'STEELGUARD', 300, 52, `bold 46px ${SERIF}`, '#ffffff', 4);
    text(g, 'INSURANCE  —  WE’VE GOT YOU COVERED', 300, 96, `600 22px ${CONDENSED}`, '#9fb2d8', 'center', 360);
  },
  // BOLT BURGER: red and yellow, burger, price tag
  (g) => {
    g.fillStyle = '#d91a1a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffcf1f';
    g.beginPath();
    g.moveTo(360, 0);
    g.lineTo(W, 0);
    g.lineTo(W, H);
    g.lineTo(320, H);
    g.closePath();
    g.fill();
    // burger
    g.fillStyle = '#f2a33a';
    g.beginPath();
    g.ellipse(68, 50, 42, 26, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(26, 50, 84, 6);
    g.fillStyle = '#4fbf3a';
    g.fillRect(24, 56, 88, 7);
    g.fillStyle = '#5a2a14';
    g.beginPath();
    g.roundRect(26, 63, 84, 16, 6);
    g.fill();
    g.fillStyle = '#f2a33a';
    g.beginPath();
    g.roundRect(28, 80, 80, 18, 8);
    g.fill();
    g.fillStyle = '#fff3c4';
    for (const [x, y] of [
      [52, 36],
      [70, 30],
      [86, 40],
    ]) {
      g.beginPath();
      g.ellipse(x, y, 3, 1.6, 0.4, 0, Math.PI * 2);
      g.fill();
    }
    text(g, 'BOLT', 128, 46, `italic 50px ${DISPLAY}`, '#ffcf1f');
    text(g, 'BURGER', 128, 92, `italic 42px ${DISPLAY}`, '#ffffff');
    text(g, 'DOUBLE STACK', 432, 44, `700 26px ${CONDENSED}`, '#b0100f', 'center', 136);
    text(g, '$4.99', 428, 88, `46px ${DISPLAY}`, '#7a0a0a', 'center', 140);
  },
  // MERIDIAN watches: black and gold, minimal, watch face
  (g) => {
    g.fillStyle = '#050505';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 2;
    g.strokeRect(10, 10, W - 20, H - 20);
    g.lineWidth = 4;
    g.beginPath();
    g.arc(70, 64, 36, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(70 + Math.cos(a) * 28, 64 + Math.sin(a) * 28);
      g.lineTo(70 + Math.cos(a) * 33, 64 + Math.sin(a) * 33);
      g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(70, 64);
    g.lineTo(70, 40);
    g.moveTo(70, 64);
    g.lineTo(88, 72);
    g.stroke();
    spaced(g, 'MERIDIAN', 300, 54, `300 44px ${SERIF}`, '#e8cf8a', 12);
    spaced(g, 'SWISS CHRONOGRAPHS', 300, 94, `600 18px ${CONDENSED}`, '#8a7440', 6);
  },
  // SKYLINE airways: sky gradient, swoosh and plane
  (g) => {
    g.fillStyle = lin(g, 0, 0, 0, H, [
      [0, '#3aa8ff'],
      [1, '#b8e4ff'],
    ]);
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [x, y, r] of [
      [380, 96, 30],
      [420, 90, 38],
      [462, 100, 28],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(20, 104);
    g.quadraticCurveTo(120, 30, 300, 38);
    g.stroke();
    // plane
    g.save();
    g.translate(318, 36);
    g.rotate(-0.12);
    g.fillStyle = '#0b2a5a';
    g.beginPath();
    g.ellipse(0, 0, 26, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(-4, 0);
    g.lineTo(-14, 18);
    g.lineTo(-6, 18);
    g.lineTo(8, 0);
    g.moveTo(-4, 0);
    g.lineTo(-14, -16);
    g.lineTo(-6, -16);
    g.lineTo(8, 0);
    g.fill();
    g.restore();
    text(g, 'SKYLINE', 34, 68, `italic bold 50px "Trebuchet MS", sans-serif`, '#0b2a5a');
    text(g, 'AIRWAYS  •  FLY FURTHER', 36, 106, `700 22px ${CONDENSED}`, '#0b2a5a', 'left', 300);
  },
  // FROSTBITE cola: red, white wave, script logo
  (g) => {
    g.fillStyle = '#c4001a';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, 96);
    g.bezierCurveTo(140, 70, 260, 128, W, 86);
    g.lineTo(W, 100);
    g.bezierCurveTo(260, 140, 140, 84, 0, 110);
    g.closePath();
    g.fill();
    // bottle cap + ice crystals
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 26 : 30;
      g.lineTo(458 + Math.cos(a) * r, 46 + Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = '#c4001a';
    g.beginPath();
    g.arc(458, 46, 18, 0, Math.PI * 2);
    g.fill();
    text(g, 'Frostbite', 30, 54, `italic bold 68px ${SCRIPT}`, '#ffffff', 'left', 360);
    text(g, 'ICE COLD COLA', 300, 54, `700 24px ${CONDENSED}`, '#ffd6dc', 'left', 120);
  },
  // PIXELFORGE games: near-black with neon green pixel logo
  (g) => {
    g.fillStyle = '#0a0d14';
    g.fillRect(0, 0, W, H);
    const px = [
      '01110',
      '11011',
      '11111',
      '10101',
      '10001',
    ];
    g.fillStyle = '#39ff8a';
    px.forEach((row, r) =>
      [...row].forEach((v, c) => {
        if (v === '1') g.fillRect(36 + c * 14, 30 + r * 14, 12, 12);
      }),
    );
    text(g, 'PIXELFORGE', 126, 54, `52px ${DISPLAY}`, '#39ff8a', 'left', 360);
    g.fillStyle = '#39ff8a';
    g.fillRect(128, 82, 150, 30);
    text(g, 'NEW GAME', 203, 98, `700 22px ${CONDENSED}`, '#0a0d14', 'center');
    text(g, 'OUT NOW ▶', 296, 98, `700 22px ${CONDENSED}`, '#ffffff');
  },
  // KAIJU tires: orange and black tread
  (g) => {
    g.fillStyle = '#121212';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff6a00';
    for (let x = 0; x < W; x += 28) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 14, 0);
      g.lineTo(x + 24, 12);
      g.lineTo(x + 10, 12);
      g.fill();
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x + 14, H);
      g.lineTo(x + 24, H - 12);
      g.lineTo(x + 10, H - 12);
      g.fill();
    }
    // tire
    g.fillStyle = '#2a2a2a';
    g.beginPath();
    g.arc(70, 64, 42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9a9a9a';
    g.beginPath();
    g.arc(70, 64, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ff6a00';
    g.beginPath();
    g.arc(70, 64, 7, 0, Math.PI * 2);
    g.fill();
    text(g, 'KAIJU', 132, 60, `66px ${DISPLAY}`, '#ff6a00');
    text(g, 'TIRES', 340, 50, `700 34px ${CONDENSED}`, '#ffffff');
    text(g, 'GRIP EVERYTHING', 340, 80, `700 22px ${CONDENSED}`, '#ff9a4a', 'left', 160);
  },
];

function paint(g: G) {
  for (let i = 0; i < AD_COUNT; i++) {
    g.save();
    g.translate((i % AD_COLS) * W, Math.floor(i / AD_COLS) * H);
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    ADS[i](g);
    g.restore();
  }
  // LED pixel grid, faint so the ads stay readable
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < H * AD_ROWS; y += 4) g.fillRect(0, y, W * AD_COLS, 1);
  for (let x = 0; x < W * AD_COLS; x += 4) g.fillRect(x, 0, 1, H * AD_ROWS);
}

/** The ad atlas. It is repainted once the display fonts have loaded. */
export function adAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = W * AD_COLS;
  c.height = H * AD_ROWS;
  const g = c.getContext('2d')!;
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (typeof document !== 'undefined' && document.fonts) {
    void Promise.all([`64px ${DISPLAY}`, `700 24px ${CONDENSED}`, `600 24px ${CONDENSED}`].map((f) => document.fonts.load(f)))
      .then(() => {
        g.clearRect(0, 0, c.width, c.height);
        paint(g);
        t.needsUpdate = true;
      })
      .catch(() => {});
  }
  return t;
}
