import 'server-only'
import { createHash,randomBytes } from 'node:crypto'
import type { CrmDatabase } from '../auth/crm-policy'
import { AppError } from '../http/errors'
const hash=(token:string)=>createHash('sha256').update(token).digest('hex')
export class RawCredentials{
 constructor(readonly db:CrmDatabase){}
 async issue(actor:string,label:string){
  const token='raw_'+randomBytes(32).toString('hex')
  const [row]=await this.db.query(`INSERT INTO raw_ingest_credentials(user_id,label,secret_hash,expires_at)
   SELECT id,$2,$3,now()+interval '30 days' FROM users WHERE id=$1 AND is_active AND role IN ('admin','member') RETURNING id,label,expires_at`,[actor,label,hash(token)])
  if(!row)throw new AppError(403,'操作権限がありません')
  return {id:row.id as string,label:row.label as string,expires_at:row.expires_at as string,token}
 }
 async list(actor:string){return this.db.query('SELECT id,label,created_at,expires_at,revoked_at,last_used_at FROM raw_ingest_credentials WHERE user_id=$1 ORDER BY created_at DESC',[actor])}
 async revoke(actor:string,id:string){await this.db.query('UPDATE raw_ingest_credentials SET revoked_at=now() WHERE user_id=$1 AND id=$2',[actor,id])}
 async authenticate(authorization:string|null){
  const token=authorization?.match(/^Bearer (raw_[a-f0-9]{64})$/)?.[1]
  if(!token)throw new AppError(401,'同期用認証を確認してください')
  const [row]=await this.db.query(`UPDATE raw_ingest_credentials t SET last_used_at=now() FROM users u
   WHERE t.secret_hash=$1 AND t.scope='raw:ingest' AND t.revoked_at IS NULL AND t.expires_at>now()
    AND u.id=t.user_id AND u.is_active AND u.role IN ('admin','member') RETURNING t.user_id`,[hash(token)])
  if(!row)throw new AppError(401,'同期用認証を確認してください')
  return row.user_id as string
 }
}
