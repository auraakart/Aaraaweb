/** Re-encode browser images, discard metadata, and keep uploads bounded. */
export async function normaliseComplaintPhoto(file:File):Promise<Blob>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a PNG, JPEG or WebP photo under 10 MiB.')
 const bitmap=await createImageBitmap(file)
 try{
  const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  const context=canvas.getContext('2d');if(!context)throw new Error('Photo processing is unavailable.')
  context.drawImage(bitmap,0,0,canvas.width,canvas.height)
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Photo could not be converted.')),'image/png'))
  const bytes=new Uint8Array(await png.arrayBuffer()),view=new DataView(bytes.buffer),parts:Uint8Array[]=[bytes.slice(0,8)]
  let offset=8
  while(offset<bytes.length){
   if(offset+12>bytes.length)throw new Error('Invalid photo.')
   const end=offset+view.getUint32(offset)+12;if(end>bytes.length)throw new Error('Invalid photo.')
   const type=String.fromCharCode(...bytes.slice(offset+4,offset+8))
   if(['IHDR','IDAT','IEND'].includes(type))parts.push(bytes.slice(offset,end))
   else if((bytes[offset+4]&0x20)===0)throw new Error('Unsupported photo encoding.')
   offset=end
  }
  const result=new Blob(parts as BlobPart[],{type:'image/png'});if(result.size>2*1024*1024)throw new Error('Choose a smaller photo; the processed limit is 2 MiB.')
  return result
 }finally{bitmap.close()}
}

export async function requestComplaintPhoto(accessToken:string,ticketId:string,photoId?:string,body?:FormData){
 const base=(process.env.NEXT_PUBLIC_AARAGATE_API_BASE_URL??'http://localhost:3000').replace(/\/$/,'')
 const path=`/api/v1/helpdesk/review/${encodeURIComponent(ticketId)}/photos${photoId?'/'+encodeURIComponent(photoId):''}`
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${accessToken}`},body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)})
 if(!response.ok)throw new Error(body?'Photo upload could not be confirmed. Retry reuses the same submission.':'Complaint photo is unavailable.')
 if(photoId){
  if(response.headers.get('content-type')?.split(';')[0]!=='image/png')throw new Error('Photo response is invalid.')
  const blob=await response.blob();if(blob.size>2*1024*1024)throw new Error('Photo response is too large.')
  return blob
 }
 return response.json() as Promise<unknown>
}
