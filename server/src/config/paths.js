/**
 * Where the configuration is stored: `<DATA_DIR>/config.json` (DATA_DIR is a Docker volume).
 */
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
/** The stored configuration. */
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
