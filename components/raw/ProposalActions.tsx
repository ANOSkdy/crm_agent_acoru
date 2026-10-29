'use client'
export function ProposalActions({busy,onPrimary,onReject,label='この内容で反映'}:{busy:boolean;onPrimary:()=>void;onReject:()=>void;label?:string}){
 return <div className="flex flex-wrap gap-3"><button className="btn btn--primary" disabled={busy} onClick={onPrimary}>{busy?'処理中…':label}</button><button className="btn btn--secondary" disabled={busy} onClick={onReject}>却下</button></div>
}
