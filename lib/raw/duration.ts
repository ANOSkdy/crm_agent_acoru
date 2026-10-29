export const MAX_WORK_MINUTES=1440
export function explicitDuration(quote:string,expression:string|null):number|null{
 if(!expression||!quote.includes(expression)||/予定|計画|見込み|見積工数|目標|上限|明日|来週|planned|scheduled|estimate|will\b/i.test(quote))return null
 const text=expression.normalize('NFKC').trim()
 const match=/^(?:(\d+(?:\.\d+)?)\s*(?:h|時間)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:m|分))?$/i.exec(text)
 if(!match||(!match[1]&&!match[2]))return null
 const value=Number(match[1]??0)*60+Number(match[2]??0)
 return Number.isInteger(value)&&value>0&&value<=MAX_WORK_MINUTES?value:null
}
