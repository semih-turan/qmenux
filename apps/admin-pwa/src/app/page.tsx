import { ManagementShell } from '@qmenux/ui/management-shell';
import SignIn from './sign-in';

export default function Page() {
  return <ManagementShell title="İşletme yönetimi"><SignIn /></ManagementShell>;
}
