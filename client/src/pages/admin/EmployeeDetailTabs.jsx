import EmptyState from '../../components/EmptyState.jsx';

function DefinitionList({ rows }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-text-muted">{label}</dt>
          <dd className="text-sm text-text">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PersonalTab({ employee }) {
  return (
    <DefinitionList
      rows={[
        ['Email', employee.email],
        ['Phone', employee.phone],
        ['Address', employee.address],
        ['Date of joining', employee.dateOfJoining],
      ]}
    />
  );
}

export function JobTab({ employee }) {
  return (
    <DefinitionList
      rows={[
        ['Employee code', employee.employeeCode],
        ['Designation', employee.designation],
        ['Department', employee.department?.name],
        ['Role', employee.role],
      ]}
    />
  );
}

export function SalaryTab({ employee }) {
  if (!employee.currentSalary) {
    return (
      <EmptyState
        icon="💵"
        title="No salary structure on file"
        description="Set one up from the Payroll screen once it's built."
      />
    );
  }
  return (
    <div>
      <p className="text-xs text-text-muted">Current annual CTC</p>
      <p className="text-2xl font-semibold text-text">{Number(employee.currentSalary.ctcAnnual).toLocaleString()}</p>
      <p className="mt-2 text-xs text-text-muted">Full structure and version history live in Payroll.</p>
    </div>
  );
}

export function DocumentsTab({ documents }) {
  if (!documents?.length) {
    return <EmptyState icon="📄" title="No documents yet" description="Uploaded documents will show up here." />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-sm text-text">{d.originalName}</p>
            <p className="text-xs text-text-muted">{d.docType} · {Math.round(d.sizeBytes / 1024)} KB</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
