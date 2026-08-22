import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import Card from '../../components/Card.jsx';
import Button from '../../components/Button.jsx';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('This verification link is missing a token.');
      return undefined;
    }
    let cancelled = false;
    api
      .get('/auth/verify', { token })
      .then(() => { if (!cancelled) setStatus('success'); })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setError(err.message || 'This verification link is invalid or has expired.');
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm text-center">
        {status === 'loading' && <p className="text-sm text-text-muted">Verifying your email…</p>}

        {status === 'success' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-text">Email verified</h1>
            <p className="mb-6 text-sm text-text-muted">Your account is active. You can sign in now.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="mb-2 text-xl font-semibold text-text">We couldn't verify that link</h1>
            <p role="alert" className="mb-6 text-sm text-danger">{error}</p>
          </>
        )}

        {status !== 'loading' && (
          <Button onClick={() => navigate('/sign-in')}>Go to sign in</Button>
        )}
      </Card>
    </div>
  );
}
