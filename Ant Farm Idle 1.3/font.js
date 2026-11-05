/*
 * Pixel font for Ant Tycoon.
 *
 * Every word and number in the game is drawn with this font, so there is
 * no font file to load.
 *
 * Each character below is a grid 5 pixels wide. "#" is a filled pixel and
 * "." is an empty one. Rows are separated by spaces and read top to bottom.
 * Most characters have 7 rows. Characters that hang below the line
 * (g j p q y and the comma) have 9.
 *
 * To change how a character looks, edit its rows.
 */

const PixelFont = (() => {
  'use strict';

  const GLYPHS = {
    'A': '.###. #...# #...# ##### #...# #...# #...#',
    'B': '####. #...# #...# ####. #...# #...# ####.',
    'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '####. #...# #...# #...# #...# #...# ####.',
    'E': '##### #.... #.... ####. #.... #.... #####',
    'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .###.',
    'H': '#...# #...# #...# ##### #...# #...# #...#',
    'I': '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
    'J': '..### ...#. ...#. ...#. ...#. #..#. .##..',
    'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
    'L': '#.... #.... #.... #.... #.... #.... #####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#',
    'N': '#...# #...# ##..# #.#.# #..## #...# #...#',
    'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....',
    'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#',
    'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.',
    'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
    'W': '#...# #...# #...# #.#.# #.#.# ##.## #...#',
    'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
    'Z': '##### ....# ...#. ..#.. .#... #.... #####',

    'a': '..... ..... .###. ....# .#### #...# .####',
    'b': '#.... #.... ####. #...# #...# #...# ####.',
    'c': '..... ..... .###. #.... #.... #...# .###.',
    'd': '....# ....# .#### #...# #...# #...# .####',
    'e': '..... ..... .###. #...# ##### #.... .###.',
    'f': '..##. .#..# .#... ###.. .#... .#... .#...',
    'g': '..... ..... .#### #...# #...# #...# .#### ....# .###.',
    'h': '#.... #.... ####. #...# #...# #...# #...#',
    'i': '..#.. ..... .##.. ..#.. ..#.. ..#.. .###.',
    'j': '...#. ..... ..##. ...#. ...#. ...#. ...#. #..#. .##..',
    'k': '#.... #.... #..#. #.#.. ##... #.#.. #..#.',
    'l': '.##.. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
    'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#',
    'n': '..... ..... ####. #...# #...# #...# #...#',
    'o': '..... ..... .###. #...# #...# #...# .###.',
    'p': '..... ..... ####. #...# #...# #...# ####. #.... #....',
    'q': '..... ..... .#### #...# #...# #...# .#### ....# ....#',
    'r': '..... ..... #.##. ##..# #.... #.... #....',
    's': '..... ..... .#### #.... .###. ....# ####.',
    't': '.#... .#... ###.. .#... .#... .#..# ..##.',
    'u': '..... ..... #...# #...# #...# #...# .####',
    'v': '..... ..... #...# #...# #...# .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.',
    'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#',
    'y': '..... ..... #...# #...# #...# #...# .#### ....# .###.',
    'z': '..... ..... ##### ...#. ..#.. .#... #####',

    '0': '.###. #...# #...# #...# #...# #...# .###.',
    '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '.###. #...# ....# ..##. ....# #...# .###.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
    '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '.###. #.... #.... ####. #...# #...# .###.',
    '7': '##### ....# ...#. ..#.. ..#.. ..#.. ..#..',
    '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ....# .###.',

    ' ': '..... ..... ..... ..... ..... ..... .....',
    '-': '..... ..... ..... ##### ..... ..... .....',
    '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
    '.': '..... ..... ..... ..... ..... .##.. .##..',
    ',': '..... ..... ..... ..... ..... .##.. .##.. ..#.. .#...',
    ':': '..... .##.. .##.. ..... .##.. .##.. .....',
    '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    '/': '....# ....# ...#. ..#.. .#... #.... #....',
    '>': '#.... .#... ..#.. ...#. ..#.. .#... #....',
    '%': '##..# ##..# ...#. ..#.. .#... #..## #..##',
    "'": '..#.. ..#.. ..... ..... ..... ..... .....',
    '"': '.#.#. .#.#. ..... ..... ..... ..... .....',
    '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
    ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
    '\u2665': '..... ##.## ##### ##### .###. ..#.. .....'   // a heart
  };

  // Sizes, in screen pixels.
  const PIXEL = 2;        // size of one font pixel
  const BOLD = 1;         // extra width added to every stroke
  const GLYPH_COLS = 5;
  const SPACE_COLS = 3;   // a blank space is narrower than a letter
  const LETTER_GAP = 3;   // space between characters
  const BODY_ROWS = 7;

  const rowsByChar = {};
  for (const ch in GLYPHS) rowsByChar[ch] = GLYPHS[ch].split(' ');

  function rowsFor(ch) {
    return rowsByChar[ch] || rowsByChar['?'];
  }

  // The small size (for the nuptial flight tree): half the size, no smear.
  const SMALL = { pixel: 1, bold: 0, gap: 1 };
  const NORMAL = { pixel: PIXEL, bold: BOLD, gap: LETTER_GAP };
  const TIGHT = { pixel: PIXEL, bold: BOLD, gap: 1 };   // full size with the letters closer together, to fit a box

  // How far to move right after drawing a character.
  function advanceFor(ch, size) {
    const cols = ch === ' ' ? SPACE_COLS : GLYPH_COLS;
    return cols * size.pixel + size.bold + size.gap;
  }

  /*
   * Draw `text` inside the element `el`, in the element's CSS color.
   * Pass { faded: true } for the stippled look used on buttons that
   * cannot be clicked yet, and { small: true } for half-size letters.
   * { fit: width } (in screen pixels) shrinks text too wide for its box:
   * first the letters move closer together, then the whole word is scaled
   * down just enough to fill the box.
   */
  function widthOf(text, size) {
    let width = 0;
    for (const ch of text) width += advanceFor(ch, size);
    return Math.max(1, width - size.gap);
  }

  function write(el, text, options) {
    text = String(text);
    const faded = !!(options && options.faded);
    let size = options && options.small ? SMALL : NORMAL;
    const fit = options && options.fit;
    let shrink = 1;   // below 1: the drawing is scaled down to fill the box exactly
    if (fit > 0 && size === NORMAL && widthOf(text, NORMAL) > fit) {
      size = TIGHT;
      if (widthOf(text, TIGHT) > fit) shrink = fit / widthOf(text, TIGHT);
    }

    // Skip the redraw if nothing changed.
    const key = (faded ? 'f:' : 'n:') + (size === SMALL ? 's:' : size === TIGHT ? 't' + shrink.toFixed(3) + ':' : '') + text;
    if (el.dataset.pxKey === key) return;
    el.dataset.pxKey = key;

    let canvas = el.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      el.appendChild(canvas);
    }

    let rows = BODY_ROWS;
    let width = 0;
    for (const ch of text) {
      rows = Math.max(rows, rowsFor(ch).length);
      width += advanceFor(ch, size);
    }
    width = Math.max(1, width - size.gap);
    const height = rows * size.pixel;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width * shrink + 'px';
    canvas.style.height = height * shrink + 'px';
    canvas.style.imageRendering = shrink < 1 ? 'auto' : '';   // scaled down: smooth, so no rows go missing

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = getComputedStyle(el).color;

    let left = 0;
    for (const ch of text) {
      const glyph = rowsFor(ch);
      for (let r = 0; r < glyph.length; r++) {
        for (let c = 0; c < GLYPH_COLS; c++) {
          if (glyph[r][c] !== '#') continue;
          const x = left + c * size.pixel;
          const y = r * size.pixel;
          if (!faded) {
            ctx.fillRect(x, y, size.pixel + size.bold, size.pixel);
          } else {
            // Checkerboard: keep every other screen pixel.
            for (let dy = 0; dy < size.pixel; dy++) {
              for (let dx = 0; dx < size.pixel + size.bold; dx++) {
                if ((x + dx + y + dy) % 2 === 0) ctx.fillRect(x + dx, y + dy, 1, 1);
              }
            }
          }
        }
      }
      left += advanceFor(ch, size);
    }
  }

  /* Draw every element that has a data-text="..." attribute. */
  function writeAll(root) {
    for (const el of root.querySelectorAll('[data-text]')) {
      write(el, el.dataset.text);
    }
  }

  return { write, writeAll, GLYPHS };
})();
