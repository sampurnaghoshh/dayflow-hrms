import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import Card from '../../components/Card.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { JobTab, SalaryTab, DocumentsTab } from '../admin/EmployeeDetailTabs.jsx';
import ProfileEditForm from './ProfileEditForm.jsx';
import PhotoUpload from './PhotoUpload.jsx';

export default function Profile() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canEditAll = user?.role === 'ADMIN';

  useEffect(() => {
    if (!user?.employeeId) return undefined;
    let cancelled = false;
    api.get(`/employees/${user.employeeId}`)
      .then((res) => { if (!cancelled) setEmployee(res); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load your profile.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.employeeId]);

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
        <EmptyState icon="🚫" title="Couldn't load your profile" description={error || 'Not found.'} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">Profile</h1>

      <PhotoUpload
        employeeId={employee.id}
        photoUrl={employee.profilePhotoPath}
        onUploaded={(path) => setEmployee((prev) => ({ ...prev, profilePhotoPath: path }))}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Personal</h2>
        <Card>
          <ProfileEditForm
            employee={employee}
            canEditAll={canEditAll}
            onSaved={(updated) => setEmployee((prev) => ({ ...prev, ...updated }))}
          />
        </Card>
        {!canEditAll && (
          <p className="text-xs text-text-muted">You can update your phone and address here. Contact HR to change anything else.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Job</h2>
        <Card><JobTab employee={employee} /></Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Salary summary</h2>
        <Card><SalaryTab employee={employee} /></Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text">Documents</h2>
        <Card><DocumentsTab documents={employee.documents} /></Card>
      </section>
    </div>
  );
}
