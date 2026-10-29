export async function rawRequest(url:string,body?:unknown,method='POST'){
 const response=await fetch(url,body===undefined?{cache:'no-store'}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
 const data=await response.json()
 if(!response.ok)throw new Error(data.error??'処理できませんでした')
 return data
}
