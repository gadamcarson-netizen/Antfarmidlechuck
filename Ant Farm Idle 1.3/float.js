/*
 * The launcher window: opens the game in a floating window that stays on
 * top of everything, using Chrome's Document Picture-in-Picture.
 *
 * The floating window holds the game page (popup.html) in a frame, so the
 * game runs exactly as it does in the toolbar popup.
 */

'use strict';

const GAME_WIDTH = 520;    // the game's size, from popup.css
const GAME_HEIGHT = 440;

const button = document.getElementById('btn-float');
const message = document.getElementById('message');

// Show a few lines of pixel text under the button.
function say(lines) {
  message.replaceChildren();
  for (const line of lines) {
    const span = document.createElement('span');
    span.className = 'px';
    message.appendChild(span);
    PixelFont.write(span, line);
  }
  message.setAttribute('aria-label', lines.join(' '));
}

function showReady() {
  button.hidden = false;
  say(['Press the button', 'to float the game']);
}

function showFloating() {
  button.hidden = true;
  say(['The game is', 'floating. Keep', 'this window open', '(minimized is', 'fine).']);
}

function showUnavailable() {
  button.hidden = true;
  say(['Floating does not', 'work in this', 'version of Chrome']);
}

async function float() {
  try {
    const pip = await documentPictureInPicture.requestWindow({
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      disallowReturnToOpener: true   // hide the "back to tab" button; this window is not a tab
    });

    const page = pip.document;
    page.title = 'Ant Farm Idle';
    page.body.style.cssText = 'margin:0;overflow:hidden;background:#000;' +
      'display:flex;align-items:center;justify-content:center;height:100vh;';
    const frame = page.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup.html');
    frame.title = 'Ant Farm Idle';
    frame.style.cssText = `display:block;border:0;width:${GAME_WIDTH}px;height:${GAME_HEIGHT}px;`;
    page.body.appendChild(frame);

    // Chrome may not give the window exactly the size asked for, and the
    // player can resize it, so scale the game to fit, keeping its shape.
    const fit = () => {
      const scale = Math.min(pip.innerWidth / GAME_WIDTH, pip.innerHeight / GAME_HEIGHT);
      frame.style.zoom = String(scale);
    };
    fit();
    pip.addEventListener('resize', fit);

    // When the floating window is closed, offer the button again.
    pip.addEventListener('pagehide', showReady);

    showFloating();
    // Get this window out of the way; the floating game keeps running.
    if (chrome.windows && chrome.windows.getCurrent) {
      chrome.windows.getCurrent((win) => chrome.windows.update(win.id, { state: 'minimized' }));
    }
  } catch (error) {
    console.error('Ant Farm Idle could not open the floating window:', error);
    say(['Chrome would not', 'open the floating', 'window. Try again.']);
  }
}

PixelFont.writeAll(document);
Sprites.fillAll(document);
if ('documentPictureInPicture' in window) {
  showReady();
  button.addEventListener('click', float);
} else {
  showUnavailable();
}
