import { RelayServer } from './relay/server.js';
import { getSodium } from './crypto/sodium-init.js';

async function init() {
  await getSodium();
  const server = new RelayServer();
  await server.start();
}
init();
