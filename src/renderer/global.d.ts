import type { LeblocBridge } from '../shared/api';

declare global {
  interface Window {
    lebloc: LeblocBridge;
  }
}

export {};
