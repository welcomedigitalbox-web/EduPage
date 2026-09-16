import { APP_URL } from '@/lib/apps';

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'agent' | 'manager';
}

export interface UserLabels {
  email: string;
  name: string;
  role: string;
  agent: string;
  manager: string;
  agentHint: string;
  managerHint: string;
}

// Who can open EduPage, and as what. Read-only: accounts live on the POS
// staff list now, so someone's role here follows from the job they hold
// there rather than being set twice and drifting apart.
export function UserList({
  users, meId, labels,
}: { users: UserRow[]; meId: string; labels: UserLabels }) {
  const managers = users.filter((u) => u.role === 'manager');
  const agents = users.filter((u) => u.role === 'agent');

  const Group = ({ title, hint, rows }: { title: string; hint: string; rows: UserRow[] }) => (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="divide-y divide-edge rounded-lg border border-edge">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 p-2 text-sm">
              <span>
                {u.name || u.email}
                {u.id === meId && <span className="ml-2 text-xs text-muted">(you)</span>}
              </span>
              <span className="text-xs text-muted">{u.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Group title={labels.manager} hint={labels.managerHint} rows={managers} />
      <Group title={labels.agent} hint={labels.agentHint} rows={agents} />
      <p className="text-xs text-muted">
        Staff accounts are managed on the POS.{' '}
        <a href={`${APP_URL.pos}/admin/users`} className="underline">
          Open user management
        </a>
      </p>
    </div>
  );
}
