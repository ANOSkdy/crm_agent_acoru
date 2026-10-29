import 'server-only'
import { getSql } from '@/lib/db'
import { requireApiUser } from '@/lib/auth/deal-permissions'
import { assertCrmUser } from '@/lib/auth/crm-policy'
import { AppError } from '@/lib/http/errors'
import { RawRepository } from './repository'
export const rawDatabase={ query:(q:string,p?:unknown[])=>getSql().query(q,p) }
export function rawRepository(){return new RawRepository(rawDatabase)}
export const rawFlags=()=>({ingest:process.env.RAW_INGEST_ENABLED==='true',extraction:process.env.RAW_EXTRACTION_ENABLED==='true',apply:process.env.RAW_APPLY_ENABLED==='true',sync:process.env.RAW_SYNC_ENABLED==='true'})
export function requireRawFlag(flag:keyof ReturnType<typeof rawFlags>){if(!rawFlags()[flag])throw new AppError(503,'この操作は現在停止しています')}
export async function rawUser(write=false){return assertCrmUser(await requireApiUser(),write)}
export function rawError(error:unknown) {
 if(error instanceof AppError)return Response.json({error:error.message},{status:error.status})
 // Never return arbitrary provider/DB/input messages.
 const code=error instanceof Error ? error.message : ''
 const known:Record<string,string>={RAW_SIZE:'空のファイルまたは256 KiBを超えています',RAW_EXTENSION:'MD/TXTファイルを選択してください',RAW_ENCODING:'UTF-8テキストを使用してください',RAW_BINARY:'バイナリ・制御文字は保存できません',RAW_HASH:'内容の整合性を確認できません',RAW_PATH:'相対パスが不正です',RAW_FILENAME:'ファイル名が不正です',RAW_IDENTITY:'同期文書IDが不正です',RAW_EMPTY:'本文を入力してください'}
 return Response.json({error:known[code]??'処理できませんでした。入力内容・権限・接続設定を確認してください'}, {status:code.includes('CONFLICT')?409:400})
}
