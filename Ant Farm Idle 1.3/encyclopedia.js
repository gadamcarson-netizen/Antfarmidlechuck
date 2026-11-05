/*
 * The Encyclopedia: real-world facts behind the words used in the game.
 * Each entry has the term as the game shows it and a short description of
 * the real thing. Only letters the pixel font can draw are used (no
 * semicolons or quote marks).
 *
 * Sources checked for each entry are listed in the comment above it.
 */

const ENCYCLOPEDIA = [
  // How to play (the tutorial points here). Sections: a heading line, then the text.
  {
    term: 'Help',
    text: [
      'Food\n' +
      'Rest the mouse on the ? beside the food box to see food per second: steady food from ants and the satellite colonies, and the food your workers actually brought in from crumbs, seeds, fungus gardens and aphids over the last minute, with a graph of the last 2 minutes. Food buys everything. Click the bread crumb on the grass for food: 1 a bite, more with the Crumbs upgrade. With the Communal Stomach honeydew upgrade, every crumb gives 2 times the food for each egg hatching, and crumb fed to the queen is worth 1.5 times as much (1.2 times for a replete). After each click there is a short wait, shown by a small bar by the mouse. An eaten crumb grows back in 15 to 28 seconds. With no crumb or seed to fetch, 3 in 4 of the workers with nothing to do go out for litter (a dead gnat, a petal or a fleck of leaf) and take it straight to the queen for 2 food, more with the Crumbs upgrade. Once you have 10 workers, every 3 to 6 minutes the game is open your scouts find a dead insect or a seed spill beyond the edge of the screen, and a button shows at that edge of the grass for a minute. Click it and choose how many workers to send: the find is worth about 3 minutes of the food your colony makes, and the tip says how many ants it takes to bring it all back, so a smaller party brings back less. The party is gone for 45 seconds, less with Step counting, Athleticism and Minor workers, and while they are away they earn nothing and do no work. After your first nuptial flight, about every 6 to 13 minutes a small Sceptobius rove beetle sneaks into the nest for about 3 and a half minutes, walking from one spot to another. Click it for one of three rewards, at random. The first is 2 honeydew. The second is a click frenzy: for 10 seconds there is no wait between crumb clicks, and each click is worth 10 times as much. The third is a worker rush: for a minute, workers walk 10 times as fast, never rest, go straight from job to job, and an eaten crumb grows back at once. After 20 minutes with no click or key press, the colony earns only the Away percent until you click again. The music volume and the sound effects are in Settings. So is Peaceful mode: while it is on, the year stands still in summer weather (no winter or rain), and fire ant and army ant raids, the anteater, rove beetles, falling fruit and scout finds all wait. Food brought in while it is on gives 20% less honeydew when you fly, even if you turn it off before the flight (a run spent half in Peaceful mode gives 10% less). Turn it off and everything carries on from where it stopped.',
      'Ants\n' +
      'Lay eggs in the Ants menu. Workers start at 5 food and soldiers at 40, and each one costs more than the last. An egg hatches in 10 seconds, and up to 5 eggs can wait at once, plus 1 for each nursery: the Brood tending upgrade on perk page II unlocks the nursery in the Build menu, a pile of trophic eggs placed on a floor like a granary, and nurseries stay after a flight. A worker brings in 1 food every 10 seconds and a soldier 1 food about every 3.3 seconds. Rest the mouse on a count to see what they earn. The alate, a winged young queen, costs 250 food and is needed for a nuptial flight. A colony raises one, and she waits behind the eggs. The Bigheaded honeydew upgrade adds the supermajor: one per colony, 10,000 food, a giant worker that brings in 50 times the food of an unupgraded worker and carries about 10 times as much crumb, each bit worth 15 times as much, but walks about 3 times slower. Worker upgrades do not help him, except Athleticism (part of Work Speed) and Step counting. He only goes up for crumb, never seeds, and he answers the alarm pheromone like a soldier. Bigheaded also unlocks Majors, the soldier upgrade beside the soldier count. At the bottom of the Ants menu, LAY buys a trophic egg: an egg the queen lays as food, not to hatch. Each makes every ant bring in 0.5% more steady food, and a small grey egg appears under the queen. The first costs 125 food and each one after costs 125 more. They are gone after a nuptial flight.',
      'Ants on screen\n' +
      'Only some of your ants walk around on screen, but all of them earn food. While a crumb is out, a worker goes up for it every 2 seconds and carries 2 to 3 food back to the queen. After feeding her, a worker wanders the nest for a while before its next trip. Now and then a soldier pushes a crumb halfway to the tunnel. Some soldiers are explorers and just roam the nest.',
      'Room\n' +
      'Your first 3 workers and 3 soldiers fit in the starting cave. After that, every 5 more of a kind need another block of dug-out room: the first block is 80 pixels, and each one after needs 10 pixels more than the last (80, 90, 100 and so on). With no room left, the egg can\'t be laid until you dig more.',
      'Digging\n' +
      'In the Dig menu pick DIG or FILL, a size and a shape, then click or drag across the dirt beside your tunnels. It starts large and round. The tool shows where it will dig, and the menu shows the price. With Line assist on, a drag only ever goes straight across or straight down: turn and it makes a square corner, and dragging at a slant makes right-angle steps. Holding Shift keeps it to one line. Uncheck Line assist in the Dig menu to drag freely. Shift still works. You pay by the pixel, and digging costs a little more the more you have dug. FILL puts dirt back for a small price that never rises. The starting tunnel and chamber can never be filled in.',
      'Upgrades\n' +
      'The Crumbs upgrade is cheap and has 80 small levels: one adds 1 food to every click on the bread, the next makes each bit of crumb your ants bring home worth 10% more, up to 41 food a click and 5 times the crumb food. Work Speed has 70 small levels: workers bring in food faster, run to crumbs faster, carry more and rest less in the nest between trips, down to half the rest. Away lets the colony keep earning while the game is closed: each level adds time or a bigger share of the usual food, up to a full day at 50%. Prices rise quickly from level to level. Every upgrade ends with a few very costly levels that go further still: Away\'s raise the share to 100%, then the time to 36 and 48 hours. With no Away level, nothing is earned while it is closed. Seeds already in a granary, fungus already growing and aphids already filling keep going while it is closed, but whatever finishes then pays only the Away percent, and nothing new starts until it opens. After 5 minutes or more away, a Welcome Back window says what the colony did.',
      'Pheromone Trail\n' +
      'Once you own the Pheromone trails honeydew upgrade, open the Build menu and press the yellow arrows. Then click or drag along a tunnel to mark it with pheromones, 8 by 8 at a time. Ants walk 60% faster on the trail. A whole block starts at 5 food, you pay by the pixel, and it costs a little more the more you lay. In the Build menu the trail shows in yellow. Filling in a tunnel removes its trail.',
      'Midden\n' +
      'Many ant colonies keep a midden, a pile for waste and their dead, away from where they live. Once you own the Midden honeydew upgrade, press the heap in the Build menu and click or drag along a tunnel to paint a midden, 8 by 8 at a time, like pheromone trail. A whole block starts at 10 food. A new midden is a patch of tunnel a shade darker, and refuse builds up on it as it fills: seed husks, bodies, plant matter, crumbs. Each separate midden fills on its own and holds one waste for each pixel, so a bigger one takes more to fill. Waste comes a little from all the food your colony harvests while the game is open (shared among the middens by size), a bit each time one of up to 3 workers with nothing to do carries waste to one, and a lot from every fire ant or army ant body, which workers now take to a midden instead of the queen (still 5 food each). Rest the mouse on a midden to see how full it is. When one is full a root grows up from it, a sunflower grows on the grass above, and it bursts into seeds, about one for every 25 pixels of that midden (up to 32, and a small one has a chance of one), for your workers to bring in. Its seeds are worth 1.3 times a normal seed, and up to 2.6 times from a midden of 800 pixels or more. The refuse is gone and it starts filling again. Ants within 10 pixels of a midden walk 4 times slower, so put it out of the way. The trash can removes it, and filling in a tunnel removes the midden there.',
      'Granaries\n' +
      'In the Build menu, press the straw bed and click a dirt floor: a spot of tunnel 8 wide and 3 tall with solid dirt right under it. Now and then a seed falls on the grass while a granary has room, and the next worker sent out fetches it instead of crumb. After 30 seconds in the granary the seed becomes ant bread, and 30 seconds later it is eaten for 23 food. Each granary holds one seed. Seeds stored deeper underground pay more: a granary at the very bottom of the nest pays 50% more than one at the surface, and one halfway down 25% more. The first costs 20 food, the second 43, the third 122, and each one after 42% more. The Harvester upgrade makes seeds come more often and give more food: its first level costs 10 food and brings a seed to 45, and 23 small levels after that go up to 300 a seed. They also bring seeds much sooner and let more seeds lie on the grass at once, up to 10, and its last regular level brings a seed every 5 to 8.5 seconds. Four costly levels after that raise a seed to 400, 500, 650 and 850. Fungus gardens and satellite colonies follow the same seed value.',
      'Aphids\n' +
      'The Aphid Farming honeydew upgrade comes after the Midden, and its second level, Mealybug flight, makes the first aphid of each colony free. Once you own Aphid Farming, press the aphid in the Build menu and click a clear 8 by 8 spot of tunnel: no dirt, trail or other aphid inside it, and away from the queen. Each aphid wanders its little pen of plants and fills up with honeydew over a minute. Then a golden drop shows, and the aphid moves to the middle of its pen and keeps still until a worker runs over, as fast as it would for a crumb, to milk it for 200 food. That worker milks every other full aphid close by at the same time, so aphids kept together save trips. Aphids are not steady food: with no workers to milk them, they earn nothing. Each aphid also gives +10% honeydew earnings. The first costs 1,000 food and each one after costs 40% more. Aphids stay behind on a nuptial flight.',
      'Honeydew\n' +
      'All food your colony brings in this run counts toward honeydew, even food you spend. Each aphid gives +10% honeydew earnings. The first drop takes 5,000 food, and each drop after takes 1,000 more than the one before, 2,000 more from the 51st drop in one flight, and 6,000 more from the 101st. The bar in the Nuptial Flight menu shows how close the next one is.',
      'Nuptial Flight\n' +
      'First raise an alate in the Ants menu. Before your first flight, the Nuptial Flight button only says you need one. After that you can open the menu any time, but FLY still needs an alate. Press FLY, then SURE?, and the alate crawls up out of the nest and flies off to start a new colony with the honeydew you earned. Everything resets except your honeydew, the honeydew upgrades, the farm name and settings. Spend honeydew on the upgrade tree over the field: your harvester ants trade it with other ants for their secrets, and the tip of each upgrade says which ants it came from. Rest the mouse on an upgrade to see what it does. Some need another upgrade first. Polydomy keeps your tunnels dug. Its second level makes the nest bigger, a third more dirt each way (the game still opens at the old view. Zoom out to see it all), and digging cost 25% less. Seed cache, after Polydomy, keeps your granaries and stored seeds too (without it, stored seeds are lost), and Supercolony comes after Seed cache. Once every page I upgrade is owned and at least 5 page II upgrades are bought, perk page III opens, with three upgrades you can buy again and again: Messor (seeds, ant bread and fungus give 2% more food a level), Silver (workers walk 2% faster a level) and Marauder (soldiers bite 2% harder a level). The first level costs 38 honeydew and each one after costs about 20% more.',
      'Seasons\n' +
      'After your third nuptial flight the year turns: 20 minutes of summer, then 5 minutes of winter. Summer counts only while the game is open. Winter also goes on while it is closed, 3 times slower. Summer is the usual game, but once each summer rain falls for 45 seconds: ants on the grass hurry home, crumbs and seeds on the grass wash away, and nobody goes out until it stops. Rain also floods the lowest tunnels for a while: water rises up to 24 pixels from the deepest point of the nest, and ants can not go there until it drains, about 40 seconds after the rain stops. The chamber of the queen always stays dry. Over the last 3 minutes of summer the sky darkens, and for the last 2 a snowflake with a ! shows in the corner. In winter no crumbs or seeds come, no fire ants raid, and workers stay in, but every seed eaten gives 4 times the food (6 times with Diapause). After winter the sky brightens over 2 minutes. The Seeds setting in the Build menu chooses what workers do with the seeds they bring in: EAT puts them in granaries as usual, and STORE sets them down on the tunnel floors instead. While the setting is EAT, workers carry the stored seeds to empty granaries, where they are eaten as usual. So store seeds through summer, build plenty of granaries, and switch to EAT when winter comes.',
      'Perk Page II\n' +
      'After your third nuptial flight, tabs at the top of the upgrade tree open a second page of perks, with a gold edge: four branches of four, each bought top to bottom for 100, 200, 400 and 500 honeydew. Economy: Brood tending, Seed keepers, Trophallaxis chain, Superorganism. Army: Door-head soldiers, Army ant raids, True polymorphism, Division of labor. Buildings: Leafcutter gardens, Weaver nests, Honeypot reserves, Lycaenid Mutualism. Seasons: Diapause, Rain flight, Microbial heaters, Nuptial swarm. Rest the mouse on one to see what it does.',
      'Fire Ants\n' +
      'Every 5 to 8 minutes of time the game is open, a few Solenopsis invicta (fire ants) raid, in a line from the edge of the grass: 2 to 4, plus 1 once you have taken a nuptial flight, 1 more for every 25 ants and 1 more for every 3 flights, but never more than 10. If the game closes during a raid, the fire ants are still there when it opens. They go for seeds first: the seeds in your granaries, then any lying on the grass. Only with no seed anywhere do they take a little of the food. Soldiers fight any fire ant they touch and go after ones close by. Press the red alarm pheromone button in the corner of the field, then click a spot, and every soldier hurries there for 30 seconds, on the grass too. The supermajor fights too, with 3 times the health and twice the bite of a soldier, and never hides. Soldiers walk twice as fast on the grass. He is too big to carry, so if he falls he heals where he lies. A soldier that loses a fight costs 5 food, is carried to the brood by a worker, and heals after a minute. While fire ants are about, your workers hurry into the main chamber and wait. Once the raid is over they go back to work and carry each fire ant body to the queen for 5 food. The time to the next raid only counts down while the game is open. With no soldiers, a red warning flashes for 10 seconds before a raid. The Fire ant slavemaking honeydew upgrade, once you own Bigheaded and Mega colony, asks you to prepare your army first: CANCEL keeps your honeydew. OK brings an invasion at once: 20 fire ants, 10 from each side, go straight for the queen and stay there, taking some of her food every 10 seconds, until your soldiers beat them. If the game closes first, the invasion starts over when it opens. Once they are beaten you can hatch fire ants in the Ants menu. They hatch in a small nest of their own there, beside a fire ant queen, up to 5 eggs at a time, while one of your workers marks each egg with your colony scent. Each new fire ant walks out of that nest and comes in over the grass to join your colony. During a raid they do not hide like your other workers: they all go after the fire ant nearest the queen and bite it together, so a group can beat one without soldiers. One that loses backs off home for a few seconds. Otherwise they work like workers, with every worker upgrade, and walk 1.5 times as fast, but cost twice as much to start and their price rises twice as fast.',
      'Army Ants\n' +
      'The Army ant raids honeydew upgrade on perk page II brings army ants: soldiers with pale heads and long hooked jaws, much tougher than fire ants and biting 2.5 times as hard. They come half as often as fire ant raids, every 10 to 16 minutes of time the game is open, never in winter and never while fire ants are about: 4, plus 1 for every 30 soldiers you have, plus 1 to 3 more, up to 12. Half come from the left edge and go for the queen, taking 3 times what a fire ant takes, again and again, until beaten. The other half come from the right and rob granaries, aphids and repletes, 3 times each, then leave. After 90 seconds they all leave. When the last one is beaten or gone, the raid is over and you get 5 honeydew. It takes a strong army to stop them: soldiers, the supermajor, the door-head soldier and fire ant workers all fight them. Fire ant workers take them on two to each army ant, and an army ant goes after any fire ant worker it sees. One it beats lies on its back for a minute, then gets up.',
      'Satellite Colony\n' +
      'The Supercolony honeydew upgrade starts a small second nest. Press the satellite under the menu to open its window, drag the window by its title bar, and close it with X. Its two granaries are always full, and it makes 4 seeds worth of food a minute, more with the Harvester upgrade. It keeps making food while its window is closed. While the game is closed it follows the Away upgrade, like your ants: only the first Away minutes count, at the Away percent. The arrow in its corner buys more output with food. The second level of Supercolony, Mega colony, starts a second satellite colony with its own upgrades, drawn mirrored with light dirt and a very dark queen. The satellite button opens both.',
      'Repletes\n' +
      'The Repletes honeydew upgrade, after Communal Stomach, adds the replete to the Build menu. Place it on a clear 10 by 10 spot of tunnel with solid dirt all along the top: a ceiling. It costs a little food and one of your workers, who becomes the replete, and the next worker costs what the last one did. A worker bringing crumb to the queen takes it to a replete with room instead, the one nearest the surface. Crumb going to fungus gardens and seeds going to granaries are left alone, and the supermajor always feeds the queen. A replete holds 20 bits of crumb, plus whatever is left of the last load. Its gaster swells with yellow as it fills. Once full it gives 2.5 times the food of all it holds (and 1.2 times that again, from Communal Stomach), then empties over 15 seconds and takes none while it does. The upgrade has a second level, Honeypot, for 10 more honeydew: full repletes give 5 times the food instead. Put it near the nest entrance to save your workers time. Repletes stay behind on a nuptial flight.',
      'Removing Structures\n' +
      'The trash can in the Build menu removes a structure: press it, then click a granary, aphid pen, fungus garden, replete or merged building, or pheromone trail. Hold the button and drag across trail to take away a whole stretch of it. A drag only takes trail, never a structure. A quarter of its price is paid back, and the next one of that kind costs less again. The dirt under a granary and the dirt over a replete hold them up, so they can not be dug while the structure is there.',
      'Fungus Gardens\n' +
      'The Fungal garden honeydew upgrade adds the fungus garden to the Build menu. Place it on a clear 8 by 8 spot of tunnel that touches solid dirt all along one side: a floor, ceiling or wall. The fungus grows out from that side, so it hangs from a ceiling and grows sideways from a wall. Workers bringing back crumb take it to a garden that needs feeding 4 times in 5 instead of to the queen. The Crumb and Fungus slider in the Build menu changes that share: slide it toward Crumb and more of the crumb goes to the queen and your repletes. It can not send more than 80% to the gardens (the red line). Workers still fetch seeds first. If the garden grew too recently to be fed again, the worker takes the crumb to the queen instead. Each feeding grows it a stage, at least 4 seconds apart, and a garden nobody feeds for 60 seconds grows a stage on its own: a low fuzzy mat of fungus, then a taller one with a few pale yellow clusters of swollen tips, then a thick mat full of them. 3 seconds after it is thick it is eaten for as much food as a seed gives, 45 and up to 650 with the Harvester upgrade, and starts again. Each feeding adds up to 10% to that food, the full 10% for a large crumb, so a garden fed twice pays up to 20% more. The supermajor always feeds the queen. Each garden costs more than the last, and gardens stay behind on a nuptial flight.',
      'Merging\n' +
      'Once you have 10 granaries, fungus gardens, repletes or aphids, the Merge buttons in the Build menu join 10 of them into one big building for a large price: 15,000 food for the first Seed Vault, and 16 times the price of the 10th for the others. A second merge of the same kind is priced from the 16th instead, a third from the 22nd, and so on. It needs a clear 24 by 24 space, or 24 by 21 for a Seed Vault and 24 by 16 for a Honeypot Chamber (pheromone trail there is cleared). The 10 nearest the mouse go, and what they held comes along. While a Merge button is pressed, the 10 nearest the mouse are hidden as you move it, so the new building can go where they were. They show again once you choose another tool or press the button again. Afterwards the next one of that kind costs as if you had 6 fewer, not 10. A Seed Vault (10 granaries, on a floor) is a wall of packed dirt with 10 cells for seeds. Workers drop seeds into it from any side and fill it before any other granary. Each seed in it gives 20% more food, but fire ants go for it first. A Fungus Chamber (10 gardens, on any surface) is a block of packed dirt cracked into a maze, and the fungus grows through the cracks. It grows a stage on its own every 20 seconds and pays 5 seeds worth. Feeding it, at least 6 seconds apart, makes it grow faster. Ants walk over both to fill and feed them. A Honeypot Chamber (10 repletes, under a ceiling) is a carpet of repletes along the ceiling that holds 200 crumbs and pays 1.2 times what repletes would. It needs 4 workers, so 6 of the 10 come back. A Mealybug Herd (10 aphids) is a flock of mealybugs that makes a honeydew drop every 5 seconds, up to 12. Once 6 are waiting a worker comes and takes them all, 200 food each. It counts as 12 aphids toward honeydew. Merged buildings stay behind on a nuptial flight.',
      'Achievements\n' +
      'After your first nuptial flight, a medal button appears under the menu. Each achievement is named for a real ant term. Rest the mouse on one to read what it means. When one is done, a red ! shows on the button: open it and click the achievement for honeydew: 1 for early and midgame ones, 3 for late game ones and 5 for the five hardest. Rest the mouse on an achievement to see what it is worth. One is hidden until you find it. Achievements and their counts stay through nuptial flights.',
      'Minor Workers and Major Soldiers\n' +
      'In the Ants menu, the small arrow beside the worker count buys Minor workers for 20,000 food: workers walk 30% faster, carry 30% more crumb, rest 30% less between trips, and bring in 30% more steady food. The arrow beside the soldier count buys Majors for 500,000 food, once you own the Bigheaded honeydew upgrade (until then it shows a lock): all soldiers bring in twice the steady food, and half of them become major soldiers, with bigger heads and 13 health instead of 8. Up to 2 majors at a time go and crack an uncracked seed in a granary, which turns it into ant bread at once, so it is eaten 30 seconds sooner, then look once more for another nearby. Both last until the next nuptial flight.',
      'Other buttons\n' +
      'Click the title bar to rename your farm. Use + and - to zoom, and when zoomed in, move the mouse to the edge of the field to slide the view. The pop-out button opens the game in its own window that stays on top as you browse. The book holds this help and real facts about ants. The hammer opens the Build menu.'
    ].join('\n\n')
  },
  // Wikipedia: Ant; Black garden ant (queens live up to 29 years).
  {
    term: 'Queen',
    text: 'The queen is the mother of the colony and lays its eggs. Ant queens can live ' +
          'a very long time: a black garden ant queen can live up to 29 years.'
  },
  // Wikipedia: Ant (sterile wingless females; first nursing, then digging, then defending and foraging).
  {
    term: 'Workers',
    text: 'Workers are wingless, sterile females. A new worker spends her first days ' +
          'caring for the queen and young, then moves on to digging and nest work, and ' +
          'later to defending the nest and foraging.'
  },
  // Wikipedia: Ant (dinergates, stronger mandibles); Pheidole (majors break up food, carry seeds).
  {
    term: 'Soldiers',
    text: 'Soldiers are workers with extra large heads and jaws, called majors. Their ' +
          'stronger jaws make them better fighters. In Pheidole ants, majors also break ' +
          'up large pieces of food and carry seeds.'
  },
  // AntWiki: Colony Foundation (trophic eggs; flight muscles turned into eggs).
  {
    term: 'Eggs',
    text: 'Not every ant egg hatches. Some ants lay trophic eggs, which cannot develop ' +
          'and are eaten as food. A new queen even breaks down her own flight muscles ' +
          'and fat to make eggs for her first brood.'
  },
  // Tragust et al. 2013, BMC Evolutionary Biology (larvae spin cocoons in some species; Lasius cocooned,
  // Argentine ant naked; cocoons limit fungal infection). Snir et al. 2022, Nature (pupal fluid).
  {
    term: 'Pupae',
    text: 'The pupa is the stage between larva and adult. In some ants, such as Lasius, ' +
          'the larva first spins a silk cocoon, which helps protect it from fungus. ' +
          'Others, like the Argentine ant, have naked pupae. Ant pupae even release a ' +
          'fluid that larvae and adults drink.'
  },
  // Wikipedia: Ant (mate with up to ten or more males, sperm stored in spermathecae, wings shed);
  // Alate: a winged reproductive ant (young queen or male) - general entomology;
  // checked against Wikipedia, Ant (Reproduction) and Nuptial flight.
  {
    term: 'Alate',
    text: 'An alate is a winged ant that can breed: a young queen or a male. A colony only ' +
          'raises alates once it is large enough. They stay in the nest until the weather ' +
          'is right, then leave together on a nuptial flight. Workers never have wings.'
  },
  // Pheidole supermajors: Wikipedia, Pheidole; Rajakumar et al. 2012, Science
  // (supermajors in P. obtusospinosa and P. rhea; defence against army ants).
  {
    term: 'Supermajor',
    text: 'Bigheaded ants, the genus Pheidole, have small minor workers and big-headed ' +
          'majors. A few species also raise supermajors, giant workers with even bigger ' +
          'heads. They are rare in the nest. In some species they use their huge heads to ' +
          'block the entrance when army ants attack.'
  },
  // Red imported fire ant (Solenopsis invicta); tropical fire ant (S. geminata) seed
  // harvesting: Carroll & Risch 1984, Oecologia.
  {
    term: 'Fire Ant',
    text: 'Fire ants, the genus Solenopsis, are small red-brown ants with a painful sting. ' +
          'The red imported fire ant has spread from South America to many countries. ' +
          'They eat almost anything, and some, like the tropical fire ant, gather seeds.'
  },
  // Alarm pheromones: Wikipedia, Pheromone (alarm); Vander Meer et al. 2010
  // (Isolation of a pyrazine alarm pheromone component from the fire ant, S. invicta).
  {
    term: 'Alarm Pheromone',
    text: 'When an ant is attacked it releases alarm pheromone, a scent that spreads quickly ' +
          'through the air. Nestmates nearby become excited and rush in to defend. Part of the ' +
          'fire ant alarm pheromone is a pyrazine, a strong-smelling chemical.'
  },
  // Megaponera analis: Frank et al. 2017 Science Advances (rescue of injured
  // nestmates); Frank et al. 2018 Proc. R. Soc. B (wound care: 80% vs 10% mortality).
  {
    term: 'Matabele Ant',
    text: 'Matabele ants of Africa raid termite nests. Ants hurt in a fight call for help, ' +
          'and nestmates carry them home. In the nest others lick their wounds clean. In one ' +
          'study about 80% of hurt ants left untreated died, but only about 10% of treated ones.'
  },
  // Trachymyrmex septentrionalis: Wikipedia (most widely distributed fungus-growing ant in
  // the US); Leucocoprinus symbionts (Dryad dataset doi:10.5061/dryad.c866t1g8p).
  // Yeast gardens: Wikipedia, Cyphomyrmex (rimosus group grows nodules of fungus).
  {
    term: 'Fungus Garden',
    text: 'Fungus-gardening ants grow their own food. The northern fungus-gardening ant, the ' +
          'most widespread fungus grower in the United States, keeps a garden of white fungus ' +
          'threads in its nest, a Leucocoprinus fungus, and feeds it bits it brings in. Some of ' +
          'its relatives grow their fungus differently: Cyphomyrmex ants of the rimosus group ' +
          'raise it as small yeast-like nodules, called yeast gardens.'
  },
  // Black garden ant (flights in hot summer months).
  {
    term: 'Nuptial Flight',
    text: 'On warm summer days, winged young queens and males leave their nests to mate ' +
          'in the air. A queen may mate with ten or more males and stores their sperm in ' +
          'a special organ, the spermatheca. Then she sheds her wings and starts a new ' +
          'colony.'
  },
  // antcube.shop, Do you know the prodigious harvester ants Messor barbarus? (chambers turned into seed
  // granaries, temperature and humidity kept in check; jaws grind seeds, mixed with saliva, enzymes
  // break the starch into a paste). "Ant bread" is the antkeepers' name for that paste.
  {
    term: 'Harvester Ants',
    text: 'Harvester ants gather seeds and keep them in underground ' +
          'chambers used as granaries, where the colony keeps the temperature and damp in ' +
          'check. With strong jaws they grind seeds and mix them with saliva, and enzymes ' +
          'break the starch down into a paste that is easy to share. Antkeepers call it ant bread.'
  },
  // Johannes Gutenberg University Mainz press release, Conflict of interest resolved: wax on the
  // body surface of ants (protects against water loss; carries species and colony membership).
  // Wikipedia: Cuticular hydrocarbon (important as pheromones in social insects).
  {
    term: 'Cuticular Hydrocarbons',
    text: 'An ant is coated in a thin layer of wax, made mostly of hydrocarbons. It keeps ' +
          'the ant from drying out, and its exact mix works like a scent badge: it tells ' +
          'which species, and even which colony, the ant belongs to. That is how ants tell ' +
          'nestmates from strangers.'
  },
  // Wikipedia: Army ant (no permanent nest; living nest of their bodies, a bivouac, holding each
  // other's legs). Wikipedia: Dorylus (temporary subterranean bivouacs, a few days to three months).
  {
    term: 'Bivouac',
    text: 'Army ants have no lasting nest. As they travel they camp in bivouacs, and many ' +
          'build them from their own bodies, holding onto each other\'s legs to make a living ' +
          'ball. African driver ants camp in underground hollows they dig, staying from a few ' +
          'days to about three months.'
  },
  // Wikipedia: Argentine ant (introduced supercolonies on separate continents represent a single
  // global supercolony; the Very Large Colony, San Diego to beyond San Francisco).
  {
    term: 'Mega Colony',
    text: 'Argentine ants have spread around the world with people. Their supercolonies on ' +
          'different continents act as one global colony: ants from far apart mix without ' +
          'fighting. In California one supercolony stretches from San Diego to beyond San ' +
          'Francisco.'
  },
  // AntWiki, Polydomy (one colony in two or more separate nests; Formica wood ants build
  // complexes of nest mounds; Ellis and Robinson 2015 on Formica lugubris non-foraging nests).
  {
    term: 'Polydomy',
    text: 'A polydomous colony lives in two or more separate nests instead of one. Formica ' +
          'wood ants of northern forests build large groups of linked nest mounds, and have ' +
          'been studied more than any other ants for this. In the hairy wood ant, Formica ' +
          'lugubris, nests that send out no foragers help the colony spread toward new food.'
  },
  // Wikipedia: Honeydew (secretion) (sugar-rich sticky liquid from aphids, some scale insects and
  // other true bugs; sap is rich in sugar but low in protein, so excess sugar is excreted; ants
  // milk it and drive away predators). Nature Conservancy of Canada, The ants that herd aphids
  // (ants stroke aphids with their antennae to trigger it; protect them from ladybugs; move them
  // to new plants).
  {
    term: 'Honeydew',
    text: 'Honeydew is a sugary, sticky liquid given off by aphids and some other ' +
          'sap-sucking insects. Plant sap holds far more sugar than they need, so the extra ' +
          'comes out as honeydew. Many ants milk aphids for it by stroking them with their ' +
          'antennae. In return the ants guard the aphids from predators such as ladybugs, ' +
          'and may move them to fresh plants.'
  },
  // Wikipedia: Trail pheromone (richer food, stronger trail; renewed while food lasts, fades after;
  // Wilson 1962, Solenopsis saevissima, sting apparatus).
  {
    term: 'Pheromone Trails',
    text: 'An ant that finds food can lay a scent trail home for nestmates to follow. ' +
          'Better food gets a stronger trail, and ants keep renewing it while the food ' +
          'lasts. When it runs out, the trail fades. In 1962 E. O. Wilson showed fire ' +
          'ants lay these trails from their sting.'
  },
  // Wittlinger, Wehner and Wolf 2006, Science (via Live Science: Cataglyphis fortis, stilts and stumps).
  {
    term: 'Step Counting',
    text: 'Desert ants count their steps to find their way home. In a 2006 study, ' +
          'scientists gave some Cataglyphis ants stilts and shortened the legs of others. ' +
          'The ants on stilts walked past their nest and the short legged ants stopped ' +
          'short of it.'
  },
  // AntWiki: Colony Foundation (claustral founding; minims smaller and timid; flight muscles and fat).
  {
    term: 'Nanitics',
    text: 'Nanitics are the first workers a new queen raises, alone and sealed in her ' +
          'chamber. She feeds them from her own body by breaking down her flight muscles ' +
          'and fat. On so little food they grow up smaller than later workers, and they ' +
          'are timid.'
  },
  // Cassill, Butler, Vinson & Wheeler 2005, Insectes Sociaux 52:339-343 (Pheidole spadonia: workers cut
  // prey into pieces, fourth-instar larvae dissolve them, workers take the liquid into their crops and
  // regurgitate it to larvae, workers and queens). eXtension, A Fire Ant Smorgasbord (only the last
  // larval stage eats solid food; adults cannot digest it). AntWiki: Trophallaxis (crops together serve
  // as a social stomach).
  {
    term: 'Communal Stomach',
    text: 'In many ants, adult workers live mostly on liquids, so solid food such as insect ' +
          'prey goes to the oldest larvae. Workers cut the prey into small pieces and lay them ' +
          'on the larvae, which dissolve the pieces with their own digestive juices. Workers ' +
          'then drink up the liquid and store it in their crop. Because workers share what is ' +
          'in their crops mouth to mouth, all the crops together act as a social stomach that ' +
          'feeds the queen, the workers and the younger larvae.'
  },
  // Guinness World Records, Largest colony of ants (Linepithema humile, 6,000 km, northern Italy to
  // Atlantic coast of Spain, PNAS 2002). Wikipedia: Ant supercolony (no aggression within).
  // Wikipedia: Myrmecocystus mexicanus (repletes: larger workers, swell with liquid food until
  // they cannot move, hang from the ceilings of domed chambers, drained in famine, become depletes).
  {
    term: 'Repletes',
    text: 'Honeypot ants keep living food stores called repletes. In Myrmecocystus ' +
          'mexicanus, of the southwestern United States and Mexico, returning foragers fill ' +
          'some of the larger workers with liquid food until their gasters swell too much ' +
          'for them to move. They hang from the ceilings of domed chambers in the nest. When ' +
          'food runs short, usually in winter, the colony drains them, and they go limp.'
  },
  {
    term: 'Supercolony',
    text: 'A supercolony is a huge network of nests whose ants treat each other as ' +
          'nestmates. Argentine ants in southern Europe form one about 6,000 km long, ' +
          'from northern Italy through southern France to the Atlantic coast of Spain.'
  },
  // Wikipedia: Trophobiosis (honeydew for protection). Parmentier and Wybouw 2025, Royal Society
  // Open Science (Lasius flavus: honeydew main food, protect and carry root aphids, guard their eggs).
  {
    term: 'Aphid Farming',
    text: 'Many ants farm aphids. Aphids drink plant sap and give off sugary honeydew, ' +
          'which the ants eat. In return the ants guard them and carry them to safety. ' +
          'Yellow meadow ants keep root aphid eggs in their nest over winter, cleaning ' +
          'them and protecting them from beetles and fungus.'
  },
  // AntWiki: Acropyga (underground, depend on mealybugs for honeydew, queens of eleven species carry a
  // mealybug in their mandibles, trophophoresy, Dominican amber at least 15-20 million years old).
  // Wikipedia: Acropyga acutiventris (living, gravid females carried in the jaws on the nuptial flight).
  {
    term: 'Mealybug Flight',
    text: 'In a behavior called trophophoresy, young Acropyga queens leave on their ' +
          'mating flight holding a living, pregnant mealybug in their jaws. It starts the ' +
          'herd in the new nest: these underground ants depend on root mealybugs for ' +
          'sugary honeydew. Queens doing this are even found in amber 15 to 20 million ' +
          'years old.'
  },
  // Wikipedia: Milton Levine (1956, Fourth of July picnic, over 20 million sold).
  {
    term: 'Ant Farm',
    text: 'An ant farm is a thin, clear case of sand or soil where you can watch ants dig ' +
          'their tunnels. Milton Levine came up with the toy in 1956 after spotting ants ' +
          'at a Fourth of July picnic. Over 20 million have been sold.'
  },
  // ScienceAlert 2019 (Pfeffer et al., Journal of Experimental Biology: Saharan silver ant,
  // 855 mm per second, 108 body lengths per second).
  {
    term: 'Fastest Ant',
    text: 'The fastest ant known is the Saharan silver ant. In 2019 scientists clocked it ' +
          'at 855 mm per second, about 108 times its own body length every second.'
  }
];
