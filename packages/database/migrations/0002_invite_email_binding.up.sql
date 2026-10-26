-- 0002: invites are bound to the invited, provider-verified e-mail address.
-- Before this, anyone holding a leaked invite link could join the tenant.

-- accept_invite is the only definer function that reads users, and only these columns.
CREATE POLICY definer_read ON qx.users FOR SELECT TO qmenux_definer USING (true);
GRANT SELECT (id, email, email_verified) ON qx.users TO qmenux_definer;

CREATE OR REPLACE FUNCTION qx.accept_invite(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = qx, pg_temp AS $$
DECLARE v_user uuid := qx.current_user_id(); v_tenant uuid; v_role text;
BEGIN
  IF v_user IS NULL THEN RETURN NULL; END IF;
  UPDATE qx.member_invites i SET accepted_at = now()
    FROM qx.users u
   WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
     AND u.id = v_user AND u.email_verified AND lower(u.email) = lower(i.email)
   RETURNING i.tenant_id, i.role INTO v_tenant, v_role;
  IF v_tenant IS NULL THEN RETURN NULL; END IF;
  INSERT INTO qx.memberships (tenant_id, user_id, role) VALUES (v_tenant, v_user, v_role)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
  INSERT INTO qx.audit_logs (tenant_id, actor_user_id, actor_kind, action, target_type, target_id)
    VALUES (v_tenant, v_user, 'member', 'member.accept_invite', 'user', v_user::text);
  RETURN v_tenant;
END $$;
