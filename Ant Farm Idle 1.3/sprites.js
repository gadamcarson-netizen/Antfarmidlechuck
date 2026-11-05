/*
 * Pixel art for Ant Tycoon, drawn from the grids below (no image files).
 *
 * Each row of a grid is one row of pixels. Each letter is a color from
 * PALETTE, and "." is see-through. To change a picture, edit its rows.
 */

const Sprites = (() => {
  'use strict';

  const PIXEL = 2;   // one game pixel = 2 screen pixels

  const PALETTE = {
    k: '#000000',   // black
    b: '#8d7241',   // brown (wood)
    d: '#414141',   // dark gray
    g: '#828282',   // gray (metal)
    w: '#ffffff',   // white
    '#': '#e1e9fb', // platinum (the platinum star)
    '@': '#cbdbfc', // platinum shade
    '(': '#d9822b', // weaver ant orange
    ')': '#7a3c10', // weaver ant dark orange (legs, antennae)
    '+': '#c9b04a', // weaver queen tan-yellow
    '-': '#7a8a2e', // weaver queen olive
    '$': '#ecd98a', // weaver queen shine
    '!': '#3b2a14', // weaver queen dark brown (legs, eyes)
    ':': '#5f9a2f', // leaf green
    ';': '#2f5a1c', // leaf dark green
    '?': '#9fd06a', // leaf light green
    l: '#56b339',   // light green
    c: '#f5e6b8',   // cream (pupa body)
    s: '#cfb77c',   // tan (pupa's folded legs)
    e: '#412a10',   // dark brown (pupa's eye)
    h: '#473920',   // black at half strength over the cave color (the queen's antenna mid-nod)
    u: '#0000ce',   // blue (window title bar)
    r: '#a0612a',   // bread crust
    q: '#7a4519',   // bread crust in shadow
    i: '#f0d29a',   // inside of the bread
    o: '#d9b57a',   // small holes in the bread
    j: '#f6e7a0',   // royal jelly
    n: '#2e0d06',   // soldier's head: darkest red-brown, at its edge
    a: '#561b0e',   // soldier's head: dark reddish brown
    m: '#7a2c1a',   // soldier's head: shine
    D: '#696a6a',   // nuptial flight icon: wing veins
    P: '#837e86',   // nuptial flight icon: gaster shine
    G: '#2f7d22',   // (unused) dark green
    R: '#e01b1b',   // red (the store flag)
    L: '#aae467',   // aphid: light green
    M: '#7eb94a',   // aphid: darker green
    E: '#cb6062',   // aphid: red eyes
    Y: '#fbf4c6',   // pheromone cloud, inside
    Z: '#eadea0',   // pheromone cloud, edge
    S: '#e2c46a',   // straw, light
    T: '#c9a24a',   // straw, dark
    B: '#120908',   // queen: gaster, nearly black
    H: '#43302c',   // queen: gray shine on the gaster, with a red tint
    Q: '#22100c',   // queen: head, black with a red tint
    W: '#4e3632',   // queen: gray-red shine on the head
    F: '#2a1712',   // queen: legs and antennae, near black with a red tint
    N: '#5c442a',   // queen's antenna at half strength over the cave color (mid-nod)
    O: '#644a45',   // queen: brightest shine on the gaster, while breathing in
    V: '#4a170c',   // queen: mandibles, darker red
    f: '#160a09',   // flying queen: gaster
    x: '#2c110a',   // flying queen: head, legs and antennae
    z: '#3b302f',   // flying queen: shine on the gaster
    I: '#737272',   // flying queen: eye
    A: '#7b5f36',   // flying queen: wing edges and veins
    C: '#c0a677',   // flying queen: wings
    v: '#3b0c00',   // flying queen: mandibles in shadow
    J: '#e6b46a',   // supermajor: shine on the head
    K: '#c4873a',   // supermajor: amber head
    U: '#8a5220',   // supermajor: edge of the head
    X: '#5c2c16',   // supermajor: legs, mandibles and antennae
    p: '#c0461e',   // fire ant: red-orange head and thorax
    t: '#5a1a0c',   // fire ant: dark red-brown gaster
    y: '#fdf351',   // yellow (the "Click!" arrow)
    1: '#41293a',   // insect parts: dark purple shell
    2: '#603b32',   // insect parts: brown
    3: '#87593f',   // insect parts: light brown
    4: '#30403a',   // insect parts: wing edge
    5: '#7ebc48',   // insect parts: compound eye, dark green
    6: '#aae366',   // insect parts: compound eye, light green
    7: '#9eacb5',   // insect parts: wing shine
    8: '#3b2814',   // midden: dark refuse
    9: '#6b5a2c',   // midden: husks
    0: '#5e7e2c',   // midden: a bit of leaf
    '%': '#4a1f0c', // army ant: legs and antennae, dark reddish brown
    '&': '#9a4a1c', // army ant: the body, reddish brown
    '*': '#c97a3e', // army ant: shine
    '^': '#e0b98a', // army ant: the pale soldier head
    '~': '#c99a66', // army ant: the head, shaded
    '<': '#240a05', // media soldier (before Majors): head edge, a little darker than a major's
    '>': '#46160b', // media soldier: head
    '[': '#632416', // media soldier: shine on the head
    ']': '#363636', // media soldier: gaster
    '{': '#6c6c6c', // media soldier: shine on the gaster
    '}': '#2f2f2d', // nursery: dark trophic eggs
    '=': '#6e6e6a'  // nursery: the shine on them
  };

  const ART = {
    // Worker ant, side view, facing right. Used on the main menu button.
    ant: [
      '.............kk',
      '............k..',
      '.kkk......kkk..',
      'kkkkk.kkkkkkk..',
      'kkkkkkkkk.kkk..',
      '.kkk..kkk......',
      '.....k.k.k.....',
      '....k..k..k....'
    ],

    // Queen ant (a harvester ant queen), side view, facing
    // right: a big near-black gaster, slanted so its back end hangs lower,
    // with a gray-red shine; a black humped thorax; a near-black head with
    // a red tint, a gray glossy eye (so it shows on the dark head) and dark
    // red mandibles; near-black legs.
    // Lives in the cave.
    queen: [
      '..........................F',
      '......BB.......kkkk......F.',
      '...BBBHHBBB..kkddkkk..WQF..',
      '..BHHHHHBBB.kkdkkkkkkQdgQQ.',
      '.BHHHBBBBBBkkkkkkkkkkQQQQQV',
      'BBBBBBBBBBBkk.kkkkkkk.QQQVV',
      'BBBBBBBBBBB....kkkkk.......',
      'BBBBBBBBBB....F.F.F........',
      '.BBBBBBBB....F..F..F.......',
      '....BB......F...F...F......',
      '...........F....F....F.....'
    ],

    // Small patches painted over the queen for her idle animation. Field.js
    // says where each one goes.
    //
    // Antenna nod: the antenna drops forward to lie flat. "b" is the cave
    // color, painted over the antenna's raised tip to hide it.
    queenNod: [
      '.b',
      'b.',
      'FF'
    ],
    // Breathing: the shine on her gaster slides back and brightens...
    queenShineGaster: [
      '..BBBBHHBB',
      '.BBHOOHHBB',
      'BBHHHBBBBB'
    ],
    // ...the shine on her thorax narrows by one pixel...
    queenShineThorax: [
      'kd'
    ],
    // ...and the underside of her gaster swells out a little.
    queenBreath: [
      'BBBB'
    ],

    // The first queen (all black, gray shine), kept in case she's wanted back:
    // rename these four to queen, queenNod, queenShineGaster and
    // queenShineThorax, and set QUEEN_PATCHES in field.js back to
    // nod (26, 0), gaster shine (3, 2), thorax shine (15, 2).
    // Winged queen leaving after a nuptial flight.
    // alate1 to alate4: four wing beats in flight, 20 x 19.
    // alateCrawl1 and 2: walking with her wings folded back, 20 x 12.
    alate1: [
      '.....AAA............',
      '....ACCCAA..........',
      '....ACCCCCA.........',
      '.....ACCCCCA........',
      '..AAA.ACACCA........',
      '..ACCAAACACCA.......',
      '...ACCCCACACA.......',
      '....AAACCACCA......x',
      '.......AACCCA.....xx',
      '.........AAAk.....x.',
      '....BBBB.kddkk..zxf.',
      '..BBzzzfBkkkkkkkzIff',
      '.BzzffffBkkkkkkkfffv',
      '.BffffffBkkkkkk..fVv',
      '.BBffffBB.kkk.......',
      '...BBBB...x.x..x....',
      '.........x..x...x...',
      '........x...x...x...',
      '.......x....x....x..'
    ],
    alate2: [
      '....................',
      '....................',
      '....................',
      '...AAA..............',
      '..ACCCAA............',
      '...AAACCAA..........',
      '.AAAACCACCAA........',
      'ACCCCAACCACA.......x',
      '.AACCCCAACCA......xx',
      '...AAACCCCAAk.....x.',
      '....BBBB.kddkk..zxf.',
      '..BBzzzfBkkkkkkkzIff',
      '.BzzffffBkkkkkkkfffv',
      '.BffffffBkkkkkk..fVv',
      '.BBffffBB.kkk.......',
      '...BBBB...x.x..x....',
      '.........x..x...x...',
      '........x...x...x...',
      '.......x....x....x..'
    ],
    alate3: [
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '...................x',
      '..................xx',
      '..........kkk.....x.',
      '....BBBAAAddkk..zxf.',
      '..BBzAACCAkkkkkkzIff',
      '.BzAACCACAkkkkkkfffv',
      '.AACCACCAkkkkkk..fVv',
      'ACCACCAAB.kkk.......',
      'ACCCAAB...x.x..x....',
      '.AAA.....x..x...x...',
      '........x...x...x...',
      '.......x....x....x..'
    ],
    alate4: [
      '....................',
      '.....AAA............',
      '....ACCCAA..........',
      '....ACCCCCA.........',
      '.....ACCCCCA........',
      '..AAA.ACACCA........',
      '..ACCAAACACCA.......',
      '...ACCCCACACA......x',
      '....AAACCACCA.....xx',
      '.......AAAACA.....x.',
      '....BBBB.kddkk..zxf.',
      '..BBzzzfBkkkkkkkzIff',
      '.BzzffffBkkkkkkkfffv',
      '.BffffffBkkkkkk..fVv',
      '.BBffffBB.kkk.......',
      '...BBBB...x.x..x....',
      '.........x..x...x...',
      '........x...x...x...',
      '.......x....x....x..'
    ],
    // The alate resting by the brood with her antenna lowered (idle twitch).
    alateRestNod: [
      '....................',
      '....................',
      '.....AAAAAAkk.....xx',
      '..AAACCCCCAdkk..zxf.',
      'AACCCCCAAAkkkkkkzIff',
      'AAAAAAffBkkkkkkkfffv',
      '.BffffffBkkkkkk..fVv',
      '.BBffffBB.kkk.......',
      '...BBBB...x.x..x....',
      '.........x..x...x...',
      '........x...x...x...',
      '.......x....x....x..'
    ],
    alateCrawl1: [
      '...................x',
      '..................xx',
      '.....AAAAAAkk.....x.',
      '..AAACCCCCAdkk..zxf.',
      'AACCCCCAAAkkkkkkzIff',
      'AAAAAAffBkkkkkkkfffv',
      '.BffffffBkkkkkk..fVv',
      '.BBffffBB.kkk.......',
      '...BBBB...x.x..x....',
      '.........x..x...x...',
      '........x...x...x...',
      '.......x....x....x..'
    ],
    alateCrawl2: [
      '...................x',
      '..................xx',
      '.....AAAAAAkk.....x.',
      '..AAACCCCCAdkk..zxf.',
      'AACCCCCAAAkkkkkkzIff',
      'AAAAAAffBkkkkkkkfffv',
      '.BffffffBkkkkkk..fVv',
      '.BBffffBB.kkk.......',
      '...BBBB...x.x..x....',
      '..........x.x..x....',
      '.........x..x...x...',
      '.........x...x...x..'
    ],
    queenOld: [
      '..........................k',
      '...kkkkkkk.....kkkkk.....k.',
      '.kkggggggkkk..kggkkkk.kkkk.',
      'kkgddddddkdkk.kddkkkkkkkgkk',
      'kkdkkkkkdkkdkkkkkkkkk.kkkk.',
      'kkdkkkkkdkkdkkkkkkkkk.kkkk.',
      'kkkkkkkkdkkdk..kkkkk.......',
      '.kkkkkkkdkkk..k.k.k........',
      '..kkkkkkkkk..k..k..k.......',
      '............k...k...k......',
      '...........k....k....k.....'
    ],

    // Small patches painted over the queen for her idle animation. Field.js
    // says where each one goes.
    //
    // Antenna nod: the tip fades to half strength and a half-strength pixel
    // appears below it, which reads as the antenna dipping half a pixel.
    queenOldNod: [
      'h',
      'h'
    ],
    // Breathing: the shine on her gaster slides one pixel toward her head...
    queenOldShineGaster: [
      'dgggggg'
    ],
    // ...and the shine on her thorax narrows by one pixel.
    queenOldShineThorax: [
      'dg'
    ],

    // Worker ant that walks around the tunnels: side view, facing right.
    // Two leg poses, swapped with every step.
    walker: [
      '.......k',
      'kkk..kk.',
      'kkkkkkk.',
      '..k.k.k.'
    ],
    walkerStep: [
      '.......k',
      'kkk..kk.',
      'kkkkkkk.',
      '.k..k..k'
    ],

    // Soldier ant that walks around the chambers, drawn after a real
    // soldier (major) ant: a huge, glossy dark reddish-brown head with a small eye,
    // short mandibles and antennae in front, a slim black thorax, a narrow
    // waist, a round shiny black gaster, and long thin legs that hold it up.
    // Lighter browns and grays are shine. Two leg poses.
    walkerSoldier: [
      '.........nnnn..k',
      '........nammank.',
      '.kkk....namaakn.',
      'kdgkk..kkaaaaan.',
      'kddkkkkkknaaankk',
      '.kkk.kk.k.nnn..k',
      '.....k.k.k......',
      '....k..k..k.....',
      '...k...k...k....'
    ],
    // Media soldier: a soldier before the Majors upgrade (and half of them
    // after): the same, a little darker, with a smaller head.
    walkerMedia: [
      '...............k',
      '.........<<<.k..',
      '.kkk....<>[[<k..',
      'k]{kk..kk>>>><..',
      'k]]kkkkkk<>>><kk',
      '.kkk.kk.k.<<<..k',
      '.....k.k.k......',
      '....k..k..k.....',
      '...k...k...k....'
    ],
    walkerMediaStep: [
      '...............k',
      '.........<<<.k..',
      '.kkk....<>[[<k..',
      'k]{kk..kk>>>><..',
      'k]]kkkkkk<>>><kk',
      '.kkk.kk.k.<<<..k',
      '.....k..kk......',
      '....k..k..k.....',
      '...k..k....k....'
    ],
    walkerSoldierStep: [
      '.........nnnn..k',
      '........nammank.',
      '.kkk....namaakn.',
      'kdgkk..kkaaaaan.',
      'kddkkkkkknaaankk',
      '.kkk.kk.k.nnn..k',
      '.....k..kk......',
      '....k..k..k.....',
      '...k..k....k....'
    ],

    // Door-head soldier (Door-head soldiers, perk page II), drawn after a
    // Colobopsis major: the soldier's body with a flat-topped head cut off
    // square at the front, the plug it blocks the nest hole with. Two leg poses.
    // Insect parts a scout carries home after finding a dead insect.
    // Each faces right, held in the jaws.
    bitLeg: [
      '1122.',
      '2...2',
      '...21',
      '.2211'
    ],
    bitHead: [
      '.2.',
      '332',
      '332'
    ],
    bitEye: [
      '.kk.',
      'k562',
      'k652',
      '.22.'
    ],
    bitShin: [
      '..23',
      '.223'
    ],
    bitWing: [
      '..4ww4',
      '.4w74.',
      '4w74..',
      '44....'
    ],
    walkerDoorhead: [
      '...............k',
      '........nnnnnnk.',
      '.kkk....nammaan.',
      'kdgkk..kkaaaaan.',
      'kddkkkkkknaaaan.',
      '.kkk.kk.k.nnnnn.',
      '.....k.k.k......',
      '....k..k..k.....',
      '...k...k...k....'
    ],
    walkerDoorheadStep: [
      '...............k',
      '........nnnnnnk.',
      '.kkk....nammaan.',
      'kdgkk..kkaaaaan.',
      'kddkkkkkknaaaan.',
      '.kkk.kk.k.nnnnn.',
      '.....k..kk......',
      '....k..k..k.....',
      '...k..k....k....'
    ],

    // Supermajor (Super major honeydew upgrade), drawn after a bigheaded ant
    // (Pheidole) supermajor: a huge amber head with a small black eye and
    // reddish mandibles and antennae, a dark thorax and gaster, and long
    // reddish-brown legs. A little bigger than the soldier. Two leg poses.
    walkerMajor: [
      '...........UUUU..X',
      '.........UUKKJJU.X',
      '........UKKKKJJKU.',
      '.BBB....UKKKKKKKKX',
      'BHHBB.kkUKKKKKkKKU',
      'BHBBBBkdkUKKKKKKKX',
      'BBBBBBkkkUKKKKKUXX',
      '.BBBB.kk..UUUUUX..',
      '.....X.X.X........',
      '....X..X..X.......',
      '...X...X...X......'
    ],
    walkerMajorStep: [
      '...........UUUU..X',
      '.........UUKKJJU.X',
      '........UKKKKJJKU.',
      '.BBB....UKKKKKKKKX',
      'BHHBB.kkUKKKKKkKKU',
      'BHBBBBkdkUKKKKKKKX',
      'BBBBBBkkkUKKKKKUXX',
      '.BBBB.kk..UUUUUX..',
      '.....X..XX........',
      '....X..X..X.......',
      '...X..X....X......'
    ],

    // Fire ant (raids): a worker-sized ant, red-orange head and thorax with a
    // dark red-brown gaster, like the red imported fire ant. Two leg poses.
    fireAnt: [
      '.......p',
      'ttt..pp.',
      'tttpppp.',
      '..p.p.p.'
    ],
    fireAntStep: [
      '.......p',
      'ttt..pp.',
      'tttpppp.',
      '.p..p..p'
    ],
    // Alarm pheromone button: a red cloud with a white "!".
    alarm: [
      '...RRR..RRR..',
      '..REEERREEER.',
      '.REEEEwEEEEER',
      'REEEEEwEEEEER',
      'REEEEEwEEEEER',
      'REEEEEwEEEER.',
      '.REEEEEEEEER.',
      '.REEEEwEEEER.',
      '..RRREEERRR..',
      '.....RRR.....'
    ],

    // Sound button (bottom-left of the field): a blue speaker, and the same
    // with a red circle and line through it while sound is off.
    soundOn: [
      '.............',
      '.............',
      '.....u.......',
      '....uu...u...',
      '.uuuuu.u..u..',
      '.uuuuu..u.u..',
      '.uuuuu..u.u..',
      '.uuuuu.u..u..',
      '....uu...u...',
      '.....u.......',
      '.............',
      '.............',
      '.............'
    ],
    soundOff: [
      '....RRRRR....',
      '..RR.....RR..',
      '.RR..u....RR.',
      '.R.Ruu...u.R.',
      'RuuuRu.u..u.R',
      'RuuuuR..u.u.R',
      'RuuuuuR.u.u.R',
      'Ruuuuu.R..u.R',
      'R...uu..Ru..R',
      '.R...u...R.R.',
      '.RR.......RR.',
      '..RR.....RR..',
      '....RRRRR....'
    ],

    // Army ant soldier (perk page II raids; called marauders in the code):
    // a pale head with long black hooked mandibles, a reddish brown body and
    // long legs. Two leg poses.
    walkerMarauder: [
      '...........%%....',
      '..........%..%...',
      '.&&&....&&.^^^...',
      '&&*&&%&&*&^^^~kk.',
      '.&&&...&&&^^~^k.k',
      '..%..%.%..%..k..k',
      '.%..%..%...%..kk.',
      '%...%...%........'
    ],
    walkerMarauderStep: [
      '...........%%....',
      '..........%..%...',
      '.&&&....&&.^^^...',
      '&&*&&%&&*&^^^~kk.',
      '.&&&...&&&^^~^k.k',
      '...%.%..%%...k..k',
      '..%...%...%...kk.',
      '.%.....%...%.....'
    ],
    // The Midden button (Build menu): a heap of refuse.
    midden: [
      '.......0.......',
      '.....8890......',
      '....898988.....',
      '...8889w889....',
      '..889888898....',
      '.88898889888...',
      '8888888888888..'
    ],
    // Rove beetle sneaking through the nest, facing right and left, an
    // ant-loving rove beetle: a big amber
    // abdomen, short wing covers, a narrow waist, a dark head, long thin
    // legs and antennae ending in pale clubs. Drawn with its own colors
    // (field.js BEETLE.colors): 1 legs and antennae, 2 head, 3 wing covers,
    // 4 abdomen, 5 shine, 6 antenna clubs, 7 the dark bands. Two leg poses.
    roveBeetle: [
      '..1...1...16',
      '.445.33.22..',
      '4474433322..',
      '.447.33.22..',
      '..1...1...16'
    ],
    roveBeetleLeft: [
      '61...1...1..',
      '..22.33.544.',
      '..2233344744',
      '..22.33.744.',
      '61...1...1..'
    ],
    roveBeetle2: [
      '.1...1....16',
      '.445.33.22..',
      '4474433322..',
      '.447.33.22..',
      '...1...1..16'
    ],
    roveBeetleLeft2: [
      '61....1...1.',
      '..22.33.544.',
      '..2233344744',
      '..22.33.744.',
      '61..1...1...'
    ],

    // Scouting finds (the button at the edge of the field): a dead beetle on
    // its back, and a spill of seeds.
    scoutInsect: [
      '..k...k..',
      '...kkk...',
      '.kdddddk.',
      'k.ddgdd.k',
      '.kdddddk.',
      'k.kdddk.k',
      '..k...k..'
    ],
    scoutSeeds: [
      '...kwk...',
      '..kwkgk..',
      '.kgkwkwk.',
      'kwkgkwkgk',
      'kgkwkgkwk'
    ],

    // Season badge: summer's sun and winter's snowflake.
    sun: [
      '...T...',
      '.T.T.T.',
      '..TjT..',
      'TTjjjTT',
      '..TjT..',
      '.T.T.T.',
      '...T...'
    ],
    snow: [
      '...u...',
      '.u.u.u.',
      '..uuu..',
      'uuuuuuu',
      '..uuu..',
      '.u.u.u.',
      '...u...'
    ],

    // Bread crumb lying on the grass. Field.js takes pixels off it as it is
    // eaten, so each pixel here is one bit of food for a carrying worker.
    crumb: [
      '.....rrrrr......',
      '...rrriiirrr....',
      '..rriiiiiiirr...',
      '.rriiiioiiiirrr.',
      'rriiioiiiiiiiirr',
      'riiiiiiiiiiiiiir',
      'riiiiiiiioiiiiiq',
      'riiiiiiiiiiiiiqq',
      'rriioiiiiiiiiqq.',
      '.rqiiiiiiiiiqqq.',
      '..qqqqqqqqqqq...'
    ],

    // Arrows that point at the crumb the first time it shows, with "Click!".
    arrowLeft: [
      '...k......',
      '..kyk.....',
      '.kyykkkkkk',
      'kyyyyyyyyk',
      '.kyykkkkkk',
      '..kyk.....',
      '...k......'
    ],
    arrowRight: [
      '......k...',
      '.....kyk..',
      'kkkkkkyyk.',
      'kyyyyyyyyk',
      'kkkkkkyyk.',
      '.....kyk..',
      '......k...'
    ],

    // Worker egg: a single white pixel.
    egg: [
      'w'
    ],

    // Soldier egg: three times the worker egg.
    eggSoldier: [
      'www'
    ],

    // Worker pupa: a pale ant lying on its side, head to the right with a
    // dark eye, waist pinched in, legs folded underneath.
    pupa: [
      '.c.cc',
      'cccec',
      '.css.'
    ],

    // Soldier pupa: the same idea at three times the pixels (33 against 11),
    // with the big head soldiers have.
    pupaSoldier: [
      '.cc.ccc',
      'ccccccc',
      'ccccecc',
      'ccccccc',
      '.csssc.',
      '..s.s..'
    ],

    // A drop of royal jelly.
    jelly: [
      '..k..',
      '.kjk.',
      '.kjk.',
      'kjjjk',
      'kwjjk',
      'kjjjk',
      '.kkk.'
    ],

    // Settings: a gear.
    gear: [
      '......kkk......',
      '...k..kgk..k...',
      '..kgkkkgkkkgk..',
      '...kgggggggk...',
      '..kgggkkkgggk..',
      'kkkggk...kggkkk',
      'kgggk.....kgggk',
      'kkkggk...kggkkk',
      '..kgggkkkgggk..',
      '...kgggggggk...',
      '..kgkkkgkkkgk..',
      '...k..kgk..k...',
      '......kkk......'
    ],

    // Encyclopedia: a blue book with a white title, and the page edges below.
    book: [
      '..kkkkkkkkkkk..',
      '.kuuuuuuuuuuuk.',
      '.kuwwwwwwwwwuk.',
      '.kuuuuuuuuuuuk.',
      '.kuuwwwwwwwuuk.',
      '.kuuuuuuuuuuuk.',
      '.kuuuuuuuuuuuk.',
      '.kuuuuuuuuuuuk.',
      '.kuuuuuuuuuuuk.',
      '.kuuuuuuuuuuuk.',
      '.kuuuuuuuuuuuk.',
      '.kkkkkkkkkkkkk.',
      '.kwwwwwwwwwwwk.',
      '.kkkkkkkkkkkkk.'
    ],

    // Shovel, blade down.
    shovel: [
      '...kkkkk...',
      '...kbbbk...',
      '...kkbkk...',
      '....kbk....',
      '....kbk....',
      '....kbk....',
      '....kbk....',
      '.kkkkbkkkk.',
      '.kgggbgggk.',
      '.kgwgggggk.',
      '.kgwgggggk.',
      '.kgggggggk.',
      '..kgggggk..',
      '...kgggk...',
      '....kkk....'
    ],

    // Float: a small window with an arrow leaving it for a dashed square,
    // meaning "pop the game out into its own window".
    float: [
      '........k.k.k.k',
      '...............',
      '........k.....k',
      '........kkkk...',
      '........k.kk..k',
      '.........kkk...',
      '........kkkkk.k',
      '.......kk......',
      'kkkkkkkk.......',
      'kuuuukk........',
      'kwwwwwk........',
      'kwwwwwk........',
      'kwwwwwk........',
      'kwwwwwk........',
      'kkkkkkk........'
    ],

    // Nuptial flight: a winged ant.
    flight: [
      '.............kkkk...',
      '..........kkkwwwk...',
      '.kk......kwwDwwk....',
      '...k..kkkwDDwwwkDkD.',
      '.kkk.kkwwDwwwkkkPkPk',
      '.kwkkkkkDwwkkkkPkPkk',
      'kkkk.kkkkkkk.kkkkkk.',
      '......k.k.k...kkkk..',
      '.....k..k..k........',
      '....k...k...k.......'
    ],

    // Dig menu shapes: a square and a circle of dug-out ground.
    shapeSquare: [
      'kkkkkkkkkkk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kkkkkkkkkkk'
    ],
    shapeRound: [
      '...kkkkk...',
      '..kbbbbbk..',
      '.kbbbbbbbk.',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      'kbbbbbbbbbk',
      '.kbbbbbbbk.',
      '..kbbbbbk..',
      '...kkkkk...'
    ],

    // A check mark, for checkboxes.
    checkMark: [
      '......u',
      '.....uu',
      'u...uu.',
      'uu.uu..',
      '.uuu...',
      '..u....'
    ],

    // Build menu: a hammer and a green plus sign.
    build: [
      'kkkkkkkkk......',
      'kgwgggggk......',
      'kdddddddk......',
      'kkkkbkkkk......',
      '...kbk.........',
      '...kbk.........',
      '...kbk.........',
      '...kbk....kkk..',
      '...kbk....klk..',
      '...kbk..kkklkkk',
      '...kbk..klllllk',
      '...kbk..kkklkkk',
      '...kbk....klk..',
      '...kkk....kkk..'
    ],

    // Pheromone trail (Build menu): two yellow chevrons in a pale pheromone cloud.
    pheromoneTrail: [
      '...ZZZ..ZZZ..ZZZ...',
      '..ZYYYZZYYYZZYYYZ..',
      '.kkkkYYYYkkkkYYYYZ.',
      '.kyykkYYYkyykkYYYZ.',
      '.kyyykkZYkyyykkYYZ.',
      'ZkkyyykkYkkyyykkZZZ',
      'YYkkyyykkYkkyyykkYY',
      'YYYkkyyykYYkkyyykYY',
      'YYkkyyykkYkkyyykkYY',
      'ZkkyyykkYkkyyykkYZZ',
      'ZkyyykkZYkyyykkYYYZ',
      'ZkyykkZZYkyykkYYYYZ',
      'ZkkkkYZYYkkkkYYYYYZ',
      '.ZYYYZ.ZYYYZ.ZYYYZ.',
      '..ZZZ..ZZYZZ..ZZZ..'
    ],

    // Aphid, seen from above, head up.
    // Two poses: the front legs reach forward, then back.
    aphid: [
      '..L..',
      '.ELE.',
      'LMLML',
      '.MLM.',
      '.LML.',
      'L.L.L'
    ],
    aphidStep: [
      '..L..',
      '.ELE.',
      '.MLM.',
      'LMLML',
      '.LML.',
      'L.L.L'
    ],

    // A seed's space (on the grass, carried, or in a granary). The seeds
    // themselves are in SEEDS below; this one, the sunflower seed, gives the size.
    seed: [
      '.kkkk..',
      'kwwwWk.',
      'kkkddek',
      'kwwwWk.',
      '.kkkk..'
    ],
    // A nursery (Brood tending): a low pile of dark grey trophic eggs, 8 wide
    // like a granary. An egg hatching in it sits on top.
    nursery: [
      '..}d=d..',
      '.d}=d}d.',
      'd=d}d=dd'
    ],
    // The Nursery button (Build menu).
    nurseryIcon: [
      '...............',
      '...............',
      '......}d=......',
      '....d=d}d=d....',
      '...}d=d}=d}d...',
      '..d=d}d=d}d=d..',
      '.}d=d}=d}d=d}d.',
      'd=d}d=d}d=d}d=d',
      'kkkkkkkkkkkkkkk'
    ],
    // Lycaenid Mutualism: a blue butterfly's caterpillar, a flat green slug
    // with a dark stripe down its back, head on the right; and its honeydew drop.
    caterpillar: [
      '........MLLLLLLLLLLLLLLLLLLM........',
      '.....MLLLLMLLLLLLMLLLLLLMLLLLM......',
      '...MLLLLGLLLLLLGLLLLLLGLLLLLGLLM....',
      '..MLLLGGGGGGGGGGGGGGGGGGGGGGGGLLLM..',
      '.MLLLLLLGLLLLLLGLLLLLLGLLLLLGLLLLLMs',
      'MLLMLLLLLMLLLLLLMLLLLLLMLLLLLLMLLLMe',
      'MLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLMe',
      '.MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMs.',
      '..G..G..G..G..G..G..G..G..G..G..G...'
    ],
    // ...and its idle ripple: the bumps on its back move along, its head dips.
    caterpillar2: [
      '.........MLLLLLLLLLLLLLLLLLLM.......',
      '......MLLLLMLLLLLLMLLLLLLMLLLLM.....',
      '...MLLLLLGLLLLLLGLLLLLLGLLLLLGLM....',
      '..MLLLGGGGGGGGGGGGGGGGGGGGGGGGLLLM..',
      '.MLLLLLLLGLLLLLLGLLLLLLGLLLLLGLLLLM.',
      'MLLLMLLLLLLMLLLLLLMLLLLLLMLLLLLLMLMs',
      'MLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLMe',
      '.MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMs',
      '...G..G..G..G..G..G..G..G..G..G..G..'
    ],
    catDrop: [
      '.j.',
      'jjj',
      '.j.'
    ],
    // The Caterpillar button (Build menu).
    caterpillarIcon: [
      '...............',
      '...............',
      '....MLLLLLLM...',
      '..MLLGLLLGLLM..',
      '.MLGGGGGGGGLLMs',
      'MLLMLLLMLLLMLMe',
      '.MMMMMMMMMMMMMs',
      '..G.G.G.G.G.G..',
      'kkkkkkkkkkkkkkk'
    ],
    // The store flag (Build menu, STORE): where stored seeds go.
    storeFlag: [
      'kRRRRRR',
      'kRRRRR.',
      'kRRRRRR',
      'kRRRRR.',
      'k......',
      'k......',
      'k......',
      'k......',
      'k......',
      'kk.....'
    ],
    // On a midden: half a broken seed shell, and a few bits of one.
    seedShell: [
      'kwwk.',
      '.kkkk'
    ],
    seedBits: [
      'k.w',
      '.k.'
    ],
    // Ant bread: a chewed-up seed, paler.
    // Ant bread: the seed chewed into a big mushy light brown blob.
    antBread: [
      '..osso..',
      '.oiiiio.',
      'oiciiiso',
      'osiiisso',
      '.oossoo.'
    ],
    // Build menu: a granary, a straw bed with a seed on it.
    granary: [
      '......kkkk.....',
      '.....krrrqk....',
      '.....kqrrqk....',
      '..kkkkkkkkkkk..',
      '.kSTSTTSTSTSTk.',
      'kSTTSTSSTTSTSSk',
      'kTSSTTSTSSTTSTk',
      'kSTSSTSTTSSTSSk',
      'kkkkkkkkkkkkkkk'
    ],

    // A padlock, drawn mostly see-through over things that are still locked.
    // Weaver ants (the canopy): an orange worker, two leg poses, facing right.
    weaverWorker: [
      '.......)',
      '(((..((.',
      '(((((((.',
      '..).).).'
    ],
    weaverWorkerStep: [
      '.......)',
      '(((..((.',
      '(((((((.',
      '.)..)..)'
    ],
    // The weaver queen, seen through the nest wall: pale green-gold, a big gaster.
    weaverQueen: [
      '..............).',
      '..++++......--)..',
      '.+$$+++.-++-+++.',
      '.++++++--++--+!.',
      '..++++...!..!...',
      '..!..!..!....!..'
    ].map((row) => row.slice(0, 16)),
    // The little arrow tabs between the nest and the canopy: one line, like > turned.
    chevronUp: [
      '...k...',
      '..k.k..',
      '.k...k.',
      'k.....k'
    ],
    chevronDown: [
      'k.....k',
      '.k...k.',
      '..k.k..',
      '...k...'
    ],
    // A small leaf for the corner of the canopy dig button.
    leafBadge: [
      '...;;',
      '.;::;',
      ';:?:;',
      ';:?;.',
      '.;;..'
    ],

    // Platinum star (after the farm's name).
    platinumStar: [
      '.....#....',
      '....#@....',
      '....#@....',
      '...ww#@...',
      '#wwwww####',
      '.#ww###@#.',
      '...w##@...',
      '..w####@..',
      '.w#@..##@.'
    ],
    lock: [
      '..kkkkk..',
      '.kgggggk.',
      '.kgk.kgk.',
      '.kgk.kgk.',
      'kkkkkkkkk',
      'kwgggggdk',
      'kgggkgggk',
      'kgggkgggk',
      'kdddddddk',
      'kkkkkkkkk'
    ],

    // Green "upgrade" arrow, pointing up.
    // Satellite colony button (Mega colony): a satellite with two solar panels.
    satellite: [
      '.......k.......',
      '......kgk......',
      '.......k.......',
      'kkkk.kkkkk.kkkk',
      'kuuk.kgggk.kuuk',
      'kuukkkgdgkkkuuk',
      'kkkk.kgggk.kkkk',
      'kuukkkgdgkkkuuk',
      'kuuk.kgggk.kuuk',
      'kkkk.kkkkk.kkkk'
    ],
    // Remove button (Build menu): a trash can.
    trash: [
      '....kk....',
      '.kkkkkkkk.',
      'kggggggggk',
      'kkkkkkkkkk',
      '.kgdgdgdk.',
      '.kgdgdgdk.',
      '.kgdgdgdk.',
      '.kgdgdgdk.',
      '.kgdgdgdk.',
      '.kgdgdgdk.',
      '.kkkkkkkk.'
    ],
    // Achievements button: a gold medal on a blue and green ribbon (no red,
    // so only the ! for something to claim is red).
    medal: [
      '.GGG....uuu.',
      '..GGG..uuu..',
      '...GGGuuu...',
      '....GGuu....',
      '....kkkk....',
      '...kTyyTk...',
      '..kTyyyyTk..',
      '..kyySyyyk..',
      '..kyyyyyyk..',
      '..kTyyyyTk..',
      '...kTyyTk...',
      '....kkkk....'
    ],
    // A red ! for something ready on the Achievements button.
    alert: [
      'RR',
      'RR',
      'RR',
      'RR',
      '..',
      'RR'
    ],
    // Replete button: a worker hanging from the ceiling by its legs, its
    // gaster swollen into an amber ball with dark stripes.
    replete: [
      'k..k.....k..k.',
      '.k..k...k..k..',
      '..kk.kkkk.kk..',
      '.....kkkk.....',
      '....UKKKKU....',
      '...KJJKKKKK...',
      '..UUUUUUUUUU..',
      '..KJKKKKKKKK..',
      '...UUUUUUUU...',
      '....KKKKKK....'
    ],
    // Merge buttons (Build menu), drawn like the merged structures.
    // Seed Vault: a wall of packed dirt with cells dug into it, seeds in
    // some of them, straw along the floor.
    seedVault: [
      'kkkkkkkkkkkkkkk',
      'keeeeeeeeeeeeek',
      'kebbbebbbebbbek',
      'kekwkebbbekwkek',
      'keSSSeSSSeSSSek',
      'keeeeeeeeeeeeek',
      'kebbbebbbebbbek',
      'kebbbekwkekwkek',
      'kSTSTTSTSTSTSTk',
      'kkkkkkkkkkkkkkk'
    ],
    // Fungus Chamber: packed dirt cracked into a maze, white fungus in the
    // cracks, a few yellow gongylidia.
    fungusChamber: [
      'kkkkkkkkkkkkkkk',
      'kewwceewwweecwk',
      'kecweewceeewcek',
      'kewweccwejeecek',
      'keecweewwweewwk',
      'kewwejeecweeewk',
      'kecweewweewcwek',
      'kewwcewceewweek',
      'keeweewwjeecwwk',
      'kkkkkkkkkkkkkkk'
    ],
    // Honeypot Chamber: a carpet of full repletes hanging from the ceiling
    // in two rows.
    honeypotChamber: [
      'kkkkkkkkkkkkkkk',
      '.k...k...k...k.',
      'UKU.UKU.UKU.UKU',
      'KJK.KJK.KJK.KJK',
      'UUUkUUUkUUUkUUU',
      '...k...k...k...',
      '..UKU.UKU.UKU..',
      '..KJK.KJK.KJK..',
      '..UUU.UUU.UUU..',
      '...............'
    ],
    // Mealybug Herd: white waxy mealybugs on green plant matter, and a
    // honeydew drop.
    scaleHerd: [
      '.M..c.....M..c.',
      '..cwwwc..cwwwc.',
      'M.wwgww..wwgwwM',
      '..cwwwc..cwwwc.',
      '.M..c..j.M..c..',
      '....M..j.c..M..',
      '.M..c...cwwwc..',
      '..cwwwc.wwgww.M',
      '..wwgww.cwwwc..',
      'M.cwwwc..Mc..M.'
    ],
    // Fungus garden button: a mound of white fungus threads.
    fungus: [
      '...c....c.....',
      '.c..cc.cc..c..',
      '..cwwcwwcwwc..',
      '.cwwwwcwwwwwc.',
      'cwwcwwwwwcwwwc',
      'cwwwwcwwwwwcwc',
      '.cwcwwwwcwwwc.',
      'cwwwwwcwwwwwwc',
      '.ccwwcwwwcwcc.',
      '...cc.cc.cc...'
    ],
    upgrade: [
      '.....k.....',
      '....klk....',
      '...klllk...',
      '..klllllk..',
      '.klllllllk.',
      'kkkklllkkkk',
      '...klllk...',
      '...klllk...',
      '...klllk...',
      '...klllk...',
      '...klllk...',
      '...kkkkk...'
    ]
  };

  /* The seeds: each with its own colors, and how often it turns up
     (weight; the sunflower seed, the round one and the dark one most).
     Midden sunflowers drop only sunflower seeds. */
  const SEEDS = {
    sunflower: { weight: 3, colors: { k: '#000000', w: '#fef7f7', W: '#ffffff', d: '#3f3939', e: '#5b5251' }, rows: ART.seed },
    round: { weight: 3.75 * 0.45, colors: { a: '#875940', b: '#a76a49', c: '#b08168' }, rows: [
      '.aaa.',
      'abcca',
      'abbba',
      '.aaa.'
    ] },
    dark: { weight: 3, colors: { a: '#211613', b: '#492f29', c: '#644326' }, rows: [
      '..a..',
      '.aba.',
      'abcba',
      'accca',
      'abcba',
      '.aaa.'
    ] },
    striped: { weight: 1, colors: { a: '#4c413a', b: '#6e5e54' }, rows: [
      '...aab',
      '..abaa',
      '.ababa',
      'ababa.',
      'aaba..',
      '.aa...'
    ] },
    pale: { weight: 1, colors: { a: '#e7c59f', b: '#9e8468', c: '#603b33' }, rows: [
      '.aaa.',
      'aabca',
      'abcba',
      'acbaa',
      'aaaa.'
    ] },
    green: { weight: 1, colors: { a: '#688644', b: '#b3e875', c: '#b6cc9b', d: '#a1be7d' }, rows: [
      '.aaaaa.',
      'aabbcca',
      'ddccccd',
      '.ddddd.'
    ] },
    // The round seed comes in three colors, out of the round seeds:
    // brown 45%, muted orange 25%, pale tan 30% (all three together as often as before).
    // (New kinds go last: saves keep a seed's kind by its place in this list.)
    roundOrange: { weight: 3.75 * 0.25, colors: { a: '#8f5a2c', b: '#b5773f', c: '#c9976a' }, rows: [
      '.aaa.',
      'abcca',
      'abbba',
      '.aaa.'
    ] },
    roundTan: { weight: 3.75 * 0.3, colors: { a: '#9c7b58', b: '#c2a17c', c: '#d6bc9b' }, rows: [
      '.aaa.',
      'abcca',
      'abbba',
      '.aaa.'
    ] }
  };
  const SEED_KINDS = Object.keys(SEEDS);
  function seedKind(kind) { return SEEDS[kind] ? kind : 'sunflower'; }
  // A seed kind picked by weight.
  function pickSeed() {
    const total = SEED_KINDS.reduce((sum, k) => sum + SEEDS[k].weight, 0);
    let roll = Math.random() * total;
    for (const k of SEED_KINDS) { roll -= SEEDS[k].weight; if (roll < 0) return k; }
    return 'sunflower';
  }
  function seedSize(kind) {
    const rows = SEEDS[seedKind(kind)].rows;
    return { cols: rows[0].length, rows: rows.length };
  }
  // Paint a seed with its bottom middle at (x, y).
  function paintSeed(ctx, kind, x, y) {
    const one = SEEDS[seedKind(kind)];
    const left = x - Math.floor(one.rows[0].length / 2), top = y - one.rows.length + 1;
    one.rows.forEach((row, r) => [...row].forEach((ch, c) => {
      const color = one.colors[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(left + c, top + r, 1, 1);
    }));
  }
  // A few of its colors, for an ant carrying it (its middle row).
  function seedColors(kind) {
    const one = SEEDS[seedKind(kind)];
    const row = one.rows[Math.floor(one.rows.length / 2)];
    return [...row].map((ch) => one.colors[ch]).filter(Boolean).slice(0, 4);
  }

  function sizeOf(name) {
    const rows = ART[name];
    return { cols: rows[0].length, rows: rows.length };
  }

  /* Paint a picture onto a canvas, one canvas unit per pixel, top-left at (x, y).
     `colors`, if given, replaces some palette letters' colors (the satellite queen). */
  function paint(ctx, name, x, y, colors) {
    const rows = ART[name];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const letter = rows[r][c];
        const color = (colors && colors[letter]) || PALETTE[letter];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }

  // A picture turned to face a direction. Pictures are drawn facing right.
  // 'left' mirrors it; 'up' and 'down' stand it on end, for climbing.
  const turnedArt = {};
  function turned(name, heading) {
    const key = name + ':' + heading;
    if (turnedArt[key]) return turnedArt[key];

    const rows = ART[name];
    const width = rows[0].length;
    let result = rows;
    if (heading === 'left') {
      result = rows.map((row) => [...row].reverse().join(''));
    } else if (heading === 'up' || heading === 'down') {
      // Head pointing up: the picture's right edge becomes the top row.
      result = [];
      for (let c = width - 1; c >= 0; c--) {
        result.push(rows.map((row) => row[c]).join(''));
      }
      if (heading === 'down') result.reverse();
    }
    turnedArt[key] = result;
    return result;
  }

  /* Paint a picture facing 'right', 'left', 'up' or 'down', centered on (x, y).
     `flipped` turns it upside down (an ant on its back). */
  function paintTurned(ctx, name, x, y, heading, flipped) {
    const rows = flipped ? turned(name, heading).slice().reverse() : turned(name, heading);
    const left = x - Math.floor(rows[0].length / 2);
    const top = y - Math.floor(rows.length / 2);
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const color = PALETTE[rows[r][c]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(left + c, top + r, 1, 1);
      }
    }
  }

  /* Fill every element that has a data-sprite="name" attribute with that picture. */
  function fillAll(root) {
    for (const el of root.querySelectorAll('[data-sprite]')) {
      const name = el.dataset.sprite;
      if (!ART[name]) continue;
      const size = sizeOf(name);
      const scale = Number(el.dataset.scale) || PIXEL;   // data-scale="1" for half size
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.width = size.cols;
      canvas.height = size.rows;
      canvas.style.width = size.cols * scale + 'px';
      canvas.style.height = size.rows * scale + 'px';
      paint(canvas.getContext('2d'), name, 0, 0);
      el.replaceChildren(canvas);
    }
  }

  return { paint, paintTurned, fillAll, sizeOf, ART, PALETTE, SEED_KINDS, pickSeed, seedKind, seedSize, paintSeed, seedColors };
})();
