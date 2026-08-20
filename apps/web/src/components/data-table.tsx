import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';

export function DataTable<T>({ data, columns, emptyText = 'Belum ada data.' }: { data: T[]; columns: ColumnDef<T>[]; emptyText?: string }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <div className="table-shell">
      <table className="native-table">
        <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>
          {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : <tr><td colSpan={columns.length}><div className="table-empty">{emptyText}</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
