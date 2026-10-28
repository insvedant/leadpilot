import { AdminShell } from '@/components/admin/AdminShell';
import { MeProvider } from '@/lib/me';

export const metadata = { title: 'Admin' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <AdminShell>{children}</AdminShell>
    </MeProvider>
  );
}
