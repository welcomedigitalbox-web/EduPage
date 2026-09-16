import { admin } from './supabase';

export interface Staff {
  id: string;
  email: string;
  name: string | null;
  role: 'agent' | 'manager';
}

// Everyone on the POS staff list who may open EduPage, and as what.
//
// Accounts are created and disabled on the POS — there is no separate user
// list here any more, so an online seller is the same person as the employee
// record, and adding one is a single job in one place.
export async function msgrStaff(): Promise<Staff[]> {
  const { data } = await admin()
    .from('profiles')
    .select('id,email,full_name,role,department')
    .order('email');

  const rows = (data ?? []) as {
    id: string;
    email: string | null;
    full_name?: string | null;
    role: string | null;
    department: string | null;
  }[];

  // Mirrors msgr_role_for() in the database. Kept in step with it: the
  // function decides who actually gets in, this only decides who is listed.
  const roleOf = (r: string | null, dept: string | null): 'agent' | 'manager' | null => {
    if (r && ['admin', 'owner', 'operation_director', 'marketing_manager'].includes(r)) {
      return 'manager';
    }
    if (dept === 'marketing') return 'manager';
    if (r && ['online_sale', 'wholesale', 'sale_manager'].includes(r)) return 'agent';
    return null;
  };

  return rows.flatMap((p) => {
    const role = roleOf(p.role, p.department);
    if (!role) return [];
    return [{ id: p.id, email: p.email ?? '', name: p.full_name ?? null, role }];
  });
}
