import { rawUser,rawDatabase,rawError } from '@/lib/raw/server'
import { getWorkReport,workFiltersSchema } from '@/lib/raw/work-report'
export const runtime='nodejs'
export async function GET(request:Request){try{await rawUser();const p=new URL(request.url).searchParams;const filters=workFiltersSchema.parse({from:p.get('from'),to:p.get('to'),company_id:p.get('company_id'),deal_id:p.get('deal_id')});return Response.json(await getWorkReport(rawDatabase,filters),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
