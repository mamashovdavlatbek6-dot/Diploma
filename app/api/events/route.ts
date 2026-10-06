import { snapshot,sourceFrom } from '@/server/services/pipeline';import { toErrorResponse } from '@/server/security/errors';import { enforceRateLimit,RATE_LIMITS } from '@/server/security/rate-limit';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=15;
export async function GET(request:Request){try{const headers=await enforceRateLimit(request,RATE_LIMITS.read);return Response.json(await snapshot(sourceFrom(request)),{headers:{...headers,'Cache-Control':'no-store'}});}catch(e){return toErrorResponse(e);}}
