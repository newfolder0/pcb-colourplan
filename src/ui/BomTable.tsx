import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import type { BomRow } from '../core/bom/derive';
import { BRIGHT_PALETTE, colourAt } from '../core/colourplan/palette';
import type { Side } from '../core/model/types';
import { useStore } from '../state/store';

const sidesLabel = (sides: Side[]): string => {
  const top = sides.includes('F');
  const bot = sides.includes('B');
  if (top && bot) return 'Top+Bot';
  return bot ? 'Bot' : 'Top';
};

const col = createColumnHelper<BomRow>();

export function BomTable() {
  const bom = useStore((s) => s.bom);
  const selection = useStore((s) => s.selection);
  const toggleGroup = useStore((s) => s.toggleGroup);
  const setHoverGroup = useStore((s) => s.setHoverGroup);
  const clearSelection = useStore((s) => s.clearSelection);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState('');

  const colourByGroup = useMemo(() => {
    const m = new Map<string, string>();
    selection.forEach((k, i) => m.set(k, colourAt(BRIGHT_PALETTE, i)));
    return m;
  }, [selection]);

  const columns = useMemo<ColumnDef<BomRow, string>[]>(() => {
    const base = [
      col.accessor((r) => r.refs.join(', '), {
        id: 'refs',
        header: 'Refs',
        cell: (c) => <span className="refs">{c.getValue()}</span>,
      }),
      col.accessor((r) => r.value, { id: 'value', header: 'Value' }),
      col.accessor((r) => r.footprint, { id: 'footprint', header: 'Footprint' }),
      col.accessor((r) => String(r.quantity), {
        id: 'qty',
        header: 'Qty',
        sortingFn: (a, b) => a.original.quantity - b.original.quantity,
      }),
      col.accessor((r) => sidesLabel(r.sides), { id: 'side', header: 'Side' }),
      col.accessor((r) => r.mount, { id: 'mount', header: 'Mount' }),
      col.accessor((r) => (r.dnp ? 'DNP' : ''), { id: 'dnp', header: 'DNP' }),
    ] as ColumnDef<BomRow, string>[];

    const props = (bom?.propertyKeys ?? []).map((key) =>
      col.accessor((r) => r.properties[key] ?? '', { id: `prop:${key}`, header: key }),
    ) as ColumnDef<BomRow, string>[];

    return [...base, ...props];
  }, [bom?.propertyKeys]);

  const table = useReactTable({
    data: bom?.rows ?? [],
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!bom) return null;
  const rows = table.getRowModel().rows;

  return (
    <div className="bom-panel">
      <div className="bom-toolbar">
        <input
          className="search"
          placeholder="Filter parts…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="muted small">
          {rows.length} / {bom.rows.length} lines
        </span>
        {selection.length > 0 && (
          <button className="link" onClick={clearSelection}>
            clear {selection.length} selected
          </button>
        )}
      </div>
      <div className="bom-scroll">
        <table className="bom">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="swatch-col" />
                {hg.headers.map((h) => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()} className="sortable">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[h.column.getIsSorted() as string] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = row.original.groupKey;
              const colour = colourByGroup.get(key);
              return (
                <tr
                  key={key}
                  className={`${colour ? 'selected' : ''} ${row.original.dnp ? 'dnp' : ''}`}
                  onClick={() => toggleGroup(key)}
                  onMouseEnter={() => setHoverGroup(key)}
                  onMouseLeave={() => setHoverGroup(null)}
                >
                  <td className="swatch-col">
                    <span className="swatch" style={{ background: colour ?? 'transparent' }} />
                  </td>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
