import type { StationIcon } from '../lib/transport';

const EMOJI: Record<StationIcon, string> = {
  train: '🚆',
  bus: '🚌',
  tram: '🚋',
  ship: '⛴️',
  cableway: '🚡',
  other: '🚏',
};

export const stationEmoji = (icon: StationIcon) => EMOJI[icon];
