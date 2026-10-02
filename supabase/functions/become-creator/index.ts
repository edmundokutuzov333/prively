import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/auth.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') {
    return jsonResponse({ code: 'method_not_allowed' }, 405, request);
  }

  try {
    const { client, user } = await requireUser(request);

    const { data: alreadyCreator, error: roleError } = await client.rpc('has_role', {
      _uid: user.id,
      _role: 'creator',
    });

    if (roleError) {
      return jsonResponse({ code: 'role_check_failed' }, 503, request);
    }

    if (alreadyCreator === true) {
      return jsonResponse({ ok: true, creator: true, created: false }, 200, request);
    }

    const { data: kyc, error: kycError } = await client
      .from('kyc_verifications')
      .select('status,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (kycError) {
      return jsonResponse({ code: 'kyc_status_unavailable' }, 503, request);
    }

    if (!kyc) {
      return jsonResponse({ code: 'kyc_required' }, 403, request);
    }

    if (kyc.status === 'pending' || kyc.status === 'review') {
      return jsonResponse({ code: 'kyc_pending' }, 409, request);
    }

    if (kyc.status !== 'approved') {
      return jsonResponse({ code: 'kyc_required' }, 403, request);
    }

    const { data: ageVerified, error: ageError } = await client.rpc('is_age_verified', {
      _uid: user.id,
    });

    if (ageError) {
      return jsonResponse({ code: 'age_verification_unavailable' }, 503, request);
    }

    if (ageVerified !== true) {
      return jsonResponse({ code: 'age_not_verified' }, 403, request);
    }

    const admin = serviceClient();
    const { data: created, error: grantError } = await admin.rpc('grant_creator_role', {
      _uid: user.id,
    });

    if (grantError) {
      const code = grantError.message.split(':')[0].trim();
      const status =
        code === 'kyc_required' || code === 'age_not_verified' ? 403 :
        code === 'user_not_found' ? 404 :
        422;
      return jsonResponse({ code }, status, request);
    }

    return jsonResponse({
      ok: true,
      creator: true,
      created: created === true,
    }, 200, request);
  } catch (error) {
    const code = error instanceof Error ? error.message.split(':')[0].trim() : 'become_creator_failed';
    return jsonResponse(
      { code },
      code === 'unauthorized' ? 401 : 400,
      request,
    );
  }
});
