import { Link, useNavigate } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Skeleton from '../../components/Skeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Button from '../../components/Button.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function RecentActivity({ items, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="🔔"
          title="No recent activity yet"
          description="Approvals, payslips and other updates will show up here."
          action={<Button variant="secondary" onClick={() => navigate('/leave/apply')}>Apply for leave</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const body = (
          <Card className={`flex flex-col gap-1 ${item.link ? 'hover:border-primary' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text">{item.title}</span>
              {!item.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            </div>
            {item.body && <span className="text-sm text-text-muted">{item.body}</span>}
            <span className="text-xs text-text-muted">{formatDate(item.createdAt)}</span>
          </Card>
        );
        return item.link ? (
          <Link key={item.id} to={item.link} className="block rounded-lg">{body}</Link>
        ) : (
          <div key={item.id}>{body}</div>
        );
      })}
    </div>
  );
}
