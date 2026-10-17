'use client'
import {useEffect,useRef,useState} from 'react'

/** One login attempt owns its inputs, mounted form and original storage context. */
export function useLoginAttempt(storageKey:string){
  const mounted=useRef(false),inFlight=useRef(false),generation=useRef(0)
  const initial=useRef(typeof sessionStorage==='undefined'?null:sessionStorage.getItem(storageKey))
  const[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;inFlight.current=false}},[])
  async function run(task:(current:()=>boolean)=>Promise<boolean|void>){
    if(!mounted.current||inFlight.current)return
    if(sessionStorage.getItem(storageKey)!==initial.current){setError('Sign-in changed. Reopen this sign-in page before continuing.');return}
    const epoch=++generation.current
    const current=()=>mounted.current&&generation.current===epoch&&sessionStorage.getItem(storageKey)===initial.current
    inFlight.current=true;setBusy(true);setError('')
    let accepted=false
    try{accepted=await task(current)===true}
    catch(reason){if(current())setError(reason instanceof Error?reason.message:'Authentication failed')}
    finally{
      if(mounted.current&&generation.current===epoch){
        inFlight.current=false;setBusy(false)
        if(!accepted&&!current())setError('Sign-in changed. Reopen this sign-in page before continuing.')
      }
    }
  }
  return{busy,error,run}
}
