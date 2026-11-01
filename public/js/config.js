// Where online saves go. The Cloudflare Worker in worker/ answers here, on the
// same address as the game. Set to '' to keep progress only on each device.
globalThis.NONOCAT_CONFIG = {
  syncUrl: 'api/progress',
};
