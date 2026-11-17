import * as fs from 'node:fs';

export default async function globalTeardown() {
  const state = globalThis.__ASSETSCHOOL_R0_PG__;
  if (!state) return;
  try {
    await state.cluster.stop();
  } finally {
    // Only the ephemeral test cluster directory created by globalSetup.
    if (state.dataDir && state.dataDir.includes('assetschool-r0-pg-')) {
      fs.rmSync(state.dataDir, { recursive: true, force: true });
    }
  }
}
