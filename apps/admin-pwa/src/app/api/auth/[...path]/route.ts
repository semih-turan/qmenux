import { handleAuth } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export { handleAuth as GET, handleAuth as POST, handleAuth as HEAD, handleAuth as OPTIONS,
  handleAuth as PUT, handleAuth as PATCH, handleAuth as DELETE };
