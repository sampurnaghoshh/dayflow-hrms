import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { prettyStatus } from '../../lib/statusLabels.js';
import { PersonalTab, JobTab, SalaryTab, DocumentsTab } from './EmployeeDetailTabs.jsx';

const TABS = [
  { key: 'personal', label: 'Personal' },
  { key: 'job', label: 'Job' },
  { key: 'salary', label: 'Salary' },
  { key: 'documents', label: 'Documents' },
];

export default function EmployeeDetail() {
  const { id } = useParams();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('personal');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/employees/${id}`)
      .then((res) => { if (!cancelled) setEmployee(res); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load this employee.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="p-6">
        <EmptyState icon="🚫" title="Couldn't load this employee" description={error || 'Not found.'} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        {employee.profilePhotoPath ? (
          <img src={employee.profilePhotoPath} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-lg font-semibold text-text-muted">
            {employee.fullName?.[0] ?? '?'}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-text">{employee.fullName}</h1>
          <p className="text-sm text-text-muted">{employee.employeeCode} · {employee.designation ?? '—'}</p>
        </div>
        <Badge status={employee.status} className="ml-auto">{prettyStatus(employee.status)}</Badge>
      </div>

      <nav className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <Card>
        {tab === 'personal' && <PersonalTab employee={employee} />}
        {tab === 'job' && <JobTab employee={employee} />}
        {tab === 'salary' && <SalaryTab employee={employee} />}
        {tab === 'documents' && <DocumentsTab documents={employee.documents} />}
      </Card>
    </div>
  );
}
