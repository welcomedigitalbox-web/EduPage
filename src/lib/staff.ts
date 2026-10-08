import { admin } from './supabase';

export interface Staff {
  id: string;
  email: string;
  name: string | null;
  role: 'agent' | 'manager';
  manual: boolean;
}

// Everyone on the POS staff list who may open EduPage, and as what.
//
// Accounts are created and disabled on the POS — there is no separate user
// list here any more, so an online seller is the same person as the employee
// record, and adding one is a single job in one place. What the job implies
// can be overruled by hand in msgr_access, which is where the exceptions
// live: someone let in who would not be, or kept out who would.
export async function msgrStaff(): Promise<Staff[]> {
  const [{ data: p }, { data: a }] = await Promise.all([
    admin().from('profiles').select('id,email,role,department').order('email'),
    admin().from('msgr_access').select('user_id,access'),
  ]);

  const rows = (p ?? []) as {
    id: string;
    email: string | null;
    role: string | null;
    department: string | null;
  }[];

  const override = new Map<string, string>();
  for (const r of (a ?? []) as { user_id: string; access: string }[]) {
    override.set(r.user_id, r.access);
  }

  // Mirrors msgr_role_for() in the database. Kept in step with it: the
  // function decides who actually gets in, this only decides who is listed.
  const byJob = (r: string | null, dept: string | null): 'agent' | 'manager' | null => {
    if (r && ['admin', 'owner', 'operation_director', 'marketing_manager'].includes(r)) {
      return 'manager';
    }
    if (dept === 'marketing') return 'manager';
    if (r && ['online_sale', 'wholesale', 'sale_manager'].includes(r)) return 'agent';
    return null;
  };

  return rows.flatMap((row) => {
    const set = override.get(row.id);
    if (set === 'none') return [];
    const role = (set === 'agent' || set === 'manager') ? set : byJob(row.role, row.department);
    if (!role) return [];
    return [{ id: row.id, email: row.email ?? '', name: null, role, manual: !!set }];
  });
}

// Everyone on the staff list, whether or not they may open EduPage — the
// pool a manager picks from when adding someone by hand.
export async function msgrCandidates() {
  const { data } = await admin()
    .from('profiles').select('id,email,role,department').order('email');
  return (data ?? []) as {
    id: string; email: string | null; role: string | null; department: string | null;
  }[];
}
