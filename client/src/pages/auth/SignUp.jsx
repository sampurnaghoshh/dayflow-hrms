import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';

// CLAUDE.md §8: ≥8 chars, 1 upper, 1 lower, 1 digit — enforced here AND in Zod on the real backend.
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number', test: (pw) => /\d/.test(pw) },
];

export default function SignUp() {
  const [employeeCode, setEmployeeCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const passwordValid = useMemo(() => PASSWORD_RULES.every((r) => r.test(password)), [password]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!employeeCode || !email) {
      setError('Fill in your employee code and email.');
      return;
    }
    if (!passwordValid) {
      setError('Your password needs to meet every rule below.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post('/auth/register', { employeeCode, email, password, role });
      setCreated(result);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <Card className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-xl font-semibold text-text">Check your inbox</h1>
          <p className="mb-4 text-sm text-text-muted">
            We sent a verification link to {created.email}. This build has no real mail server, so use the link below.
          </p>
          <Link to={created.verificationUrl} className="text-sm font-medium text-primary hover:text-primary-hover">
            Verify {created.email}
          </Link>
          <p className="mt-6 text-sm text-text-muted">
            <Link to="/sign-in" className="font-medium text-primary hover:text-primary-hover">Back to sign in</Link>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-text">Create your account</h1>
        <p className="mb-6 text-sm text-text-muted">Sign up with your employee code to get started.</p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <FormField id="signup-code" label="Employee code" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
          <FormField id="signup-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />

          <div className="flex flex-col gap-2">
            <FormField
              id="signup-password" label="Password" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            <ul className="flex flex-col gap-1 text-xs" aria-live="polite">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password);
                return (
                  <li key={rule.label} className={met ? 'text-success' : 'text-text-muted'}>
                    {met ? '✓' : '○'} {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <FormField id="signup-role" label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="HR">HR</option>
              <option value="ADMIN">Admin</option>
            </select>
          </FormField>

          <Button type="submit" loading={submitting} className="mt-2 w-full">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-medium text-primary hover:text-primary-hover">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
