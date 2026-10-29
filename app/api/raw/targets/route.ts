import { rawUser,rawError,rawDatabase } from '@/lib/raw/server'
import { extractionService } from '@/lib/raw/provider'
export const runtime='nodejs'
export async function GET(request:Request){try{const user=await rawUser();const query=(new URL(request.url).searchParams.get('q')??'').slice(0,200);const [targets,companies,workers]=await Promise.all([extractionService().targets(user.id,query),rawDatabase.query("SELECT id,name FROM companies WHERE deleted_at IS NULL AND ($1='' OR name ILIKE '%'||$1||'%') ORDER BY name,id LIMIT 50",[query]),rawDatabase.query('SELECT id,name FROM users WHERE is_active ORDER BY name,id LIMIT 100')]);return Response.json({targets,companies,workers},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return rawError(e)}}
