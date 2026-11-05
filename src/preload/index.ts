import { contextBridge, ipcRenderer } from 'electron';
import type { LeblocBridge } from '../shared/api';
import { CHANNELS } from '../shared/channels';

const allowed = new Set<string>(CHANNELS);

const bridge: LeblocBridge = {
  invoke: (channel, input) => {
    if (!allowed.has(channel)) return Promise.reject(new Error(`Unknown channel: ${channel}`));
    return ipcRenderer.invoke(channel, input);
  },
};

contextBridge.exposeInMainWorld('lebloc', bridge);
