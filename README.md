
# Tanks!

Welcome to Tanks! This is a multiplayer online game where players control tanks
and battle against each other.

You can try it out at
[https://jvranish.github.io/tanks/](https://jvranish.github.io/tanks/)

To invite other players to your multiplayer game, you can find a join link in the settings dialog (button in top left of screen)

## Controls:

- Arrow keys to move
- `A` and `D` to rotate turret
- Space to shoot

## Installation

Just clone or download the repo, that's it!

I didn't use any libraries or tools (other than a browser and vscode). I wrote
the whole thing from scratch, so there are no other dependencies that need to be
installed.

Though, for local development, you will need a local server for testing. If you don't know how to
setup a local server I recommend reading MDN's [How do you set up a
local testing
server?](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Tools_and_setup/set_up_a_local_testing_server).
I just use vscode with the live server extension.

## Why?

The game itself is pretty meh, but I wanted a simple game to test out and
showcase my networking library. The networking library is pretty cool IMHO.

Some notable features include:
- New players can join mid-game
- Non-hosts can leave and re-join the game and pickup where they left off
- No dedicated server needed, connections are Peer to Peer via WebRTC
- Abstracts away networking and synchronization. This imposes some architectural constraints (the game must be deterministic, i.e. you can't use no `Math.random`, you must use deterministic pseudo-random number generators instead), but free's you from worrying about the networking
- Diagnostic tools for debugging de-sync issues
- Saving replays

I still need to package it up and make it nicely available somewhere better, but
it's available here!

Other cool tools I used for the assets:
- [Photopea](https://www.photopea.com/)
  - I purchased the graphical assets on Craftpix, but did some touch-ups
- [Leshy SFMaker - Online Sound Effect Generator](https://www.leshylabs.com/apps/sfMaker/)
