import 'server-only'
import { AppError } from '@/lib/http/errors'
import { RAW_MAX_BYTES, RAW_MAX_FILES } from './domain'
export const RAW_REQUEST_BYTES=RAW_MAX_BYTES*RAW_MAX_FILES*6+65536
export function sameOrigin(req:Request){
 const target=new URL(req.url),origin=req.headers.get('origin'),host=req.headers.get('host')??target.host
 // Next can reconstruct a loopback URL while retaining the browser's actual Host.
 // Never accept an arbitrary x-forwarded-host as a CSRF allowlist.
 if(!origin||origin!==target.protocol+'//'+host||req.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'送信元を確認できません')
}
export async function rawBody(req:Request,limit=RAW_REQUEST_BYTES):Promise<unknown>{
 if(!req.headers.get('content-type')?.includes('application/json'))throw new AppError(415,'JSON形式で送信してください')
 if(Number(req.headers.get('content-length')??0)>limit)throw new AppError(413,'入力が大きすぎます')
 const reader=req.body?.getReader();if(!reader)throw new AppError(400,'入力がありません')
 const chunks:Uint8Array[]=[];let size=0
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new AppError(413,'入力が大きすぎます')}chunks.push(value)}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)))}catch{throw new AppError(400,'入力形式が不正です')}
}
