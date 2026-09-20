export type IconName='spark'|'panel'|'new'|'search'|'arrow'|'chevron'|'database'|'briefcase'|'chart'|'check'|'back'|'copy'|'edit'|'close'
const paths:Record<IconName,string>={
  spark:'M12 3 14.6 9.4 21 12 14.6 14.6 12 21 9.4 14.6 3 12 9.4 9.4Z',
  panel:'M4 4h16v16H4ZM9 4v16',new:'M12 5v14M5 12h14',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow:'M12 19V5M5 12l7-7 7 7',chevron:'m9 5 7 7-7 7',database:'M20 6c0 2.2-16 2.2-16 0s16-2.2 16 0ZM4 6v12c0 2.7 16 2.7 16 0V6M4 12c0 2.7 16 2.7 16 0',
  briefcase:'M3 7h18v14H3ZM8 7V3h8v4M3 12c6 3 12 3 18 0M10 13h4',chart:'M4 3v17h17M8 16v-5M13 16V7M18 16V4',
  check:'m8 12 3 3 5-6M20 12a8 8 0 1 1-5-7.4',back:'m10 5-7 7 7 7M3 12h18',copy:'M9 9h11v11H9ZM15 9V3H3v12h6',
  edit:'m14 5 5 5M3 21l5-1L21 7l-5-5L3 15Z',close:'m6 6 12 12M18 6 6 18',
}
export function AssistantIcon({name,className}:{name:IconName;className?:string}) {return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>}
