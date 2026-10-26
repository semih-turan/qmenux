-- Restores the 0001 behaviour (link-bearer acceptance). Owner and grants are unchanged by REPLACE.
CREATE OR REPLACE FUNCTION qx.accept_invite(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
DECLARE v_user uuid := qx.current_user_id(); v_tenant uuid; v_role text;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;
  UPDATE qx.member_invites SET accepted_at = now()
   WHERE token_hash = p_token_hash AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
   RETURNING tenant_id, role INTO v_tenant, v_role;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  INSERT INTO qx.memberships (tenant_id, user_id, role) VALUES (v_tenant, v_user, v_role)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  INSERT INTO qx.audit_logs (tenant_id, actor_user_id, actor_kind, action, target_type, target_id)
    VALUES (v_tenant, v_user, 'member', 'member.accept_invite', 'user', v_user::text);
  RETURN v_tenant;
END $$;

REVOKE SELECT (id, email, email_verified) ON qx.users FROM qmenux_definer;
DROP POLICY definer_read ON qx.users;
