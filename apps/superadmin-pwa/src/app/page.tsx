import OperatorSignIn from './operator-sign-in';
import { ManagementShell } from '@qmenux/ui/management-shell';

export default function Page() {
  return <ManagementShell title="Platform yönetimi"><OperatorSignIn /></ManagementShell>;
}
