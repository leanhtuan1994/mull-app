import * as Device from 'expo-device';

import { deviceRamGB } from './compatibility';

const FALLBACK_RAM = 6 * 1024 ** 3;

/** Real RAM of this device (the Mac's RAM on the simulator). */
export function getDeviceInfo() {
  const totalBytes = Device.totalMemory ?? FALLBACK_RAM;
  return {
    totalBytes,
    ramGB: deviceRamGB(totalBytes),
    name: Device.modelName ?? 'iPhone',
    isSimulator: !Device.isDevice,
  };
}

const info = getDeviceInfo();

export function useDeviceInfo() {
  return info;
}
