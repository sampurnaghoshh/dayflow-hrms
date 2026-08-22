import EmptyState from './EmptyState.jsx';
import Skeleton from './Skeleton.jsx';

const SKELETON_ROWS = 5;

// columns: [{ key, header, render?(row) }]. rows: plain objects, keyed by rowKey(row).
export default function Table({
  columns,
  rows,
  loading = false,
  rowKey = (row) => row.id,
  emptyTitle = 'No data yet',
  emptyDescription,
  emptyAction,
  className = '',
}) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border bg-surface ${className}`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-surface-alt">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-medium text-text-muted">{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={`skeleton-${i}`} className="border-b border-border last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="p-0">
                <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-surface-alt">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-text">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
