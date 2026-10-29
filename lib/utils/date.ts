export type DateLike = Date | string | null | undefined
function toValidDate(value:DateLike):Date|null{if(!value)return null;const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?null:date}
export function toDateInputValue(value:DateLike):string{
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value
 const date=toValidDate(value)
 return date?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):''
}
export function toDateTimeLocalInputValue(value:DateLike):string{
 const date=toValidDate(value);if(!date)return ''
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T')
}
export function formatDisplayDate(value:DateLike):string{return toDateInputValue(value)||'-'}
export function formatDisplayDateTime(value:DateLike):string{return toDateTimeLocalInputValue(value).replace('T',' ')||'-'}
export function normalizeBusinessDateTime(value:string){
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))return value+'+09:00'
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value+'T00:00:00+09:00'
 return value
}
