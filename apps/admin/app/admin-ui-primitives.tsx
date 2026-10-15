'use client'

export function Header({title,society}:{title:string;society:string}){return <header><small>{society}</small><h1>{title}</h1></header>};export function Metric({label,value}:{label:string;value:number}){return <div className="metric"><span>{label}</span><b>{value}</b></div>};export function MoneyMetric({label,value}:{label:string;value:string}){return <div className="metric"><span>{label}</span><b className="money">{value}</b></div>};export function Badge({text}:{text:string}){return <span className={`badge ${text.toLowerCase()}`}>{text.replaceAll('_',' ')}</span>};export function Empty({text}:{text:string}){return <div className="empty">{text}</div>}

