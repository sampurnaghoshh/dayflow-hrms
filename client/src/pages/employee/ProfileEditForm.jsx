import { useState } from 'react';
import { api } from '../../api/client.js';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';

const EMPLOYEE_HINT = 'Contact HR to change this.';

// SRS 3.3.2: an EMPLOYEE may only send phone and address; every other field here is
// disabled with a hint explaining why, rather than hidden — so it's clear what exists and
// why it can't be touched here, not just that it's missing. ADMIN (canEditAll) gets all six.
export default function ProfileEditForm({ employee, canEditAll, onSaved }) {
  const [form, setForm] = useState({
    fullName: employee.fullName ?? '',
    email: employee.email ?? '',
    designation: employee.designation ?? '',
    dateOfJoining: employee.dateOfJoining ?? '',
    phone: employee.phone ?? '',
    address: employee.address ?? '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const body = canEditAll ? form : { phone: form.phone, address: form.address };
    setSubmitting(true);
    try {
      const updated = await api.patch(`/employees/${employee.id}`, body);
      setSuccess('Changes saved.');
      onSaved(updated);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const fields = [
    { key: 'fullName', label: 'Full name', editable: canEditAll },
    { key: 'email', label: 'Email', type: 'email', editable: canEditAll },
    { key: 'designation', label: 'Designation', editable: canEditAll },
    { key: 'dateOfJoining', label: 'Date of joining', type: 'date', editable: canEditAll },
    { key: 'phone', label: 'Phone', editable: true },
    { key: 'address', label: 'Address', editable: true },
  ];

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      {error && <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      {success && <p role="status" className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">{success}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <FormField
            key={f.key} id={`profile-${f.key}`} label={f.label} type={f.type ?? 'text'}
            value={form[f.key]} onChange={(e) => update(f.key, e.target.value)}
            disabled={!f.editable}
            hint={!f.editable ? EMPLOYEE_HINT : undefined}
          />
        ))}
      </div>

      <div>
        <Button type="submit" loading={submitting}>Save changes</Button>
      </div>
    </form>
  );
}
