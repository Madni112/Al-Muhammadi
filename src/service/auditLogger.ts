import { supabase } from '../Context/supabaseClient';

export interface AuditLogPayload {
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
  tableName: string;
  details: Record<string, any>;
  performedBy?: string;
}

/**
 * Centrally records any business activity into the `audit_logs` table.
 * Designed to be non-blocking and fail-safe (errors are caught and logged).
 */
export async function logActivity({
  action,
  tableName,
  details,
  performedBy
}: AuditLogPayload): Promise<void> {
  try {
    let userEmail = performedBy;

    if (!userEmail && typeof window !== 'undefined') {
      try {
        userEmail =
          localStorage.getItem('zac_user_email') ||
          localStorage.getItem('zac_user_name') ||
          'System User';
      } catch (_) {
        userEmail = 'System User';
      }
    }

    const logEntry = {
      action_type: action,
      table_name: tableName,
      performed_by: userEmail || 'System User',
      details: {
        ...details,
        timestamp: new Date().toISOString(),
      },
    };

    await supabase.from('audit_logs').insert([logEntry]);
  } catch (err) {
    // Non-blocking catch to ensure UI operations are never interrupted
    console.warn('Audit log capture note:', err);
  }
}
