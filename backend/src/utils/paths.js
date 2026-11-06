import path from 'path';
import os from 'os';
import fs from 'fs';

// Where saved defaults/waypoints live. Mount a volume here in the container.
export const STORAGE_DIR = process.env.BOATSIM_DATA_DIR || path.join(os.homedir(), '.boatsim');

fs.mkdirSync(STORAGE_DIR, { recursive: true });
