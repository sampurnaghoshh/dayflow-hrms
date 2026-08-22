import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import Card from '../../components/Card.jsx';
import Button from '../../components/Button.jsx';
import FormField from '../../components/FormField.jsx';

export default function SignIn() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (or just signed in) — send to the right home for the role.
  useEffect(() => {
    if (user) navigate(user.role === 'EMPLOYEE' ? '/' : '/admin', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-text">Sign in to Dayflow</h1>
        <p className="mb-6 text-sm text-text-muted">Welcome back. Enter your details to continue.</p>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {error && (
            <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <FormField
            id="signin-email" label="Email" type="email" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <FormField
            id="signin-password" label="Password" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" loading={submitting} className="mt-2 w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          New to Dayflow?{' '}
          <Link to="/sign-up" className="font-medium text-primary hover:text-primary-hover">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}
