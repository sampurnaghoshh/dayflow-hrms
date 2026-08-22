import { useState } from 'react';
import Button from '../../components/Button.jsx';
import Card from '../../components/Card.jsx';
import Table from '../../components/Table.jsx';
import Badge from '../../components/Badge.jsx';
import FormField from '../../components/FormField.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Skeleton from '../../components/Skeleton.jsx';

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger'];
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'];

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status', render: (row) => <Badge status={row.status} /> },
];
const sampleRows = [
  { id: 1, name: 'Ava Thompson', status: 'APPROVED' },
  { id: 2, name: 'Marcus Lee', status: 'PENDING' },
];

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

// Temporary dev-only route (/kit) — remove once every component has been used for real.
export default function ComponentKit() {
  const [name, setName] = useState('');

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 p-6">
      <h1 className="text-2xl font-semibold text-text">Component kit</h1>

      <Section title="Button">
        <div className="flex flex-wrap gap-3">
          {VARIANTS.map((v) => <Button key={v} variant={v}>{v}</Button>)}
        </div>
        <div className="flex flex-wrap gap-3">
          {VARIANTS.map((v) => <Button key={`${v}-loading`} variant={v} loading>{v}</Button>)}
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Card">
        <Card title="Card title">
          <p className="text-sm text-text-muted">Default padding, border and shadow — from tokens only.</p>
        </Card>
      </Section>

      <Section title="Badge — leave status">
        <div className="flex flex-wrap gap-2">
          {LEAVE_STATUSES.map((s) => <Badge key={s} status={s} />)}
        </div>
      </Section>

      <Section title="Badge — attendance status">
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE_STATUSES.map((s) => <Badge key={s} status={s} />)}
        </div>
      </Section>

      <Section title="FormField">
        <FormField id="kit-name" label="Full name" hint="As it appears on your ID." value={name} onChange={(e) => setName(e.target.value)} />
        <FormField id="kit-email" label="Email" error="Enter a valid email address." required />
      </Section>

      <Section title="Table — with data">
        <Table columns={columns} rows={sampleRows} />
      </Section>
      <Section title="Table — loading">
        <Table columns={columns} rows={[]} loading />
      </Section>
      <Section title="Table — empty">
        <Table
          columns={columns}
          rows={[]}
          emptyTitle="No employees yet"
          emptyDescription="Invite your first teammate to get started."
          emptyAction={<Button>Invite employee</Button>}
        />
      </Section>

      <Section title="EmptyState">
        <EmptyState
          icon="📭"
          title="No leave requests"
          description="Apply for leave to see it here."
          action={<Button variant="secondary">Apply for leave</Button>}
        />
      </Section>

      <Section title="Skeleton">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Section>
    </div>
  );
}
