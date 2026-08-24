import { useRef, useState, type ReactNode } from 'react';

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  /** Rendu d'une ligne. `handle` doit etre pose sur la poignee de glissement. */
  children: (item: T, index: number, handle: HandleProps) => ReactNode;
  onReorder: (from: number, to: number) => void;
  /** Libelle accessible de l'element deplace, pour l'annonce vocale. */
  labelOf: (item: T) => string;
}

export interface HandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
  'aria-hidden': true;
}

/**
 * Liste reordonnable au doigt.
 *
 * Implementee sur les Pointer Events et non sur l'API drag-and-drop HTML5,
 * qui ne se declenche pas au toucher sur mobile — or c'est le seul support
 * qui compte ici. `touch-action: none` sur la poignee empeche la page de
 * defiler pendant le glissement.
 *
 * Le glissement ne remplace pas les fleches : elles restent le chemin sur
 * lequel on peut compter avec des doigts fatigues, et le seul utilisable au
 * clavier.
 */
export function ReorderList<T>({ items, keyOf, children, onReorder, labelOf }: Props<T>) {
  const [drag, setDrag] = useState<{ index: number; offset: number } | null>(null);
  const rowsRef = useRef<(HTMLDivElement | null)[]>([]);
  const startY = useRef(0);
  const rowHeight = useRef(0);

  const shiftFor = (index: number): number => {
    if (drag === null || rowHeight.current === 0) return 0;
    const target = targetIndex();
    if (index === drag.index) return drag.offset;
    // Les lignes survolees s'ecartent pour montrer ou l'element atterrira.
    if (drag.index < index && index <= target) return -rowHeight.current;
    if (target <= index && index < drag.index) return rowHeight.current;
    return 0;
  };

  const targetIndex = (): number => {
    if (drag === null || rowHeight.current === 0) return 0;
    const moved = Math.round(drag.offset / rowHeight.current);
    return Math.min(items.length - 1, Math.max(0, drag.index + moved));
  };

  const onPointerDown = (index: number) => (e: React.PointerEvent) => {
    const row = rowsRef.current[index];
    if (!row) return;
    rowHeight.current = row.getBoundingClientRect().height;
    startY.current = e.clientY;
    setDrag({ index, offset: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag === null) return;
    setDrag({ index: drag.index, offset: e.clientY - startY.current });
  };

  const onPointerUp = () => {
    if (drag === null) return;
    const to = targetIndex();
    if (to !== drag.index) onReorder(drag.index, to);
    setDrag(null);
  };

  return (
    <div onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {items.map((item, index) => {
        const dragging = drag?.index === index;
        return (
          <div
            key={keyOf(item)}
            ref={(el) => {
              rowsRef.current[index] = el;
            }}
            style={{
              transform: `translateY(${shiftFor(index)}px)`,
              transition: dragging ? 'none' : 'transform .15s ease',
              position: 'relative',
              zIndex: dragging ? 2 : 1,
              opacity: dragging ? 0.9 : 1,
            }}
            aria-label={dragging ? `${labelOf(item)}, en cours de déplacement` : undefined}
          >
            {children(item, index, {
              onPointerDown: onPointerDown(index),
              style: { touchAction: 'none', cursor: 'grab' },
              'aria-hidden': true,
            })}
          </div>
        );
      })}
    </div>
  );
}
