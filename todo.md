

# TODO

- [x] Fix tank hitbox
- [x] Prevent multiple of the same identity from connecting (or at least have it automatically disconnect prior client)
- [x] Keep viewport centered on tank
- [x] Wrap movement and bullets and bound arena
- [x] Bound bullet travel distance
- [x] Fix element overflow (in setting dialog, and playing screen)
- [x] Add player names to tanks in view
- [x] Add barrel
- [x] Add tracks and animate
- [x] Fix asset loading (need to store on game state and load in action handler to fix sound on safari)
- [x] Move constants (pivot offset, tank width/heigh, bullet velocity, etc.. to separate file)
- [x] Fix clipboard copy in safari (not possible :'( )
- [x] Improve ground tile drawing
- [ ] is onStateEvent really how I want to handle this?
- [ ] make `update` called by user instead of in handler, also get rid of `onDisconnect`
- [ ] clean up drawing code
- [ ] Get rid of all the sin's and cos's
- [ ] If in a game an paste join link, nothing happens
- [ ] Clean up error messages and error dialogs
  - [ ] make catalog of common errors
  - [ ] make deno tests
- [ ] Escape toggles settings dialog?
- [ ] Include input instructions in settings dialog
- [x] Add explosion animation on death
- [x] Add sound effects
  - [x] shoot
  - [x] explosion
- [ ] Add more comments
- [ ] Need to have a way to cleanly exit game?
  - [ ] remove disconnect button
- [x] Implement smoothed bullet animations
  - [x] Add nice way to get tick ms (need)
  - [ ] Also add a nice way to get game state from network
- [ ] Add support for a single player mode (just to demo)
- [ ] Break complex transitions into their own module? or at least better organize
  - [ ] Maybe add a dispatchAsync?
  - [ ] Also maybe add a better way to get elements/hook on event handlers?


