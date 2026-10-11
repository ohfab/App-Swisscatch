import { FlagIcon, MapIcon, PinIcon, TrainIcon } from './Icons';

export type Tab = 'map' | 'route' | 'pins' | 'game';

interface Props {
  active: Tab;
  pinCount: number;
  onSelect: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; Icon: typeof MapIcon }[] = [
  { id: 'map', label: 'Karte', Icon: MapIcon },
  { id: 'route', label: 'Fahrplan', Icon: TrainIcon },
  { id: 'pins', label: 'Orte', Icon: PinIcon },
  { id: 'game', label: 'Spiel', Icon: FlagIcon },
];

export function TabBar({ active, pinCount, onSelect }: Props) {
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`tab ${active === id ? 'active' : ''}`}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <span className="tab-icon">
            <Icon size={24} />
            {id === 'pins' && pinCount > 0 && <span className="badge">{pinCount}</span>}
          </span>
          <span className="tab-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
