import { useEffect, useRef, useState } from 'react';
import { searchLocations, type SearchKind, type SearchResult } from '../lib/geoadmin';
import { CloseIcon, FlagIcon, MapIcon, MountainIcon, PinIcon, SearchIcon } from './Icons';

const KIND_ICON: Record<SearchKind, typeof MapIcon> = {
  gemeinde: MapIcon,
  plz: MapIcon,
  bezirk: MapIcon,
  kanton: FlagIcon,
  adresse: PinIcon,
  ort: MountainIcon,
  andere: SearchIcon,
};

interface Props {
  onSelect: (result: SearchResult) => void;
  onFocus: () => void;
}

export function SearchBar({ onSelect, onFocus }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      searchLocations(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setError(null);
          setActive(-1);
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') setError('Suche nicht erreichbar – bist du online?');
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 220);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [query]);

  // Klick ausserhalb schliesst die Trefferliste
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const choose = (r: SearchResult) => {
    onSelect(r);
    setQuery(r.title);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      const r = results[active] ?? results[0];
      if (r) choose(r);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div className="search" ref={boxRef}>
      <div className="search-field">
        <img className="search-logo" src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Ort, Adresse, Berg, PLZ …"
          aria-label="Ort suchen"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocus();
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls="search-results"
          aria-autocomplete="list"
        />
        {loading ? (
          <span className="spinner" aria-label="Sucht …" />
        ) : query ? (
          <button
            className="icon-btn subtle"
            aria-label="Suche leeren"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={18} />
          </button>
        ) : (
          <SearchIcon size={20} className="search-icon" />
        )}
      </div>
      {showList && (
        <ul className="search-results" id="search-results" role="listbox">
          {error && <li className="search-empty">{error}</li>}
          {!error && !loading && results.length === 0 && <li className="search-empty">Keine Treffer</li>}
          {results.map((r, i) => {
            const KindIcon = KIND_ICON[r.kind];
            return (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button className={i === active ? 'active' : ''} onClick={() => choose(r)}>
                <span className={`kind kind-${r.kind}`}>
                  <KindIcon size={18} />
                </span>
                <span className="result-text">
                  <strong>{r.title}</strong>
                  <small>{r.subtitle}</small>
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
